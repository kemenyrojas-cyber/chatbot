function normalizeText(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function unique(values = [], limit = 20) {
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))].slice(0, limit);
}

function classifyUserProfile(role = '') {
  const normalized = normalizeText(role).replace(/[_\s]+/g, '-');
  if (/\b(estudiante|alumno|universitario|practicante)\b/.test(normalized)) {
    return { id: 'student', label: 'Estudiante de Derecho' };
  }
  if (/\b(gobierno|municipalidad|municipal|entidad-publica|funcionario|sector-publico)\b/.test(normalized)) {
    return { id: 'public-sector', label: 'Gobierno o entidad pública' };
  }
  if (/\b(abogado|abogada|estudio|firma|legal|litigante)\b/.test(normalized)) {
    return { id: 'lawyer', label: 'Profesional del Derecho' };
  }
  return { id: 'citizen', label: 'Ciudadanía' };
}

function inferProceduralRole(text = '') {
  const normalized = normalizeText(text);
  const rules = [
    ['defense', 'Defensa o persona investigada', /\b(soy el denunciado|soy la denunciada|imputado|investigado|acusado|mi defendido|defensa tecnica)\b/],
    ['victim', 'Víctima o agraviado', /\b(soy la victima|soy el agraviado|me agredieron|me denunciaron falsamente|denuncie|denuncié)\b/],
    ['claimant', 'Demandante', /\b(soy demandante|presente la demanda|presenté la demanda|quiero demandar|mi patrocinado demanda)\b/],
    ['defendant', 'Demandado', /\b(soy demandado|me demandaron|contestar la demanda|mi patrocinado fue demandado)\b/],
    ['worker', 'Trabajador', /\b(soy trabajador|me despidieron|mi empleador|trabajo para)\b/],
    ['employer', 'Empleador', /\b(soy empleador|mi trabajador|la empresa despidio|la empresa despidió)\b/]
  ];
  const match = rules.find(([, , pattern]) => pattern.test(normalized));
  return match ? { id: match[0], label: match[1], confidence: 'media' } : {
    id: 'undetermined',
    label: 'Rol procesal no determinado',
    confidence: 'baja'
  };
}

function inferUrgency(text = '') {
  const normalized = normalizeText(text);
  const signals = [];
  if (/\b(hoy|manana|mañana|vence|vencimiento|ultimo dia|último día|plazo)\b/.test(normalized)) signals.push('possible_deadline');
  if (/\b(deteni|detenido|detenida|arrest|prision|prisión)\b/.test(normalized)) signals.push('detention');
  if (/\b(amenaza(?:ron|do|da|s)? de muerte|me quiere matar|violencia|agresion|agresión|peligro inmediato)\b/.test(normalized)) signals.push('personal_safety');
  if (/\b(menor|niño|niña|adolescente)\b/.test(normalized) && /\b(abuso|violencia|agresion|agresión|violacion|violación)\b/.test(normalized)) {
    signals.push('minor_at_risk');
  }
  return {
    level: signals.some(signal => ['detention', 'personal_safety', 'minor_at_risk'].includes(signal))
      ? 'high'
      : (signals.length ? 'medium' : 'normal'),
    signals
  };
}

function extractDates(text = '') {
  const raw = String(text || '');
  const matches = raw.match(/\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}\s+de\s+[a-záéíóúñ]+\s+(?:de\s+)?\d{4}|(?:hoy|ayer|mañana))\b/gi);
  return unique(matches || [], 12);
}

function extractEvidence(text = '') {
  const normalized = normalizeText(text);
  const evidenceRules = [
    ['contrato', /\bcontrato\b/],
    ['carta', /\bcarta\b/],
    ['resolución', /\bresolucion\b/],
    ['denuncia', /\bdenuncia\b/],
    ['sentencia', /\bsentencia\b/],
    ['capturas o mensajes', /\b(captura|whatsapp|mensaje|chat)\b/],
    ['audio o video', /\b(audio|video|grabacion)\b/],
    ['boletas o comprobantes', /\b(boletas?|comprobantes?|facturas?|recibos?)\b/],
    ['expediente', /\bexpediente\b/]
  ];
  return evidenceRules.filter(([, pattern]) => pattern.test(normalized)).map(([label]) => label);
}

function normalizeExistingCaseFile(caseFile = {}) {
  if (!caseFile || typeof caseFile !== 'object' || Array.isArray(caseFile)) return {};
  return {
    ...caseFile,
    allegedFacts: unique(caseFile.allegedFacts, 30),
    confirmedFacts: unique(caseFile.confirmedFacts, 30),
    disputedFacts: unique(caseFile.disputedFacts, 30),
    evidence: unique(caseFile.evidence, 30),
    dates: unique(caseFile.dates, 20),
    objectives: unique(caseFile.objectives, 10),
    criticalMissingFacts: unique(caseFile.criticalMissingFacts, 10)
  };
}

