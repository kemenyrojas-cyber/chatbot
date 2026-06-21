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
    const currentIntent = brain.interpret(userQuery, conversationMemory);
    const memoryIntent = brain.interpret(memorySearchQuery, conversationMemory);
    const intent = brain.mergeIntent(currentIntent, memoryIntent);
    const effectiveConversationMemory = intent?.interpretation?.topicShift ? [] : conversationMemory;
    const conversationMemoryContext = memory.buildContext(effectiveConversationMemory, intent);

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
    const ragContext = knowledge.buildRagContext(interpretationSearchQuery, localResults, dialogueMode ? 3 : 8);
    const legalReasoningProfile = reasoner.buildProfile(userQuery, intent, effectiveConversationMemory, ragContext.results);
    const legalReasoningContext = reasoner.buildContext(legalReasoningProfile);
    const legalGraphReasoning = reasoner.buildGraph(intent, ragContext.results);
    const legalGraphContext = reasoner.buildGraphContext(legalGraphReasoning);
    const temperature = config.temperature();
    const localSynthesis = response.buildLocalAnswer(
      userQuery,
      intent,
      ragContext.results,
      legalReasoningProfile,
      legalGraphReasoning,
      effectiveConversationMemory
    );

    const dialogueInstruction = dialogueMode
      ? [
          'MODO DIÁLOGO:',
          'El usuario está conversando o aclarando el caso. Prioriza entender y responder el último mensaje.',
          'Interpreta referencias como "eso", "las leyes", "qué hago" o "explícame" usando el hilo anterior.',
          'No repitas estructura previa. No hagas resumen de fuentes salvo que el usuario pida base legal.',
          'Usa párrafos cortos y resalta con **negrita** solo la idea clave, el riesgo, la base legal o el siguiente paso.',
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
      '- Mejora la redacción, pero conserva el sentido jurídico y las fuentes verificadas.',
      '- Mantén la respuesta escaneable: respuesta directa, base legal si aplica, pasos/documentos y una sola pregunta final.'
    ].join('\n');
    const context = dialogueMode
      ? [dialogueInstruction, conversationMemoryContext, legalReasoningContext, ragContext.context, lexiaSynthesisContext].filter(Boolean).join('\n\n')
      : [conversationMemoryContext, legalReasoningContext, legalGraphContext, ragContext.context, lexiaSynthesisContext].filter(Boolean).join('\n\n');
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
          reasoning: providerResult.reasoning,
          localSynthesis,
          memoryMessages: effectiveConversationMemory.length,
          localSearchEvaluation,
          legalReasoningProfile,
          legalGraphReasoning,
          legalInterpretation: intent,
          engineStage: config.externalProviderRequested() ? 'local:synthesis_after_provider_failure' : 'local:synthesis'
        }
      };
    }

    const sourceValidation = validateAnswerAgainstSources(providerResult.answer, ragContext.results, localSynthesis);
    if (!sourceValidation.ok) {
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
          legalInterpretation: intent,
          engineStage: 'local:synthesis_after_provider_source_rejection'
        }
      };
    }

    return {
      answer: providerResult.answer,
      intent,
      results: ragContext.results,
      ragSources: ragContext.sources,
      source: providerResult.source,
      fallback: false,
      model: providerResult.model,
      provider: providerResult.provider,
      retrieval: {
        mode: 'rag',
        results: ragContext.results.length,
        memoryMessages: effectiveConversationMemory.length
      },
      metadata: {
        model: providerResult.model,
        source: providerResult.source,
        ragSources: ragContext.sources,
        localSynthesis,
        memoryMessages: effectiveConversationMemory.length,
        localSearchEvaluation,
        legalReasoningProfile,
        legalGraphReasoning,
        legalInterpretation: intent,
        providerErrors: providerResult.providerErrors,
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
