function unique(values = [], limit = 8) {
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))].slice(0, limit);
}

function collectIntelligence(results = [], field, limit = 5) {
  const values = [];
  for (const result of results) {
    const intelligence = result?.intelligence || result?.inteligencia || {};
    const items = Array.isArray(intelligence[field]) ? intelligence[field] : [];
    values.push(...items);
  }
  return unique(values, limit);
}

function buildDualAnalysis(caseFile = {}, reasoningProfile = {}, results = []) {
  const rules = collectIntelligence(results, 'reglas_practicas');
  const risks = unique([
    ...(reasoningProfile?.risks || []),
    ...collectIntelligence(results, 'riesgos')
  ]);
  const evidence = unique([
    ...(caseFile.evidence || []),
    ...(reasoningProfile?.documents || []),
    ...collectIntelligence(results, 'documentos')
  ]);
  const missing = unique([
    ...(caseFile.criticalMissingFacts || []),
    ...(reasoningProfile?.missingFacts || [])
  ]);
  const issues = unique([
    ...(reasoningProfile?.legalIssues || []),
    ...(reasoningProfile?.issues || []),
    caseFile.legalTopic?.label
  ]);

  return {
    issues,
    supportiveAnalysis: {
      rules,
      availableEvidence: caseFile.evidence || [],
      instruction: 'Construir el argumento jurídicamente más fuerte compatible con los hechos y las fuentes disponibles.'
    },
    adverseAnalysis: {
      risks,
      missingEvidence: missing,
      instruction: 'Construir el mejor contraargumento posible y señalar excepciones, objeciones y vacíos probatorios.'
    },
    evidenceToReview: evidence,
    scenarios: ['favorable', 'probable', 'adverso'],
    requiresQualifiedLanguage: true
  };
}

function buildDualAnalysisContext(analysis = {}) {
  return [
    'CONTROL DE RAZONAMIENTO DUAL LEXIA-JURIS:',
    `Problemas jurídicos: ${(analysis.issues || []).join('; ') || 'por determinar'}.`,
    `Apoyo disponible: ${(analysis.supportiveAnalysis?.rules || []).join('; ') || 'sin regla específica verificada'}.`,
    `Riesgos y contraargumentos: ${(analysis.adverseAnalysis?.risks || []).join('; ') || 'por evaluar'}.`,
    `Vacíos de prueba o información: ${(analysis.adverseAnalysis?.missingEvidence || []).join('; ') || 'ninguno detectado'}.`,
    'Antes de responder, contrasta internamente el argumento favorable con el mejor argumento contrario.',
    'No muestres cadena de pensamiento. Expón solo conclusión, razones principales, riesgos, evidencia necesaria y nivel de incertidumbre.',
    'No prometas resultados. Si el caso admite más de una salida, diferencia escenario favorable, probable y adverso.'
  ].join('\n');
}

module.exports = {
  buildDualAnalysis,
  buildDualAnalysisContext
};