function buildCaseFile(options = {}) {
  const {
    userQuery = '',
    conversationMemory = [],
    intent = {},
    role = '',
    sessionId = '',
    existingCaseFile = {}
  } = options;
  const previous = normalizeExistingCaseFile(existingCaseFile);
  const userMessages = (Array.isArray(conversationMemory) ? conversationMemory : [])
    .filter(message => message?.role === 'user')
    .map(message => String(message.content || '').trim())
    .filter(Boolean);
  const currentFact = String(userQuery || '').trim();
  const allUserText = [...userMessages, currentFact].filter(Boolean).join(' ');
  const profile = classifyUserProfile(role);
  const proceduralRole = inferProceduralRole(allUserText);
  const urgency = inferUrgency(allUserText);

  return {
    version: '1.0',
    caseId: String(previous.caseId || sessionId || '').trim() || null,
    jurisdiction: String(previous.jurisdiction || 'Perú'),
    legalArea: {
      id: intent?.area?.id || previous.legalArea?.id || 'area_no_determinada',
      label: intent?.area?.label || previous.legalArea?.label || 'Área no determinada',
      confidence: intent?.area?.confidence || previous.legalArea?.confidence || 'baja'
    },
    legalTopic: {
      id: intent?.topic?.id || previous.legalTopic?.id || 'tema_no_determinado',
      label: intent?.topic?.label || previous.legalTopic?.label || 'Tema no determinado',
      confidence: intent?.topic?.confidence || previous.legalTopic?.confidence || 'baja'
    },
    userProfile: profile,
    proceduralRole: proceduralRole.id === 'undetermined' && previous.proceduralRole
      ? previous.proceduralRole
      : proceduralRole,
    allegedFacts: unique([...(previous.allegedFacts || []), ...userMessages, currentFact], 30),
    confirmedFacts: unique(previous.confirmedFacts, 30),
    disputedFacts: unique(previous.disputedFacts, 30),
    evidence: unique([...(previous.evidence || []), ...extractEvidence(allUserText)], 30),
    dates: unique([...(previous.dates || []), ...extractDates(allUserText)], 20),
    objectives: unique([
      ...(previous.objectives || []),
      intent?.objective?.label
    ], 10),
    criticalMissingFacts: unique([
      ...(previous.criticalMissingFacts || []),
      ...(intent?.missingInfo || []),
      ...(proceduralRole.id === 'undetermined' ? ['rol procesal de la persona usuaria'] : [])
    ], 10),
    urgency,
    provenance: {
      userMessages: userMessages.length + (currentFact ? 1 : 0),
      confirmedFactsRequireEvidence: true,
      generatedAt: new Date().toISOString()
    }
  };
}

function buildCaseFileContext(caseFile = {}) {
  const allegedFacts = (caseFile.allegedFacts || []).slice(-6);
  const profilePolicy = {
    lawyer: 'Entrega análisis técnico, teoría del caso, argumento contrario, riesgos, prueba faltante y opciones estratégicas; no garantices resultados.',
    student: 'Enseña el método jurídico paso a paso, explica términos y formula preguntas de aprendizaje; no presentes el trabajo académico como elaborado por el estudiante.',
    'public-sector': 'Prioriza competencia, legalidad, motivación, procedimiento, trazabilidad, control y registro auditable; evita recomendaciones incompatibles con el interés público.',
    citizen: 'Usa lenguaje sencillo, orientación prudente y próximos pasos; indica cuándo hace falta patrocinio profesional.'
  }[caseFile.userProfile?.id] || 'Adapta profundidad y lenguaje al perfil identificado.';
  return [
    'EXPEDIENTE CONVERSACIONAL ESTRUCTURADO:',
    `Perfil: ${caseFile.userProfile?.label || 'Ciudadanía'}.`,
    `Jurisdicción: ${caseFile.jurisdiction || 'Perú'}.`,
    `Área y tema: ${caseFile.legalArea?.label || 'No determinada'} / ${caseFile.legalTopic?.label || 'No determinado'}.`,
    `Rol procesal: ${caseFile.proceduralRole?.label || 'No determinado'}.`,
    `Hechos alegados por el usuario (no asumir como probados): ${allegedFacts.join(' | ') || 'ninguno consolidado'}.`,
    `Hechos confirmados mediante evidencia: ${(caseFile.confirmedFacts || []).join(' | ') || 'ninguno'}.`,
    `Evidencia mencionada: ${(caseFile.evidence || []).join(', ') || 'ninguna identificada'}.`,
    `Fechas detectadas: ${(caseFile.dates || []).join(', ') || 'ninguna'}.`,
    `Datos críticos faltantes: ${(caseFile.criticalMissingFacts || []).join(', ') || 'ninguno detectado'}.`,
    `Urgencia: ${caseFile.urgency?.level || 'normal'} (${(caseFile.urgency?.signals || []).join(', ') || 'sin señales'}).`,
    `Política para este perfil: ${profilePolicy}`,
    'No conviertas hechos alegados en hechos probados. Cualquier conclusión debe respetar esta distinción.'
  ].join('\n');
}

module.exports = {
  classifyUserProfile,
  inferProceduralRole,
  inferUrgency,
  buildCaseFile,
  buildCaseFileContext
};
