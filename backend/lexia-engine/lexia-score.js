const DEFAULT_WEIGHTS = {
  legalAccuracy: 0.22,
  sourceFidelity: 0.18,
  documentFidelity: 0.15,
  jurisdictionValidity: 0.12,
  caseComprehension: 0.13,
  practicalUtility: 0.12,
  naturalness: 0.08
};

const PROFILE_WEIGHTS = {
  lawyer: {
    legalAccuracy: 0.24,
    sourceFidelity: 0.19,
    documentFidelity: 0.17,
    jurisdictionValidity: 0.12,
    caseComprehension: 0.12,
    practicalUtility: 0.11,
    naturalness: 0.05
  },
  student: {
    legalAccuracy: 0.22,
    sourceFidelity: 0.16,
    documentFidelity: 0.10,
    jurisdictionValidity: 0.12,
    caseComprehension: 0.12,
    practicalUtility: 0.13,
    naturalness: 0.15
  },
  'public-sector': {
    legalAccuracy: 0.23,
    sourceFidelity: 0.22,
    documentFidelity: 0.18,
    jurisdictionValidity: 0.15,
    caseComprehension: 0.10,
    practicalUtility: 0.08,
    naturalness: 0.04
  },
  citizen: DEFAULT_WEIGHTS
};

function clamp(value, min = 0, max = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function weightedGeometricMean(dimensions, weights) {
  return Math.exp(Object.entries(weights).reduce((sum, [key, weight]) => {
    return sum + weight * Math.log(Math.max(0.001, clamp(dimensions[key])));
  }, 0));
}

function calculateLexiaScore(input = {}) {
  const dimensions = {
    legalAccuracy: clamp(input.legalAccuracy),
    sourceFidelity: clamp(input.sourceFidelity),
    documentFidelity: clamp(input.documentFidelity),
    jurisdictionValidity: clamp(input.jurisdictionValidity),
    caseComprehension: clamp(input.caseComprehension),
    practicalUtility: clamp(input.practicalUtility),
    naturalness: clamp(input.naturalness)
  };
  const profile = input.profile || 'citizen';
  const weights = PROFILE_WEIGHTS[profile] || DEFAULT_WEIGHTS;
  const hallucinationRate = clamp(input.hallucinationRate);
  const contradictionRate = clamp(input.contradictionRate);
  const severeError = clamp(input.severeError);
  const base = weightedGeometricMean(dimensions, weights);
  const score = base
    * Math.pow(1 - hallucinationRate, 3)
    * Math.pow(1 - contradictionRate, 2)
    * Math.exp(-2 * severeError);

  return {
    score: clamp(score),
    score100: Number((clamp(score) * 100).toFixed(2)),
    dimensions,
    penalties: { hallucinationRate, contradictionRate, severeError },
    weights,
    profile,
    formulaVersion: 'LEXIA-SCORE-1.0',
    calibratedByLawyers: false
  };
}

function normalizeText(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function termCoverage(answer, values = []) {
  const text = normalizeText(answer);
  const terms = values
    .flatMap(value => normalizeText(value).split(' '))
    .filter(term => term.length >= 5);
  const uniqueTerms = [...new Set(terms)].slice(0, 20);
  if (!uniqueTerms.length) return 0.65;
  return uniqueTerms.filter(term => text.includes(term)).length / uniqueTerms.length;
}

function questionSlot(value = '') {
  const text = normalizeText(value);
  const slots = [
    ['time', /\b(cuando|fecha|que dia|momento)\b/],
    ['goal', /\b(denunciar|defender|entender|resultado|objetivo|que necesitas)\b/],
    ['procedural_status', /\b(denuncia|citacion|notificacion|estado del proceso|etapa)\b/],
    ['evidence', /\b(prueba|documento|mensaje|audio|video|captura|testigo|dato)\b/],
    ['safety', /\b(amenaza|a salvo|riesgo|peligro|agresion)\b/],
    ['role', /\b(victima|investigad|condenad|defensa|demandante|demandado)\b/]
  ];
  return slots.find(([, pattern]) => pattern.test(text))?.[0] || '';
}

function estimateCandidateMetrics(candidate = {}, context = {}) {
  const answer = String(candidate.answer || '').trim();
  const results = Array.isArray(context.results) ? context.results : [];
  const caseFile = context.caseFile || {};
  const dialogue = context.dialogue || {};
  const responsePlan = dialogue.responsePlan || {};
  const unsupportedArticles = candidate.unsupportedArticles || [];
  const citedReferences = answer.match(/\[[^\]]*(?:art\.?|ley|código|constitución)[^\]]*\]/gi) || [];
  const actionSignals = (answer.match(/\b(recomiendo|conviene|debes|puedes|paso|documento|plazo|verificar|solicitar|presentar)\b/gi) || []).length;
  const uncertaintySignals = (answer.match(/\b(podría|depende|habría que|siempre que|no puedo confirmar|debe verificarse|según)\b/gi) || []).length;
  const paragraphCount = answer.split(/\n\s*\n/).filter(Boolean).length;
  const questionCount = (answer.match(/[?]/g) || []).length;
  const focusCoverage = dialogue.currentFocus ? termCoverage(answer, [dialogue.currentFocus]) : 0.65;
  const avoidedQuestion = normalizeText(responsePlan.avoidQuestion || '');
  const repeatsAnsweredQuestion = Boolean(avoidedQuestion && normalizeText(answer).includes(avoidedQuestion));
  const answerQuestions = answer.match(/[^¿?]*\?/g) || [];
  const avoidedQuestions = [
    responsePlan.avoidQuestion,
    ...(Array.isArray(responsePlan.avoidQuestions) ? responsePlan.avoidQuestions : [])
  ].filter(Boolean);
  const avoidedSlots = new Set(avoidedQuestions.map(questionSlot).filter(Boolean));
  const repeatsCoveredQuestion = answerQuestions.some(question => {
    const normalizedQuestion = normalizeText(question);
    if (avoidedQuestions.some(avoided => normalizedQuestion === normalizeText(avoided))) return true;
    const slot = questionSlot(question);
    return Boolean(slot && avoidedSlots.has(slot));
  });
  const exceedsQuestionBudget = questionCount > Number(responsePlan.maxQuestions ?? 1);
  const questionWithoutAnalysis = Boolean(
    responsePlan.analysisBeforeQuestion
    && questionCount > 0
    && actionSignals === 0
    && answer.length < 280
  );
  const revealsInternalProcess = /\b(rag|embedding|prompt(?:s)?|memoria interna|contexto recuperado|proveedor(?:es)?|modelo(?:s)? de ia|consultor(?:es)? interno|puntaje interno|lexia-score)\b/i.test(answer);
  const unwantedSourceBlock = responsePlan.includeSources === false
    && /\b(fuentes y verificacion|fuente usada|base legal|referencia normativa)\b/i.test(normalizeText(answer));
  const missesCorrection = Boolean(
    dialogue.supersedesPriorInterpretation
    && focusCoverage < 0.35
    && !/\b(corrijo|entendido|dejo de lado|tomo tu precision)\b/i.test(normalizeText(answer))
  );
  const sourceFidelity = unsupportedArticles.length
    ? 0.05
    : (citedReferences.length ? Math.min(1, 0.82 + results.length * 0.03) : (results.length ? 0.72 : 0.58));
  const caseCoverage = termCoverage(answer, [
    caseFile.legalArea?.label,
    caseFile.legalTopic?.label,
    caseFile.proceduralRole?.label,
    ...(caseFile.allegedFacts || []).slice(-2)
  ]);
  const documentFidelity = (caseFile.evidence || []).length
    ? clamp(0.55 + termCoverage(answer, caseFile.evidence) * 0.45)
    : 0.72;
  const retrievalQuality = results.length
    ? clamp(0.68 + Math.min(results.length, 6) * 0.04)
    : 0.58;

  return {
    legalAccuracy: clamp(retrievalQuality * 0.65 + sourceFidelity * 0.35),
    sourceFidelity,
    documentFidelity,
    jurisdictionValidity: /\b(peru|perú|peruano|peruana)\b/i.test(answer) || caseFile.jurisdiction === 'Perú' ? 0.9 : 0.7,
    caseComprehension: clamp(0.45 + caseCoverage * 0.3 + focusCoverage * 0.25),
    practicalUtility: clamp(0.48 + Math.min(actionSignals, 5) * 0.09),
    naturalness: clamp(
      0.58
      + (answer.length >= 80 && answer.length <= 2200 ? 0.15 : 0)
      + (paragraphCount >= 1 && paragraphCount <= 8 ? 0.12 : 0)
      + (uncertaintySignals ? 0.08 : 0)
      - (exceedsQuestionBudget ? 0.3 : 0)
      - (paragraphCount > Number(responsePlan.maxParagraphs || 8) ? 0.25 : 0)
      - (repeatsAnsweredQuestion || repeatsCoveredQuestion ? 0.35 : 0)
      - (questionWithoutAnalysis ? 0.3 : 0)
      - (revealsInternalProcess ? 0.45 : 0)
      - (unwantedSourceBlock ? 0.2 : 0)
    ),
    hallucinationRate: unsupportedArticles.length ? 1 : 0,
    contradictionRate: clamp(Math.max(
      Number(candidate.contradictionRate || 0),
      repeatsAnsweredQuestion || repeatsCoveredQuestion ? 0.8 : 0,
      exceedsQuestionBudget ? 0.7 : 0,
      questionWithoutAnalysis ? 0.7 : 0,
      missesCorrection ? 0.7 : 0
    )),
    severeError: unsupportedArticles.length || revealsInternalProcess ? 1 : clamp(Number(candidate.severeError || 0))
  };
}

