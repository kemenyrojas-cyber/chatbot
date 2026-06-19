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

    const dialogueInstruction = dialogueMode
      ? [
          'MODO DIÁLOGO:',
          'El usuario está conversando o aclarando el caso. Prioriza entender y responder el último mensaje.',
          'No repitas estructura previa. No hagas resumen de fuentes. Haz como máximo una pregunta concreta.'
        ].join('\n')
      : '';
    const context = dialogueMode
      ? [dialogueInstruction, conversationMemoryContext, legalReasoningContext, ragContext.context].filter(Boolean).join('\n\n')
      : [conversationMemoryContext, legalReasoningContext, legalGraphContext, ragContext.context].filter(Boolean).join('\n\n');
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

    const providerResult = await providers.generate(messages, { temperature });
    if (!providerResult.answer) {
      if (config.externalProviderRequested()) {
        const firstError = providerResult.providerErrors?.[0] || {};
        return {
          answer: [
            'No voy a fingir una respuesta inteligente con una plantilla local.',
            '',
            `LEXIA intentó consultar el proveedor configurado (${config.configuredProvider()}), pero no recibió respuesta útil.`,
            firstError.error ? `Error técnico: ${firstError.error}` : '',
            '',
            'Revisa la API key, el modelo y las variables de entorno del servidor. Cuando el proveedor esté activo, responderé usando el hilo completo y el contexto jurídico del cerebro de LEXIA.'
          ].filter(Boolean).join('\n'),
          intent,
          results: ragContext.results,
          ragSources: ragContext.sources,
          source: 'LEXIA Provider Guard',
          fallback: true,
          model: 'provider-unavailable',
          provider: config.configuredProvider(),
          providerError: firstError.error || 'Proveedor generativo no disponible.',
          providerCode: firstError.code || null,
          retrieval: {
            mode: 'rag',
            results: ragContext.results.length,
            memoryMessages: effectiveConversationMemory.length
          },
          metadata: {
            model: 'provider-unavailable',
            source: 'LEXIA Provider Guard',
            ragSources: ragContext.sources,
            providerErrors: providerResult.providerErrors,
            memoryMessages: effectiveConversationMemory.length,
            localSearchEvaluation,
            legalReasoningProfile,
            legalGraphReasoning,
            legalInterpretation: intent,
            engineStage: 'providers:unavailable'
          }
        };
      }

      return {
        answer: response.buildLocalAnswer(userQuery, intent, ragContext.results, legalReasoningProfile, legalGraphReasoning, effectiveConversationMemory),
        intent,
        results: ragContext.results,
        ragSources: ragContext.sources,
        source: 'LEXIA RAG Local',
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
          memoryMessages: effectiveConversationMemory.length,
          localSearchEvaluation,
          legalReasoningProfile,
          legalGraphReasoning,
          legalInterpretation: intent,
          engineStage: 'local:fallback'
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
