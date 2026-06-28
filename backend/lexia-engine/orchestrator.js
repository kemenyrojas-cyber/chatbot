const { buildCaseFile, buildCaseFileContext } = require('./case-file');
const { buildDualAnalysis, buildDualAnalysisContext } = require('./dual-reasoning');
const { evaluateCandidate, selectBestCandidate } = require('./lexia-score');

function extractArticleNumbers(text) {
  const matches = String(text || '').matchAll(/\bart(?:iculo|ículo)?\.?\s*(\d+[a-z]?)/gi);
  return [...new Set([...matches].map(match => String(match[1] || '').toLowerCase()))];
}

function validateAnswerAgainstSources(answer, results = [], localSynthesis = '') {
  const citedArticles = extractArticleNumbers(answer);
  if (!citedArticles.length) {
    return { ok: true, unsupportedArticles: [] };
  }

  const sourceText = [
    localSynthesis,
    ...results.map(item => [
      item?.title,
      item?.titulo,
      item?.content,
      item?.contenido,
      item?.excerpt,
      item?.resumen
    ].filter(Boolean).join(' '))
  ].join(' ');
  const supportedArticles = new Set(extractArticleNumbers(sourceText));
  const unsupportedArticles = citedArticles.filter(article => !supportedArticles.has(article));

  return {
    ok: unsupportedArticles.length === 0,
    unsupportedArticles
  };
}

