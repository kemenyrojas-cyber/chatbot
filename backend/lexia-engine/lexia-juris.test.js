const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  classifyUserProfile,
  buildCaseFile,
  inferUrgency
} = require('./case-file');
const {
  calculateLexiaScore,
  evaluateCandidate,
  selectBestCandidate
} = require('./lexia-score');
const { buildDualAnalysis } = require('./dual-reasoning');
const {
  createLexiaEngine,
  filterRagContextForIntent,
  resultMatchesNormativeSource
} = require('./orchestrator');
const { createKnowledgeEngine } = require('./knowledge');

const { buildSourceSummary } = createKnowledgeEngine({
  aiEngineRoot: path.resolve(__dirname, '../../ai-engine')
});

const intent = {
  type: { id: 'analisis_caso', label: 'Análisis de caso', confidence: 'alta' },
  area: { id: 'derecho_laboral', label: 'Derecho Laboral', confidence: 'alta' },
  topic: { id: 'despido', label: 'Despido', confidence: 'alta' },
  objective: { id: 'defensa', label: 'Preparar defensa', confidence: 'alta' },
  missingInfo: ['fecha de despido']
};

test('clasifica perfiles jurídicos sin depender de una etiqueta exacta', () => {
  assert.equal(classifyUserProfile('abogado-independiente').id, 'lawyer');
  assert.equal(classifyUserProfile('estudiante-derecho').id, 'student');
  assert.equal(classifyUserProfile('municipalidad').id, 'public-sector');
  assert.equal(classifyUserProfile('usuario').id, 'citizen');
});

test('construye un expediente y no convierte alegaciones en hechos probados', () => {
  const caseFile = buildCaseFile({
    userQuery: 'Me despidieron ayer y tengo una carta y mis boletas.',
    conversationMemory: [{ role: 'user', content: 'Soy trabajador de la empresa.' }],
    intent,
    role: 'abogado-independiente',
    sessionId: 'case-1'
  });

  assert.equal(caseFile.caseId, 'case-1');
  assert.equal(caseFile.userProfile.id, 'lawyer');
  assert.equal(caseFile.proceduralRole.id, 'worker');
  assert.equal(caseFile.confirmedFacts.length, 0);
  assert.equal(caseFile.allegedFacts.length, 2);
  assert.ok(caseFile.evidence.includes('carta'));
  assert.ok(caseFile.evidence.includes('boletas o comprobantes'));
  assert.ok(caseFile.dates.includes('ayer'));
  assert.equal(caseFile.provenance.confirmedFactsRequireEvidence, true);
});

test('detecta señales de urgencia jurídica', () => {
  assert.equal(inferUrgency('Estoy detenido y mañana vence el plazo').level, 'high');
  assert.ok(inferUrgency('Amenazaron de muerte a un menor').signals.includes('personal_safety'));
});

test('las fuentes visibles no exponen archivos ni identificadores internos', () => {
  const summary = buildSourceSummary([{
    titulo: 'Artículo 18',
    fuente: 'ingested_codigo-civil-2026_75ee115a17.md',
    materia: 'Derecho Civil',
    contenido: 'Código Civil artículo 18 sobre derechos de autor.',
    relevance: 95,
    modulo: 'normativa'
  }], {
    topic: { id: 'codigo_civil', label: 'Código Civil' },
    area: { id: 'derecho_civil', label: 'Derecho Civil' }
  });

  assert.doesNotMatch(summary, /ingested_|\.md|base local|LEXIA/i);
  assert.match(summary, /Artículo 18/);
});

test('la recuperación normativa no mezcla Constitución, Código Penal y Código Civil', () => {
  const results = [
    { title: 'Artículo 8', source: 'constitucion-politica-del-peru.pdf', matter: 'Derecho Constitucional' },
    { title: 'Artículo 8', source: 'ingested_codigo-penal.md', matter: 'Derecho Penal' },
    { title: 'Artículo 8', source: 'ingested_codigo-civil.md', matter: 'Derecho Civil' }
  ];
  const cases = (
    [
      ['constitucion', 'constitucion-politica-del-peru.pdf'],
      ['codigo_penal', 'ingested_codigo-penal.md'],
      ['codigo_civil', 'ingested_codigo-civil.md']
    ]
  );

  for (const [sourceId, expectedSource] of cases) {
    const filtered = filterRagContextForIntent({
      context: 'contexto sin filtrar',
      results,
      sources: []
    }, 'consulta normativa', {
      interpretation: { normativeSource: { id: sourceId } }
    });
    assert.equal(filtered.results.length, 1);
    assert.equal(filtered.results[0].source, expectedSource);
    assert.ok(resultMatchesNormativeSource(filtered.results[0], { id: sourceId }));
  }
});