function evaluateCandidate(candidate = {}, context = {}) {
  const metrics = estimateCandidateMetrics(candidate, context);
  const quality = calculateLexiaScore({
    ...metrics,
    profile: context.caseFile?.userProfile?.id || 'citizen'
  });
  const hardGate = {
    passed: quality.penalties.severeError === 0
      && quality.penalties.hallucinationRate <= 0.02,
    reasons: []
  };
  if (quality.penalties.severeError > 0) hardGate.reasons.push('severe_legal_error');
  if (quality.penalties.hallucinationRate > 0.02) hardGate.reasons.push('unsupported_legal_citation');
  return {
    id: candidate.id || 'candidate',
    answer: String(candidate.answer || ''),
    quality,
    hardGate
  };
}

function selectBestCandidate(candidates = [], context = {}) {
  const evaluated = candidates
    .filter(candidate => String(candidate?.answer || '').trim())
    .map(candidate => evaluateCandidate(candidate, context));
  const eligible = evaluated.filter(candidate => candidate.hardGate.passed);
  const ranked = (eligible.length ? eligible : evaluated)
    .sort((a, b) => b.quality.score - a.quality.score);
  return {
    selected: ranked[0] || null,
    candidates: evaluated.map(candidate => ({
      id: candidate.id,
      score: candidate.quality.score100,
      hardGate: candidate.hardGate
    })),
    formulaVersion: 'LEXIA-SCORE-1.0'
  };
}

module.exports = {
  DEFAULT_WEIGHTS,
  PROFILE_WEIGHTS,
  calculateLexiaScore,
  estimateCandidateMetrics,
  evaluateCandidate,
  selectBestCandidate
};