function normalizeScopeText(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const legalCaseScopeRules = [
  { id: 'minor_abuse', pattern: /\b(menor|menores|nino|nina|adolescente|abuso sexual|violacion sexual|tocamientos|actos libidinosos|revictimizacion|ley 30403|176 a|articulo 173)\b/ },
  { id: 'partner_violence', pattern: /\b(pareja|conviviente|ex pareja|expareja|esposo|esposa|enamorado|enamorada|violencia familiar|violencia contra la mujer|agresion|agredio|golpe|golpes|lesiones|amenaza|amenazas)\b/ },
  { id: 'homicide', pattern: /\b(homicidio|asesinato|asesinad[oa]s?|asesinaron|mataron|mato|matar|muerte violenta|sicariato)\b/ },
  { id: 'extortion', pattern: /\b(extorsion|extorsionad[oa]s?|extorsionando|chantaje|chantajeando|cobro de cupos|amenaza para pagar|exigen dinero|me estan cobrando cupo)\b/ },
  { id: 'robbery_theft', pattern: /\b(robo|robaron|asalto|asaltaron|hurto|sustraccion|me quitaron|me arrebataron)\b/ },
  { id: 'fraud', pattern: /\b(estafa|estafaron|fraude|engano|enganaron|fraudulento)\b/ },
  { id: 'defamation', pattern: /\b(difamacion|injuria|calumnia|me difaman|publicaron mentiras)\b/ },
  { id: 'labor_dismissal', pattern: /\b(despido|despedido|despedida|despidieron|carta de despido|me botaron del trabajo)\b/ },
  { id: 'labor_benefits', pattern: /\b(beneficios sociales|cts|gratificacion|vacaciones|liquidacion|sueldo|salario|remuneracion)\b/ },
  { id: 'consumer_education', pattern: /\b(consumidor|indecopi|universidad|instituto|colegio|servicio educativo|matricula|pension|cobro|proveedor|libro de reclamaciones)\b/ },
  { id: 'property', pattern: /\b(terreno|predio|inmueble|posesion|propiedad|vecino|lindero|partida registral|titulo de propiedad)\b/ },
  { id: 'family_alimony', pattern: /\b(alimentos|pension alimenticia|pension de alimentos|demanda de alimentos)\b/ },
  { id: 'family_divorce', pattern: /\b(divorcio|separacion|separarme|divorciarme)\b/ },
  { id: 'custody', pattern: /\b(tenencia|custodia|visitas|regimen de visitas|patria potestad)\b/ },
  { id: 'contract', pattern: /\b(contrato|incumplimiento|clausula|compraventa|arrendamiento|alquiler|obligacion contractual)\b/ },
  { id: 'constitutional', pattern: /\b(amparo|habeas corpus|habeas data|constitucion|derecho fundamental|debido proceso|derecho de defensa)\b/ }
];

function detectLegalCaseScopes(text = '') {
  const normalized = normalizeScopeText(text);
  return legalCaseScopeRules.filter(rule => rule.pattern.test(normalized)).map(rule => rule.id);
}

function areLegalCaseScopesCompatible(currentScopes = [], resultScopes = []) {
  if (!currentScopes.length || !resultScopes.length) return true;
  return currentScopes.some(scope => resultScopes.includes(scope));
}

function detectRagResultScopes(item = {}) {
  return detectLegalCaseScopes([
    item.title,
    item.source,
    item.module,
    item.matter,
    item.excerpt
  ].filter(Boolean).join(' '));
}

function resultLooksLikeArea(item = {}, areaId = '') {
  const text = normalizeScopeText([
    item.title,
    item.source,
    item.module,
    item.matter,
    item.excerpt
  ].filter(Boolean).join(' '));
  if (areaId === 'derecho_penal') return /\b(derecho penal|codigo penal|delito|denuncia penal|fiscalia|ministerio publico|pena|prision)\b/.test(text);
  if (areaId === 'derecho_laboral') return /\b(derecho laboral|trabajador|empleador|despido|beneficios sociales|cts|gratificacion|vacaciones|remuneracion)\b/.test(text);
  if (areaId === 'derecho_consumidor') return /\b(consumidor|indecopi|proveedor|servicio educativo|universidad|matricula|pension|libro de reclamaciones)\b/.test(text);
  if (areaId === 'derecho_civil') return /\b(derecho civil|contrato|compraventa|propiedad|posesion|inmueble|obligacion|arrendamiento)\b/.test(text);
  if (areaId === 'derecho_familia') return /\b(derecho de familia|alimentos|divorcio|tenencia|custodia|visitas|patria potestad)\b/.test(text);
  if (areaId === 'derecho_constitucional') return /\b(constitucion|constitucional|amparo|habeas corpus|habeas data|derecho fundamental|debido proceso)\b/.test(text);
  return false;
}

function resultLooksLikeDifferentKnownArea(item = {}, areaId = '') {
  return ['derecho_penal', 'derecho_laboral', 'derecho_consumidor', 'derecho_civil', 'derecho_familia', 'derecho_constitucional']
    .filter(candidate => candidate !== areaId)
    .some(candidate => resultLooksLikeArea(item, candidate));
}

function rebuildRagContext(results = []) {
  if (!results.length) return { context: '', results: [], sources: [] };
  const lines = [
    'CONTEXTO RAG RECUPERADO DE LA BASE LOCAL DE LEXIA:',
    'Usa estas referencias solo como apoyo. Primero responde al caso y al último mensaje del usuario; no conviertas la respuesta en un resumen de fuentes.'
  ];
  results.forEach((item, index) => {
    const sourceId = `R${index + 1}`;
    const matter = item.matter ? ` | Materia: ${item.matter}` : '';
    const url = item.url ? ` | URL: ${item.url}` : '';
    lines.push('');
    lines.push(`[${sourceId}] ${item.title} | Fuente: ${item.source} | Tipo: ${item.module}${matter}${url}`);
    lines.push(String(item.content || item.excerpt || '').replace(/\s+/g, ' ').trim().slice(0, 900));
  });
  return {
    context: lines.join('\n'),
    results,
    sources: results.map((item, index) => ({
      id: `R${index + 1}`,
      title: item.title,
      source: item.source,
      module: item.module,
      matter: item.matter,
      url: item.url,
      relevance: item.relevance
    }))
  };
}

function filterRagContextForIntent(ragContext, query, intent) {
  const currentScopes = detectLegalCaseScopes([
    query,
    intent?.topic?.id,
    intent?.topic?.label,
    intent?.area?.label
  ].filter(Boolean).join(' '));
  if (!currentScopes.length) return ragContext;
  let results = (ragContext?.results || []).filter(item => {
    const resultScopes = detectRagResultScopes(item);
    return areLegalCaseScopesCompatible(currentScopes, resultScopes);
  });
  const areaId = intent?.area?.confidence === 'alta' ? intent.area.id : '';
  if (areaId) {
    const areaFiltered = results.filter(item => resultLooksLikeArea(item, areaId) || !resultLooksLikeDifferentKnownArea(item, areaId));
    if (areaFiltered.length) results = areaFiltered;
  }
  return results.length === (ragContext?.results || []).length ? ragContext : rebuildRagContext(results);
}

function createLexiaEngine(deps) {
  const {
    brain,
    memory,
    knowledge,
    reasoner,
    response,
    providers,
    config
  } = deps;

  async function runLegalIntelligence(options = {}) {
    const userQuery = String(options.userQuery || '').trim();
    const prompt = String(options.prompt || `Consulta del usuario:\n${userQuery}`);
    const conversationMemory = memory.normalizeMessages(options.conversationMemory || []);
    const memorySearchQuery = memory.buildSearchQuery(userQuery, conversationMemory);
    const currentIntent = await brain.interpret(userQuery, conversationMemory);
    const memoryIntent = await brain.interpret(memorySearchQuery, conversationMemory);
    const intent = brain.mergeIntent(currentIntent, memoryIntent);
    const effectiveConversationMemory = (intent?.interpretation?.topicShift || intent?.interpretation?.ignoredMemory) ? [] : conversationMemory;
    const conversationMemoryContext = memory.buildContext(effectiveConversationMemory, intent);
    const caseFile = buildCaseFile({
      userQuery,
      conversationMemory: effectiveConversationMemory,
      intent,
      role: options.role,
      sessionId: options.sessionId,
      existingCaseFile: options.caseFile
    });
    const caseFileContext = buildCaseFileContext(caseFile);

    if (brain.isGreetingOnly(userQuery)) {
      return {
        answer: response.buildGreetingAnswer(),
        intent,
        results: [],
        ragSources: [],
        source: 'LEXIA',
        fallback: false,
        model: 'local-greeting',
        provider: 'local',
        metadata: {
          model: 'local-greeting',
          source: 'LEXIA',
          caseFile,
          engineStage: 'brain:greeting'
        }
      };
    }

    if (brain.isConversationalFollowUp(userQuery) && !conversationMemory.length) {
      return {
        answer: response.buildFollowUpClarificationAnswer(),
        intent: currentIntent,
        results: [],
        ragSources: [],
        source: 'LEXIA',
        fallback: false,
        model: 'local-follow-up',
        provider: 'local',
        metadata: {
          model: 'local-follow-up',
          source: 'LEXIA',
          caseFile,
          engineStage: 'brain:needs_context'
        }
      };
    }

    await knowledge.ensureAvailable();

    const searchMemoryBase = intent?.interpretation?.topicShift ? userQuery : memorySearchQuery;
    const interpretationSearchQuery = brain.buildInterpretationSearchQuery(userQuery, intent, searchMemoryBase);
    const localResults = knowledge.search(interpretationSearchQuery);
    const localSearchEvaluation = knowledge.evaluateSufficiency(interpretationSearchQuery, localResults);
    knowledge.logSufficiency('Lexia Engine', interpretationSearchQuery, localSearchEvaluation);

    const dialogueMode = effectiveConversationMemory.length > 0 || brain.isShortUserInput(userQuery);
    const ragContext = filterRagContextForIntent(
      knowledge.buildRagContext(interpretationSearchQuery, localResults, dialogueMode ? 3 : 8),
      userQuery,
      intent
    );
    const legalReasoningProfile = reasoner.buildProfile(userQuery, intent, effectiveConversationMemory, ragContext.results);
    const legalReasoningContext = reasoner.buildContext(legalReasoningProfile);
    const legalGraphReasoning = reasoner.buildGraph(intent, ragContext.results);
    const legalGraphContext = reasoner.buildGraphContext(legalGraphReasoning);
    const dualAnalysis = buildDualAnalysis(caseFile, legalReasoningProfile, ragContext.results);
    const dualAnalysisContext = buildDualAnalysisContext(dualAnalysis);
    const temperature = config.temperature();
    const localSynthesis = response.buildLocalAnswer(
      userQuery,
      intent,
      ragContext.results,
      legalReasoningProfile,
      legalGraphReasoning,
      effectiveConversationMemory
    );

    if (intent?.conversationMode?.deterministic) {
      const localEvaluation = evaluateCandidate({
        id: 'local-synthesis',
        answer: localSynthesis
      }, {
        caseFile,
        results: ragContext.results
      });
      return {
        answer: localSynthesis,
        intent,
        results: ragContext.results,
        ragSources: ragContext.sources,
        source: 'LEXIA Conversational Controller',
        fallback: false,
        model: 'local-conversation-controller',
        provider: 'local',
        retrieval: {
          mode: 'rag',
          results: ragContext.results.length,
          memoryMessages: effectiveConversationMemory.length
        },
        metadata: {
          model: 'local-conversation-controller',
          source: 'LEXIA Conversational Controller',
          ragSources: ragContext.sources,
          localSynthesis,
          memoryMessages: effectiveConversationMemory.length,
          localSearchEvaluation,
          legalReasoningProfile,
          legalGraphReasoning,
          caseFile,
          dualAnalysis,
          lexiaScore: localEvaluation.quality,
          candidateSelection: {
            selected: 'local-synthesis',
            candidates: [{ id: 'local-synthesis', score: localEvaluation.quality.score100, hardGate: localEvaluation.hardGate }]
          },
          legalInterpretation: intent,
          conversationMode: intent.conversationMode,
          providerErrors: [],
          providerStrategy: 'controlled',
          providerChecks: [],
          engineStage: `conversation:${intent.conversationMode.id}`
        }
      };
    }

    const dialogueInstruction = dialogueMode
      ? [
          'MODO DIÁLOGO:',
          'El usuario está conversando o aclarando el caso. Prioriza entender y responder el último mensaje.',
          `Modo conversacional detectado: ${intent?.conversationMode?.label || 'No determinado'}.`,
          'Interpreta referencias como "eso", "las leyes", "qué hago" o "explícame" usando el hilo anterior.',
          'No repitas estructura previa. No hagas resumen de fuentes salvo que el usuario pida base legal.',
          'Responde como chat humano con una abogada: natural, breve, interactivo y sin convertir todo en subtítulos.',
          'Usa **negrita** dentro de frases naturales solo para la idea clave, el riesgo, la base legal o el siguiente paso.',
          'Haz como máximo una pregunta concreta.'
        ].join('\n')
      : '';
    const lexiaSynthesisContext = [
      'SÍNTESIS JURÍDICA INTERNA DE LEXIA:',
      localSynthesis,
      '',
      'REGLAS DE FIDELIDAD DE FUENTES:',
      '- Usa esta síntesis como criterio base. No la reemplaces por una respuesta genérica.',
      '- No cites números de artículos, leyes, expedientes, casaciones ni sentencias que no aparezcan explícitamente en el contexto RAG o en esta síntesis.',
      '- Si el contexto solo identifica una garantía o norma general, dilo así; no completes con memoria externa.',
      '- Si una fuente RAG concreta contradice tu conocimiento general, prioriza la fuente RAG.',
      '- Cuando fundamentes una afirmación jurídica importante, muestra la norma entre corchetes, por ejemplo [Código Penal, art. 200]. Solo usa corchetes si esa norma aparece en el RAG, en esta síntesis o en el mensaje del usuario.',
      '- Mejora la redacción, pero conserva el sentido jurídico y las fuentes verificadas.',
      '- Mantén la respuesta escaneable, pero conversacional: respuesta directa, explicación breve, paso útil y una sola pregunta final.'
    ].join('\n');
    const context = dialogueMode
      ? [dialogueInstruction, conversationMemoryContext, caseFileContext, legalReasoningContext, dualAnalysisContext, ragContext.context, lexiaSynthesisContext].filter(Boolean).join('\n\n')
      : [conversationMemoryContext, caseFileContext, legalReasoningContext, legalGraphContext, dualAnalysisContext, ragContext.context, lexiaSynthesisContext].filter(Boolean).join('\n\n');
    const intentContext = [
      'INTENCIÓN JURÍDICA DETECTADA:',
      `Tipo: ${intent.type.label}`,
      `Área: ${intent.area.label}`,
      `Tema: ${intent.topic.label}`,
      `Objetivo: ${intent.objective?.label || 'No determinado'}`,
      `Complejidad: ${intent.complexity || 'baja'}`,
      `Conceptos relacionados: ${(intent.concepts || []).join(', ') || 'no identificados'}`,
      `Datos faltantes: ${(intent.missingInfo || []).join(', ') || 'sin faltantes críticos'}`,
      `Confianza: tipo=${intent.type.confidence}, área=${intent.area.confidence}, tema=${intent.topic.confidence}`
    ].join('\n');

    const messages = [
      {
        role: 'system',
        content: response.buildSystemPrompt() + '\n\n' + intentContext + (context ? '\n\n' + context : '')
      },
      ...effectiveConversationMemory.map(message => ({
        role: message.role,
        content: message.content
      })),
      {
        role: 'user',
        content: prompt
      }
    ];

    const providerResult = await providers.generate(messages, {
      temperature,
      providerConfig: options.providerConfig || (typeof config.providerConfig === 'function' ? config.providerConfig() : undefined)
    });
    if (!providerResult.answer) {
      const localEvaluation = evaluateCandidate({
        id: 'local-synthesis',
        answer: localSynthesis
      }, {
        caseFile,
        results: ragContext.results
      });
      return {
        answer: localSynthesis,
        intent,
        results: ragContext.results,
        ragSources: ragContext.sources,
        source: config.externalProviderRequested()
          ? 'LEXIA Integrated Reasoning (provider unavailable)'
          : 'LEXIA Integrated Reasoning',
        fallback: true,
        model: 'local-rag-engine',
        provider: 'local',
        providerError: providerResult.providerErrors?.[0]?.error || null,
        providerCode: providerResult.providerErrors?.[0]?.code || null,
        retrieval: {
          mode: 'rag',
          results: ragContext.results.length,
          memoryMessages: effectiveConversationMemory.length
        },
        metadata: {
          model: 'local-rag-engine',
          source: 'LEXIA RAG Local',
          ragSources: ragContext.sources,
          providerErrors: providerResult.providerErrors,
          providerStrategy: providerResult.providerStrategy || 'fallback',
          reasoning: providerResult.reasoning,
          localSynthesis,
          memoryMessages: effectiveConversationMemory.length,
          localSearchEvaluation,
          legalReasoningProfile,
          legalGraphReasoning,
          caseFile,
          dualAnalysis,
          lexiaScore: localEvaluation.quality,
          candidateSelection: {
            selected: 'local-synthesis',
            candidates: [{ id: 'local-synthesis', score: localEvaluation.quality.score100, hardGate: localEvaluation.hardGate }]
          },
          legalInterpretation: intent,
          conversationMode: intent.conversationMode,
          engineStage: config.externalProviderRequested() ? 'local:synthesis_after_provider_failure' : 'local:synthesis'
        }
      };
    }

    const sourceValidation = validateAnswerAgainstSources(providerResult.answer, ragContext.results, localSynthesis);
    if (!sourceValidation.ok) {
      const selection = selectBestCandidate([
        {
          id: 'provider',
          answer: providerResult.answer,
          unsupportedArticles: sourceValidation.unsupportedArticles
        },
        {
          id: 'local-synthesis',
          answer: localSynthesis
        }
      ], {
        caseFile,
        results: ragContext.results
      });
      return {
        answer: localSynthesis,
        intent,
        results: ragContext.results,
        ragSources: ragContext.sources,
        source: 'LEXIA Integrated Reasoning (provider source rejected)',
        fallback: true,
        model: 'local-rag-engine',
        provider: 'local',
        providerError: `Respuesta del proveedor descartada por citar artículos no verificados: ${sourceValidation.unsupportedArticles.join(', ')}`,
        providerCode: 'unsupported_source_citation',
        retrieval: {
          mode: 'rag',
          results: ragContext.results.length,
          memoryMessages: effectiveConversationMemory.length
        },
        metadata: {
          model: 'local-rag-engine',
          source: 'LEXIA Integrated Reasoning (provider source rejected)',
          ragSources: ragContext.sources,
          providerErrors: providerResult.providerErrors,
          providerStrategy: providerResult.providerStrategy || 'fallback',
          providerChecks: providerResult.providerChecks || [],
          rejectedProvider: {
            provider: providerResult.provider,
            model: providerResult.model,
            unsupportedArticles: sourceValidation.unsupportedArticles
          },
          localSynthesis,
          memoryMessages: effectiveConversationMemory.length,
          localSearchEvaluation,
          legalReasoningProfile,
          legalGraphReasoning,
          caseFile,
          dualAnalysis,
          lexiaScore: selection.selected?.quality || null,
          candidateSelection: {
            selected: selection.selected?.id || 'local-synthesis',
            candidates: selection.candidates
          },
          legalInterpretation: intent,
          conversationMode: intent.conversationMode,
          engineStage: 'local:synthesis_after_provider_source_rejection'
        }
      };
    }

    const selection = selectBestCandidate([
      {
        id: 'provider',
        answer: providerResult.answer
      },
      {
        id: 'local-synthesis',
        answer: localSynthesis
      }
    ], {
      caseFile,
      results: ragContext.results
    });
    const selectedAnswer = selection.selected?.answer || providerResult.answer;
    const selectedProvider = selection.selected?.id === 'local-synthesis' ? 'local' : providerResult.provider;
    const selectedModel = selection.selected?.id === 'local-synthesis' ? 'local-rag-engine' : providerResult.model;
    const selectedSource = selection.selected?.id === 'local-synthesis'
      ? 'LEXIA Integrated Reasoning (quality selection)'
      : providerResult.source;

    return {
      answer: selectedAnswer,
      intent,
      results: ragContext.results,
      ragSources: ragContext.sources,
      source: selectedSource,
      fallback: false,
      model: selectedModel,
      provider: selectedProvider,
      retrieval: {
        mode: 'rag',
        results: ragContext.results.length,
        memoryMessages: effectiveConversationMemory.length
      },
      metadata: {
        model: selectedModel,
        source: selectedSource,
        ragSources: ragContext.sources,
        localSynthesis,
        memoryMessages: effectiveConversationMemory.length,
        localSearchEvaluation,
        legalReasoningProfile,
        legalGraphReasoning,
        caseFile,
        dualAnalysis,
        lexiaScore: selection.selected?.quality || null,
        candidateSelection: {
          selected: selection.selected?.id || 'provider',
          candidates: selection.candidates
        },
        legalInterpretation: intent,
        conversationMode: intent.conversationMode,
        providerErrors: providerResult.providerErrors,
        providerStrategy: providerResult.providerStrategy || 'fallback',
        providerChecks: providerResult.providerChecks || [],
        reasoning: providerResult.reasoning,
        engineStage: 'providers:answer'
      }
    };
  }

  return {
    runLegalIntelligence
  };
}

module.exports = {
  createLexiaEngine
};