test('LEXIA-SCORE aplica penalizaciones multiplicativas', () => {
  const baseline = calculateLexiaScore({
    profile: 'lawyer',
    legalAccuracy: 0.9,
    sourceFidelity: 0.9,
    documentFidelity: 0.9,
    jurisdictionValidity: 0.9,
    caseComprehension: 0.9,
    practicalUtility: 0.9,
    naturalness: 0.9
  });
  const unsafe = calculateLexiaScore({
    profile: 'lawyer',
    legalAccuracy: 0.9,
    sourceFidelity: 0.9,
    documentFidelity: 0.9,
    jurisdictionValidity: 0.9,
    caseComprehension: 0.9,
    practicalUtility: 0.9,
    naturalness: 0.9,
    hallucinationRate: 0.25,
    severeError: 1
  });

  assert.ok(baseline.score > 0.89);
  assert.ok(unsafe.score < baseline.score * 0.1);
  assert.equal(baseline.calibratedByLawyers, false);
});

test('rechaza por hard gate una cita jurídica no respaldada', () => {
  const evaluation = evaluateCandidate({
    id: 'unsafe',
    answer: 'La respuesta está en [Código Penal, art. 9999].',
    unsupportedArticles: ['9999']
  }, {
    caseFile: buildCaseFile({ userQuery: 'Consulta penal', intent, role: 'usuario' }),
    results: []
  });

  assert.equal(evaluation.hardGate.passed, false);
  assert.ok(evaluation.hardGate.reasons.includes('unsupported_legal_citation'));
});

test('selecciona una respuesta segura aunque la candidata insegura sea más extensa', () => {
  const caseFile = buildCaseFile({
    userQuery: 'Me despidieron y tengo una carta.',
    intent,
    role: 'abogado'
  });
  const selection = selectBestCandidate([
    {
      id: 'provider',
      answer: 'Análisis muy detallado basado en [Código Penal, art. 9999]. Debes presentar varias acciones inmediatamente.',
      unsupportedArticles: ['9999']
    },
    {
      id: 'local-synthesis',
      answer: 'Primero conviene revisar la carta y la fecha del despido. Con esos documentos puede evaluarse la vía laboral aplicable.'
    }
  ], {
    caseFile,
    results: [{ title: 'Referencia laboral', relevance: 80 }]
  });

  assert.equal(selection.selected.id, 'local-synthesis');
  assert.equal(selection.candidates.find(item => item.id === 'provider').hardGate.passed, false);
});

test('LEXIA-SCORE favorece una respuesta que incorpora la corrección y no repite preguntas', () => {
  const dialogue = {
    currentFocus: 'hablo de difamación',
    supersedesPriorInterpretation: true,
    responsePlan: {
      maxQuestions: 1,
      maxParagraphs: 3,
      includeSources: false,
      avoidQuestion: '¿Buscas denunciar, defender a alguien o entender la situación?'
    }
  };
  const selection = selectBestCandidate([
    {
      id: 'conversational',
      answer: 'Entendido, corrijo el enfoque: hablas de difamación. Dejo de lado mi interpretación anterior. ¿Qué afirmación concreta se difundió?'
    },
    {
      id: 'repetitive',
      answer: 'Fuentes y verificación\n\nEsta es una explicación extensa.\n\n¿Buscas denunciar, defender a alguien o entender la situación?\n\n¿Qué deseas hacer?\n\nIndica más datos.'
    }
  ], {
    caseFile: buildCaseFile({ userQuery: 'Hablo de difamación', intent, role: 'usuario' }),
    results: [],
    dialogue
  });

  assert.equal(selection.selected.id, 'conversational');
});

test('LEXIA-SCORE descarta el sobreinterrogatorio cuando ya corresponde analizar', () => {
  const dialogue = {
    currentFocus: 'cuenta bancaria donde llegó el dinero',
    responsePlan: {
      maxQuestions: 0,
      maxParagraphs: 4,
      analysisBeforeQuestion: true,
      analysisReady: true,
      avoidQuestions: [
        '¿Cuándo ocurrió el hecho principal?',
        '¿Buscas denunciar, defender o entender el proceso?'
      ]
    }
  };
  const selection = selectBestCandidate([
    {
      id: 'analysis',
      answer: 'La cuenta bancaria puede servir para rastrear la operación e identificar vínculos, aunque no prueba por sí sola la autoría. Conviene conservar el comprobante original, titular, monto, fecha y número de operación.'
    },
    {
      id: 'interrogation',
      answer: 'Entiendo, incorporo ese dato. ¿En qué fecha exacta ocurrió?'
    }
  ], {
    caseFile: buildCaseFile({
      userQuery: 'Tengo la cuenta donde llegó el dinero de la extorsión.',
      intent: {
        ...intent,
        area: { id: 'derecho_penal', label: 'Derecho Penal', confidence: 'alta' },
        topic: { id: 'extorsion', label: 'Extorsión', confidence: 'alta' }
      },
      role: 'abogado'
    }),
    results: [],
    dialogue
  });

  assert.equal(selection.selected.id, 'analysis');
  assert.ok(selection.candidates.find(item => item.id === 'interrogation').score < selection.candidates.find(item => item.id === 'analysis').score);
});

test('el análisis dual conserva apoyo, riesgos y vacíos probatorios', () => {
  const caseFile = buildCaseFile({
    userQuery: 'Me despidieron y tengo una carta.',
    intent,
    role: 'abogado'
  });
  const analysis = buildDualAnalysis(caseFile, {
    risks: ['posible vencimiento del plazo'],
    legalIssues: ['validez del despido'],
    missingFacts: ['fecha de notificación']
  }, [{
    intelligence: {
      reglas_practicas: ['revisar la causa expresada en la carta'],
      riesgos: ['verificar la vía procesal'],
      documentos: ['boletas de pago']
    }
  }]);

  assert.ok(analysis.issues.includes('validez del despido'));
  assert.ok(analysis.supportiveAnalysis.rules.includes('revisar la causa expresada en la carta'));
  assert.ok(analysis.adverseAnalysis.risks.includes('verificar la vía procesal'));
  assert.ok(analysis.adverseAnalysis.missingEvidence.includes('fecha de notificación'));
  assert.deepEqual(analysis.scenarios, ['favorable', 'probable', 'adverso']);
});

test('el orquestador expone expediente, análisis dual y selección de calidad', async () => {
  let capturedProviderMessages = [];
  const engine = createLexiaEngine({
    brain: {
      interpret: query => ({
        ...intent,
        originalQuery: query,
        conversationMode: { id: 'case_start', label: 'Nuevo caso', deterministic: false },
        interpretation: {
          dialogue: {
            speechAct: 'new_fact',
            responsePlan: {
              maxQuestions: 0,
              analysisBeforeQuestion: true,
              analysisReady: true,
              avoidQuestions: ['¿Cuándo ocurrió?', '¿Qué prueba tienes?']
            }
          }
        },
        concepts: ['despido'],
        complexity: 'media'
      }),
      mergeIntent: current => current,
      buildInterpretationSearchQuery: query => query,
      isGreetingOnly: () => false,
      isConversationalFollowUp: () => false,
      isShortUserInput: () => false
    },
    memory: {
      normalizeMessages: messages => messages,
      buildSearchQuery: query => query,
      buildContext: () => ''
    },
    knowledge: {
      ensureAvailable: async () => {},
      search: () => [{ title: 'Norma laboral', relevance: 90 }],
      evaluateSufficiency: () => ({ localSearchStatus: 'sufficient' }),
      logSufficiency: () => {},
      buildRagContext: () => ({
        context: 'Fuente laboral verificada.',
        results: [{ title: 'Norma laboral', source: 'Fuente oficial', relevance: 90 }],
        sources: [{ id: 'R1', title: 'Norma laboral' }]
      })
    },
    reasoner: {
      buildProfile: () => ({ legalIssues: ['validez del despido'], risks: ['plazo'] }),
      buildContext: () => 'Razonamiento jurídico.',
      buildGraph: () => ({}),
      buildGraphContext: () => ''
    },
    response: {
      buildSystemPrompt: () => 'Responde con prudencia.',
      buildGreetingAnswer: () => 'Hola.',
      buildFollowUpClarificationAnswer: () => 'Aclara el caso.',
      buildLocalAnswer: () => 'Conviene revisar la carta, la fecha y la prueba antes de definir la estrategia laboral.'
    },
    providers: {
      generate: async messages => {
        capturedProviderMessages = messages;
        return ({
        answer: 'En este caso laboral conviene revisar la carta y verificar el plazo antes de presentar una acción.',
        provider: 'mock',
        model: 'mock-model',
        source: 'Mock',
        providerErrors: []
        });
      }
    },
    config: {
      temperature: () => 0.2,
      providerConfig: () => ({}),
      externalProviderRequested: () => true
    }
  });

  const result = await engine.runLegalIntelligence({
    userQuery: 'Me despidieron y tengo una carta.',
    role: 'abogado-independiente',
    sessionId: 'case-2'
  });

  assert.equal(result.metadata.caseFile.caseId, 'case-2');
  assert.equal(result.metadata.caseFile.userProfile.id, 'lawyer');
  assert.ok(result.metadata.dualAnalysis);
  assert.ok(result.metadata.lexiaScore.score100 > 0);
  assert.ok(['provider', 'local-synthesis'].includes(result.metadata.candidateSelection.selected));
  assert.match(capturedProviderMessages[0].content, /CONTROL CONVERSACIONAL OBLIGATORIO/);
  assert.match(capturedProviderMessages[0].content, /Responde primero al último turno/);
  assert.match(capturedProviderMessages[0].content, /Está prohibido responder solo con acuse de recibo y otra pregunta/);
  assert.match(capturedProviderMessages[0].content, /no cierres con otra pregunta/);
  assert.match(capturedProviderMessages[0].content, /No los reformules con otras palabras/);
});

test('el orquestador sintetiza todas las consultas de apoyo antes de responder', async () => {
  let synthesisInput = null;
  const engine = createLexiaEngine({
    brain: {
      interpret: query => ({
        ...intent,
        originalQuery: query,
        conversationMode: { id: 'case_start', label: 'Nuevo caso', deterministic: false },
        interpretation: { dialogue: { speechAct: 'question', responsePlan: { maxQuestions: 0 } } },
        concepts: ['despido'],
        complexity: 'media'
      }),
      mergeIntent: current => current,
      buildInterpretationSearchQuery: query => query,
      isGreetingOnly: () => false,
      isConversationalFollowUp: () => false,
      isShortUserInput: () => false
    },
    memory: {
      normalizeMessages: messages => messages,
      buildSearchQuery: query => query,
      buildContext: () => ''
    },
    knowledge: {
      ensureAvailable: async () => {},
      search: () => [{ title: 'Norma laboral', source: 'Fuente oficial', relevance: 90 }],
      evaluateSufficiency: () => ({ localSearchStatus: 'sufficient' }),
      logSufficiency: () => {},
      buildRagContext: () => ({
        context: 'Fuente laboral verificada.',
        results: [{ title: 'Norma laboral', source: 'Fuente oficial', relevance: 90 }],
        sources: [{ id: 'R1', title: 'Norma laboral' }]
      })
    },
    reasoner: {
      buildProfile: () => ({ legalIssues: ['validez del despido'], risks: ['plazo'] }),
      buildContext: () => 'Razonamiento jurídico.',
      buildGraph: () => ({}),
      buildGraphContext: () => ''
    },
    response: {
      buildSystemPrompt: () => 'Responde con prudencia.',
      buildGreetingAnswer: () => 'Hola.',
      buildFollowUpClarificationAnswer: () => 'Aclara el caso.',
      buildLocalAnswer: () => 'La fuente local exige revisar la carta y la fecha del despido.'
    },
    providers: {
      generate: async () => ({
        answer: 'Respuesta primaria.',
        provider: 'groq',
        model: 'groq-model',
        source: 'Groq',
        providerStrategy: 'ensemble',
        providerErrors: [],
        providerChecks: [
          { provider: 'groq', model: 'groq-model' },
          { provider: 'cerebras', model: 'cerebras-model' }
        ],
        consultations: [
          { provider: 'groq', model: 'groq-model', answer: 'Revisa la carta y el plazo.' },
          { provider: 'cerebras', model: 'cerebras-model', answer: 'Distingue causa y fecha del despido.' }
        ]
      }),
      synthesize: async (_messages, options) => {
        synthesisInput = options;
        return {
          answer: 'Conviene revisar la carta, la causa y la fecha antes de definir la acción.',
          provider: 'groq',
          model: 'groq-model',
          source: 'LEXIA Integrated Consultation',
          consultedProviders: ['groq', 'cerebras']
        };
      }
    },
    config: {
      temperature: () => 0.2,
      providerConfig: () => ({}),
      externalProviderRequested: () => true
    }
  });

  const result = await engine.runLegalIntelligence({
    userQuery: '¿Qué debo revisar después de un despido?',
    role: 'abogado-independiente'
  });

  assert.deepEqual(
    synthesisInput.consultations.map(item => item.provider),
    ['groq', 'cerebras']
  );
  assert.match(synthesisInput.localSynthesis, /fuente local/i);
  assert.deepEqual(
    result.metadata.consultationSynthesis.consultedProviders,
    ['groq', 'cerebras']
  );
  assert.equal(result.metadata.providerStrategy, 'ensemble');
});
