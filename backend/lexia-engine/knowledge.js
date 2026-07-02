const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pdfParse = require('pdf-parse');
const { prioritizeKnowledgeResults } = require('./knowledge-prioritizer');

function createKnowledgeEngine(deps = {}) {
const aiEngineRoot = deps.aiEngineRoot;
const accountsPool = deps.accountsPool || null;
const shouldSearchLegalEngineFromServer = typeof deps.shouldSearchLegalEngine === 'function' ? deps.shouldSearchLegalEngine : null;
const normalizeReviewStatus = typeof deps.normalizeReviewStatus === 'function'
  ? deps.normalizeReviewStatus
  : (value, fallback = 'pending_review') => {
      const status = normalizeText(value).replace(/\s+/g, '_');
      return ['approved', 'pending_review', 'rejected'].includes(status) ? status : fallback;
    };
let legalIngestionDbReady = null;
let legalIngestedCorpusLoaded = false;
let legalIngestedCorpus = [];
// CARGA TODAS las bases de conocimiento
let kbContent = '';
const kbFiles = [
  'lpderecho_content.md',        // Contenido principal de lpderecho.pe
  'lpderecho_index.md',          // Índice de todos los artículos
  'legal_faqs.md',               // Base de conocimiento general
  'lpderecho_cases.md',          // Casos y sentencias
  'lpderecho_sentencias.md'      // Jurisprudencia
];

console.log('\n📚 Cargando bases de conocimiento...');
for (const file of kbFiles) {
  try {
    const kbPath = path.join(aiEngineRoot, 'kb', file);
    if (fs.existsSync(kbPath)) {
      const raw = fs.readFileSync(kbPath, 'utf8');
      kbContent += raw.replace(/\s+/g, ' ').trim() + ' ';
      const size = (raw.length / 1024).toFixed(2);
      console.log(`✅ ${file}: ${size} KB`);
    }
  } catch (e) {
    console.warn(`⚠️ ${file}: No encontrado`);
  }
}

const totalKB = (kbContent.length / 1024).toFixed(2);
console.log(`\n📊 Base de conocimiento total: ${totalKB} KB\n`);

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getQueryTerms(query) {
  const stopwords = new Set([
    'para', 'como', 'cuando', 'donde', 'cual', 'cuales', 'sobre', 'esta', 'este', 'estos',
    'estas', 'tengo', 'quiero', 'saber', 'consulta', 'legal', 'derecho', 'del', 'las', 'los',
    'una', 'uno', 'con', 'por', 'que', 'hay', 'son', 'sus', 'hola', 'buenas', 'buenos',
    'dias', 'tardes', 'noches', 'gracias', 'lexia', 'alexia', 'puedo', 'hacer', 'hago',
    'dime', 'decir', 'explica', 'explícame', 'entiendo'
  ]);
  return normalizeText(query)
    .split(' ')
    .filter(term => term.length >= 3 && !stopwords.has(term));
}

function extractArticleReferences(query) {
  const normalized = normalizeText(query);
  const references = [];
  const patterns = [
    /\barticulo\s+(\d+[a-z]?)\b/g,
    /\bart\s+(\d+[a-z]?)\b/g,
    /\binciso\s+(\d+[a-z]?)\b/g
  ];

  for (const pattern of patterns) {
    let match = pattern.exec(normalized);
    while (match) {
      references.push(match[1]);
      match = pattern.exec(normalized);
    }
  }

  return [...new Set(references)];
}

function safeFileStem(fileName) {
  const parsed = path.parse(String(fileName || 'documento'));
  const base = parsed.name || 'documento';
  return normalizeText(base)
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9ñ-]/g, '')
    .slice(0, 80) || 'documento';
}

function hashContent(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function inferLegalMatterFromText(fileName, text) {
  const normalized = normalizeText(`${fileName} ${text.slice(0, 12000)}`);
  const rules = [
    ['Derecho Constitucional', ['constitucion', 'constitucional', 'amparo', 'habeas corpus', 'habeas data', 'derechos fundamentales']],
    ['Derecho Laboral', ['trabajo', 'laboral', 'despido', 'remuneracion', 'cts', 'vacaciones', 'trabajador']],
    ['Derecho Penal', ['penal', 'delito', 'fiscalia', 'ministerio publico', 'pena', 'denuncia', 'imputado']],
    ['Derecho Civil', ['civil', 'contrato', 'obligacion', 'propiedad', 'posesion', 'herencia', 'compraventa']],
    ['Derecho de Familia', ['alimentos', 'tenencia', 'visitas', 'divorcio', 'filiacion', 'menor']],
    ['Derecho Administrativo', ['administrativo', 'procedimiento administrativo', 'sunarp', 'municipalidad', 'entidad publica']],
    ['Derecho Comercial', ['empresa', 'sociedad', 'mercantil', 'comercial', 'insolvencia']],
    ['Derecho Tributario', ['tributario', 'sunat', 'impuesto', 'tributo']]
  ];

  const match = rules.find(([, terms]) => terms.some(term => normalized.includes(term)));
  return match ? match[0] : 'Derecho Peruano';
}

function inferLegalKnowledgeModule(fileName, text, preferredModule = '') {
  const normalizedPreferred = normalizeText(preferredModule);
  if (legalKnowledgeModules.includes(normalizedPreferred)) return normalizedPreferred;

  const normalized = normalizeText(`${fileName} ${text.slice(0, 12000)}`);
  if (/\b(tratado|manual|principios de derecho|parte general|doctrina|profesor|obra)\b/.test(normalized)) return 'doctrina';
  if (normalized.includes('tribunal constitucional') || normalized.includes('sentencia del tribunal constitucional')) return 'sentencias_tc';
  if (normalized.includes('casacion') || normalized.includes('casación')) return 'casaciones';
  if (normalized.includes('jurisprudencia') || normalized.includes('sentencia') || normalized.includes('precedente')) return 'jurisprudencia';
  return 'normativa';
}

function extractLegalSignals(text) {
  const normalized = normalizeText(text);
  const documents = [];
  const risks = [];
  const steps = [];
  const questions = [];

  if (normalized.includes('plazo') || normalized.includes('caducidad') || normalized.includes('prescripcion')) {
    risks.push('verificar plazos, caducidad o prescripción antes de definir la estrategia');
    questions.push('¿Cuál es la fecha exacta del hecho o notificación?');
  }
  if (normalized.includes('prueba') || normalized.includes('documento') || normalized.includes('expediente')) {
    documents.push('documentos, expediente, comunicaciones y pruebas relacionadas');
    steps.push('ordenar documentos y cronología antes del análisis jurídico');
  }
  if (normalized.includes('demanda') || normalized.includes('proceso') || normalized.includes('juzgado')) {
    risks.push('revisar competencia, vía procesal y requisitos de admisibilidad');
    steps.push('identificar autoridad competente y vía aplicable');
  }
  if (normalized.includes('derecho fundamental') || normalized.includes('constitucional')) {
    risks.push('evaluar afectación de derechos fundamentales y garantía constitucional aplicable');
    steps.push('identificar derecho afectado, acto lesivo y urgencia');
  }
  if (normalized.includes('trabajador') || normalized.includes('despido')) {
    documents.push('contrato, boletas, carta de despido, comunicaciones y asistencia');
    questions.push('¿Hubo carta de despido o comunicación escrita?');
  }
  if (normalized.includes('alimentos') || normalized.includes('menor')) {
    documents.push('partida, gastos, ingresos y documentos del menor');
    questions.push('¿Qué necesidades del menor están acreditadas?');
  }

  return {
    hechos_clave: ['identificar hechos, fechas, partes involucradas y documentos disponibles'],
    problemas_juridicos: ['determinar regla aplicable, autoridad competente y consecuencia jurídica'],
    reglas_practicas: ['no concluir sin revisar texto fuente y hechos concretos', 'usar la fuente como apoyo, no como respuesta automática definitiva'],
    riesgos: [...new Set(risks)].slice(0, 5),
    documentos: [...new Set(documents)].slice(0, 5),
    pasos: [...new Set(steps.length ? steps : ['resumir hechos', 'contrastar con la fuente', 'formular próximos pasos'])].slice(0, 5),
    preguntas: [...new Set(questions.length ? questions : ['¿Qué ocurrió, cuándo y qué documento tienes?'])].slice(0, 5)
  };
}

function splitTextForLegalKnowledge(
  text,
  maxChunks = Number(process.env.LEGAL_INGEST_MAX_CHUNKS || 1000),
  targetChars = Number(process.env.LEGAL_INGEST_CHUNK_CHARS || 12000)
) {
  const clean = String(text || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) return [];
  const safeMaxChunks = Math.max(8, Math.min(2000, Number(maxChunks) || 1000));
  const safeTargetChars = Math.max(2400, Math.min(24000, Number(targetChars) || 12000));
  const overlapChars = Math.min(400, Math.floor(safeTargetChars * 0.04));

  const sections = clean
    .split(/\n{2,}|(?=^#{1,3}\s)|(?=\bArticulo\s+\d)|(?=\bArtículo\s+\d)/im)
    .map(section => section.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const source = sections.length ? sections : [clean.replace(/\s+/g, ' ').trim()];
  const chunks = [];
  let pending = '';
  const flushPending = () => {
    if (!pending || chunks.length >= safeMaxChunks) return;
    chunks.push(pending);
    pending = '';
  };

  for (const section of source) {
    if (chunks.length >= safeMaxChunks) break;
    if (section.length <= safeTargetChars) {
      if (!pending || pending.length + section.length + 2 <= safeTargetChars) {
        pending = pending ? `${pending}\n\n${section}` : section;
      } else {
        flushPending();
        pending = section;
      }
      continue;
    }
    flushPending();
    const step = safeTargetChars - overlapChars;
    for (let index = 0; index < section.length && chunks.length < safeMaxChunks; index += step) {
      chunks.push(section.slice(index, index + safeTargetChars).trim());
    }
  }
  flushPending();
  return chunks;
}

async function extractTextFromLegalUpload(file, body = {}) {
  if (body.content) return String(body.content);
  if (body.base64) return Buffer.from(String(body.base64), 'base64').toString('utf8');
  if (!file) throw new Error('Debes enviar un archivo o contenido.');

  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = String(file.mimetype || '').toLowerCase();
  if (ext === '.pdf' || mime.includes('pdf')) {
    const parsed = await pdfParse(file.buffer);
    return String(parsed.text || '');
  }
  if (['.txt', '.md', '.json'].includes(ext) || mime.startsWith('text/') || mime.includes('json')) {
    return file.buffer.toString('utf8');
  }

  throw new Error('Formato no soportado. Usa PDF, TXT, Markdown o JSON.');
}

function buildIngestedLegalEntries({ sourceId, fileName, title, text, materia, fecha, fuente, url, modulo }) {
  const sourceTitle = String(title || '').trim() || path.parse(fileName).name.replace(/[_-]/g, ' ');
  const inferredMatter = materia || inferLegalMatterFromText(fileName, text);
  const inferredModule = inferLegalKnowledgeModule(fileName, text, modulo);
  const chunks = splitTextForLegalKnowledge(text);
  const stem = safeFileStem(fileName);
  const dateValue = fecha || new Date().toISOString().slice(0, 10);
  const sourceLabel = fuente || sourceTitle || 'Documento cargado en LEXIA';

  return chunks.map((chunk, index) => {
    const entryTitle = chunks.length > 1 ? `${sourceTitle} - parte ${index + 1}` : sourceTitle;
    return normalizeLegalKnowledgeRecord(inferredModule, {
      id: `ingest-${stem}-${hashContent(`${sourceId}:${index}:${chunk}`).slice(0, 12)}`,
      titulo: entryTitle,
      materia: inferredMatter,
      fecha: dateValue,
      fuente: sourceLabel,
      url: url || '',
      contenido: chunk,
      resumen: chunk.slice(0, 420),
      inteligencia: extractLegalSignals(chunk)
    }, index);
  });
}

function getCombinedLegalKnowledgeCorpus() {
  const seen = new Set();
  return [...legalKnowledgeCorpus, ...legalIngestedCorpus].filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}


function shouldSearchLegalEngine(query) {
  if (shouldSearchLegalEngineFromServer) return shouldSearchLegalEngineFromServer(query);
  return getQueryTerms(query).length >= 2;
}
const legalKnowledgeModules = ['normativa', 'doctrina', 'jurisprudencia', 'casaciones', 'sentencias_tc'];

function normalizeLegalKnowledgeRecord(moduleName, item, index) {
  const id = String(item?.id || `${moduleName}-${index + 1}`);
  return {
    id,
    titulo: String(item?.titulo || item?.title || id),
    materia: String(item?.materia || ''),
    fecha: String(item?.fecha || ''),
    fuente: String(item?.fuente || item?.source || 'Base jurídica local LEXIA'),
    url: String(item?.url || ''),
    contenido: String(item?.contenido || item?.content || ''),
    resumen: String(item?.resumen || item?.excerpt || ''),
    inteligencia: item?.inteligencia && typeof item.inteligencia === 'object' ? item.inteligencia : {},
    modulo: moduleName
  };
}

function loadLegalKnowledgeBase() {
  const emptyBase = legalKnowledgeModules.reduce((acc, moduleName) => {
    acc[moduleName] = [];
    return acc;
  }, {});
  const kbPath = path.join(aiEngineRoot, 'kb', 'legal_knowledge_base.json');
  if (!fs.existsSync(kbPath)) return emptyBase;

  try {
    const parsed = JSON.parse(fs.readFileSync(kbPath, 'utf8'));
    return legalKnowledgeModules.reduce((acc, moduleName) => {
      const items = Array.isArray(parsed[moduleName]) ? parsed[moduleName] : [];
      acc[moduleName] = items.map((item, index) => normalizeLegalKnowledgeRecord(moduleName, item, index));
      return acc;
    }, {});
  } catch (error) {
    console.warn('⚠️ No se pudo cargar legal_knowledge_base.json:', error.message);
    return emptyBase;
  }
}

const legalKnowledgeBase = loadLegalKnowledgeBase();
const legalKnowledgeCorpus = legalKnowledgeModules.flatMap(moduleName => legalKnowledgeBase[moduleName]);

function extractLegalConceptPhrases(query) {
  const normalized = normalizeText(query);
  const phrases = [];
  const patterns = [
    /\bderecho\s+(?:a la|al|a|de la|del|de)\s+([a-z0-9ñ\s]{3,60})/g,
    /\b(?:fundamento|base|sustento)\s+legal\s+(?:de|del|para|sobre)\s+([a-z0-9ñ\s]{3,60})/g
  ];

  for (const pattern of patterns) {
    let match = pattern.exec(normalized);
    while (match) {
      const phrase = match[0].replace(/\s+/g, ' ').trim();
      const concept = String(match[1] || '').replace(/\s+/g, ' ').trim();
      const conceptTerms = concept.split(' ').filter(term => term.length >= 3);
      if (phrase.startsWith('derecho ') && concept) {
        phrases.push(
          phrase,
          `derecho de ${concept}`,
          `derecho a ${concept}`,
          `derecho a la ${concept}`,
          `derecho al ${concept}`
        );
      } else if (conceptTerms.length >= 2) {
        phrases.push(phrase, concept);
      } else if (phrase) {
        phrases.push(phrase);
      }
      match = pattern.exec(normalized);
    }
  }

  return [...new Set(phrases)]
    .map(item => item.replace(/\s+/g, ' ').trim())
    .filter(item => item.length >= 3)
    .slice(0, 6);
}

function scoreLegalKnowledgeRecord(record, query, terms) {
  const normalizedQuery = normalizeText(query);
  const normalizedTitle = normalizeText(record.titulo);
  const normalizedSummary = normalizeText(record.resumen);
  const normalizedMatter = normalizeText(record.materia);
  const normalizedIntelligence = normalizeText(JSON.stringify(record.inteligencia || {}));
  const normalizedBody = normalizeText(`${record.titulo} ${record.materia} ${record.resumen} ${record.contenido} ${record.fuente} ${normalizedIntelligence}`);
  const legalConceptPhrases = extractLegalConceptPhrases(query);
  const articleRefs = extractArticleReferences(query);
  const genericNormativeTerms = new Set([
    'articulo', 'art', 'inciso', 'ley', 'norma', 'legal', 'derecho', 'derechos',
    'codigo', 'constitucion', 'decreto'
  ]);
  let score = 0;

  if (normalizedBody.includes(normalizedQuery)) score += 25;
  if (normalizedTitle.includes(normalizedQuery)) score += 20;
  for (const phrase of legalConceptPhrases) {
    if (normalizedBody.includes(phrase)) score += 35;
    const phraseTerms = phrase.split(' ').filter(term => term.length >= 4);
    const matchedTerms = phraseTerms.filter(term => normalizedBody.includes(term)).length;
    if (phraseTerms.length && matchedTerms >= Math.min(2, phraseTerms.length)) {
      score += matchedTerms * 8;
    }
    if (normalizedTitle.includes(phrase)) score += 18;
  }
  for (const term of terms) {
    if (genericNormativeTerms.has(term)) continue;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = normalizedBody.match(new RegExp(`\\b${escaped}`, 'g'));
    if (matches) score += Math.min(matches.length, 10) * 3;
    if (normalizedTitle.includes(term)) score += 7;
    if (normalizedMatter.includes(term)) score += 5;
    if (normalizedSummary.includes(term)) score += 4;
    if (normalizedIntelligence.includes(term)) score += 5;
  }
  for (const article of articleRefs) {
    const exactArticlePattern = new RegExp(`\\b(?:articulo|art)\\s+${article}\\b`);
    if (exactArticlePattern.test(normalizedBody)) score += 90;
  }

  if (record.modulo === 'normativa') score += 3;
  if (record.modulo === 'doctrina') score += 1;
  if (record.modulo === 'jurisprudencia') score += 4;
  if (record.modulo === 'casaciones') score += 4;
  if (record.modulo === 'sentencias_tc') score += 4;
  return score;
}

function searchLegalKnowledgeBase(query, limit = 12) {
  if (!shouldSearchLegalEngine(query)) return [];
  const terms = getQueryTerms(query);
  if (!terms.length) return [];

  return getCombinedLegalKnowledgeCorpus()
    .map(record => ({
      id: record.id,
      titulo: record.titulo,
      materia: record.materia,
      fecha: record.fecha,
      fuente: record.fuente,
      url: record.url,
      contenido: record.contenido,
      resumen: record.resumen,
      inteligencia: record.inteligencia || {},
      modulo: record.modulo,
      relevance: scoreLegalKnowledgeRecord(record, query, terms)
    }))
    .filter(result => result.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, limit);
}

function queryRequestsFreshOrOfficialSources(query) {
  const normalized = normalizeText(query);
  const officialSources = [
    'el peruano',
    'tribunal constitucional',
    'tc',
    'poder judicial',
    'sunarp',
    'gob pe',
    'gob.pe'
  ];
  const freshnessTerms = [
    'actualizado',
    'actualizada',
    'vigente',
    'vigencia',
    'reciente',
    'ultimas',
    'últimas',
    'ultimo',
    'último',
    'nueva ley',
    'norma vigente',
    'sentencia reciente',
    'jurisprudencia actual',
    'jurisprudencia reciente',
    'fuente oficial',
    'pagina oficial',
    'página oficial'
  ];

  return [...officialSources, ...freshnessTerms].some(term => normalized.includes(normalizeText(term)));
}

function isGenericLocalResult(result) {
  const source = normalizeText(result?.fuente || result?.source || '');
  const title = normalizeText(result?.titulo || result?.title || '');
  const summary = normalizeText(result?.resumen || result?.excerpt || result?.contenido || '');
  const genericSources = [
    'base juridica interna lexia',
    'base juridica local lexia',
    'base interna lexia'
  ];
  const genericTitles = [
    'panorama',
    'derechos basicos',
    'procedimiento civil',
    'consulta legal',
    'guia',
    'guía'
  ];

  return (
    genericSources.some(item => source.includes(item))
    || genericTitles.some(item => title.includes(normalizeText(item)))
    || summary.length < 120
  );
}

function evaluateLocalSearchSufficiency(query, localResults = []) {
  const results = Array.isArray(localResults) ? localResults : [];
  const topRelevance = results.reduce((max, item) => Math.max(max, Number(item.relevance || 0)), 0);
  const genericCount = results.filter(isGenericLocalResult).length;
  const genericRatio = results.length ? genericCount / results.length : 0;
  const asksFreshOrOfficial = queryRequestsFreshOrOfficialSources(query);
  const weakReasons = [];

  if (!results.length) {
    return {
      localSearchStatus: 'empty',
      shouldUseExternalSources: shouldSearchLegalEngine(query),
      reason: 'sin resultados locales',
      metrics: {
        resultCount: 0,
        topRelevance: 0,
        genericRatio: 0,
        asksFreshOrOfficial
      }
    };
  }

  if (results.length < 3) weakReasons.push('menos de 3 resultados');
  if (topRelevance < 18) weakReasons.push('relevancia maxima baja');
  if (genericRatio >= 0.6 && topRelevance < 50) weakReasons.push('resultados demasiado genericos');
  if (asksFreshOrOfficial) weakReasons.push('consulta pide fuente oficial o informacion actualizada');

  return {
    localSearchStatus: weakReasons.length ? 'weak' : 'strong',
    shouldUseExternalSources: weakReasons.length > 0,
    reason: weakReasons.length ? weakReasons.join('; ') : 'base local suficiente',
    metrics: {
      resultCount: results.length,
      topRelevance,
      genericRatio: Number(genericRatio.toFixed(2)),
      asksFreshOrOfficial
    }
  };
}

function logLocalSearchSufficiency(scope, query, evaluation) {
  console.log(
    `[LEXIA Local Search] ${scope}: status=${evaluation.localSearchStatus}; external=${evaluation.shouldUseExternalSources}; reason=${evaluation.reason}; results=${evaluation.metrics.resultCount}; top=${evaluation.metrics.topRelevance}; generic=${evaluation.metrics.genericRatio}; query="${truncateForRag(query, 140)}"`
  );
}

function getLegalKnowledgeCounts() {
  const counts = legalKnowledgeModules.reduce((acc, moduleName) => {
    acc[moduleName] = legalKnowledgeBase[moduleName].length;
    return acc;
  }, {});
  for (const item of legalIngestedCorpus) {
    const moduleName = legalKnowledgeModules.includes(item.modulo) ? item.modulo : 'normativa';
    counts[moduleName] = (counts[moduleName] || 0) + 1;
  }
  return counts;
}

function mergeRuntimeLegalKnowledge(entries) {
  const existing = new Set(legalIngestedCorpus.map(item => item.id));
  for (const entry of entries) {
    if (existing.has(entry.id)) continue;
    legalIngestedCorpus.push(entry);
    existing.add(entry.id);
  }
}

async function ensureLegalIngestionDatabase() {
  if (!accountsPool) return false;
  if (!legalIngestionDbReady) {
    legalIngestionDbReady = (async () => {
      await accountsPool.query(`
        CREATE TABLE IF NOT EXISTS legal_ingested_sources (
          id TEXT PRIMARY KEY,
          account_email TEXT,
          original_name TEXT NOT NULL,
          mime_type TEXT,
          size_bytes INTEGER NOT NULL DEFAULT 0,
          title TEXT NOT NULL,
          source_label TEXT NOT NULL,
          source_url TEXT,
          source_type TEXT NOT NULL DEFAULT 'file',
          review_status TEXT NOT NULL DEFAULT 'approved',
          legal_score INTEGER NOT NULL DEFAULT 0,
          legal_evaluation JSONB NOT NULL DEFAULT '{}'::jsonb,
          content_hash TEXT UNIQUE NOT NULL,
          extracted_text TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await accountsPool.query(`
        CREATE TABLE IF NOT EXISTS legal_ingested_entries (
          id TEXT PRIMARY KEY,
          source_id TEXT NOT NULL REFERENCES legal_ingested_sources(id) ON DELETE CASCADE,
          account_email TEXT,
          modulo TEXT NOT NULL,
          titulo TEXT NOT NULL,
          materia TEXT,
          fecha TEXT,
          fuente TEXT,
          url TEXT,
          contenido TEXT NOT NULL,
          resumen TEXT,
          inteligencia JSONB NOT NULL DEFAULT '{}'::jsonb,
          review_status TEXT NOT NULL DEFAULT 'approved',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await accountsPool.query("ALTER TABLE legal_ingested_sources ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'file'");
      await accountsPool.query("ALTER TABLE legal_ingested_sources ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'approved'");
      await accountsPool.query("ALTER TABLE legal_ingested_sources ADD COLUMN IF NOT EXISTS legal_score INTEGER NOT NULL DEFAULT 0");
      await accountsPool.query("ALTER TABLE legal_ingested_sources ADD COLUMN IF NOT EXISTS legal_evaluation JSONB NOT NULL DEFAULT '{}'::jsonb");
      await accountsPool.query("ALTER TABLE legal_ingested_entries ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'approved'");
      await accountsPool.query('CREATE INDEX IF NOT EXISTS idx_legal_ingested_entries_modulo ON legal_ingested_entries (modulo)');
      await accountsPool.query('CREATE INDEX IF NOT EXISTS idx_legal_ingested_entries_review_status ON legal_ingested_entries (review_status)');
      await accountsPool.query('CREATE INDEX IF NOT EXISTS idx_legal_ingested_sources_hash ON legal_ingested_sources (content_hash)');
      await accountsPool.query('CREATE INDEX IF NOT EXISTS idx_legal_ingested_sources_review_status ON legal_ingested_sources (review_status)');
    })();
  }
  try {
    await legalIngestionDbReady;
  } catch (error) {
    legalIngestionDbReady = null;
    throw error;
  }
  return true;
}

async function loadLegalIngestedKnowledgeFromDb(force = false) {
  if (!accountsPool) return [];
  if (legalIngestedCorpusLoaded && !force) return legalIngestedCorpus;
  const ready = await ensureLegalIngestionDatabase();
  if (!ready) return [];

  const result = await accountsPool.query(`
    SELECT id, modulo, titulo, materia, fecha, fuente, url, contenido, resumen, inteligencia
    FROM legal_ingested_entries
    WHERE review_status = 'approved'
    ORDER BY created_at DESC
    LIMIT 800
  `);
  legalIngestedCorpus = result.rows.map((row, index) => normalizeLegalKnowledgeRecord(row.modulo, row, index));
  legalIngestedCorpusLoaded = true;
  return legalIngestedCorpus;
}

async function ensureLegalKnowledgeAvailable() {
  try {
    await loadLegalIngestedKnowledgeFromDb();
  } catch (error) {
    console.warn('⚠️ No se pudo cargar conocimiento ingerido desde PostgreSQL:', error.message);
  }
}

async function persistIngestedLegalKnowledgeToDb({ source, entries }) {
  const ready = await ensureLegalIngestionDatabase();
  if (!ready) return false;

  await accountsPool.query(
    `INSERT INTO legal_ingested_sources (
       id, account_email, original_name, mime_type, size_bytes, title,
       source_label, source_url, source_type, review_status, legal_score,
       legal_evaluation, content_hash, extracted_text
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14)
     ON CONFLICT (content_hash) DO UPDATE
     SET title = EXCLUDED.title,
         source_label = EXCLUDED.source_label,
         source_url = EXCLUDED.source_url,
         source_type = EXCLUDED.source_type,
         review_status = EXCLUDED.review_status,
         legal_score = EXCLUDED.legal_score,
         legal_evaluation = EXCLUDED.legal_evaluation,
         extracted_text = EXCLUDED.extracted_text`,
    [
      source.id,
      source.email || null,
      source.originalName,
      source.mimeType || null,
      source.sizeBytes || 0,
      source.title,
      source.sourceLabel,
      source.url || null,
      source.sourceType || 'file',
      normalizeReviewStatus(source.reviewStatus, 'approved'),
      Number(source.legalScore || 0),
      JSON.stringify(source.legalEvaluation || {}),
      source.contentHash,
      source.text
    ]
  );

  for (const entry of entries) {
    await accountsPool.query(
      `INSERT INTO legal_ingested_entries (
         id, source_id, account_email, modulo, titulo, materia, fecha, fuente,
         url, contenido, resumen, inteligencia, review_status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)
       ON CONFLICT (id) DO UPDATE
       SET titulo = EXCLUDED.titulo,
           materia = EXCLUDED.materia,
           fecha = EXCLUDED.fecha,
           fuente = EXCLUDED.fuente,
           url = EXCLUDED.url,
           contenido = EXCLUDED.contenido,
           resumen = EXCLUDED.resumen,
           inteligencia = EXCLUDED.inteligencia,
           review_status = EXCLUDED.review_status`,
      [
        entry.id,
        source.id,
        source.email || null,
        entry.modulo,
        entry.titulo,
        entry.materia,
        entry.fecha,
        entry.fuente,
        entry.url,
        entry.contenido,
        entry.resumen,
        JSON.stringify(entry.inteligencia || {}),
        normalizeReviewStatus(source.reviewStatus, 'approved')
      ]
    );
  }

  return true;
}

function persistIngestedLegalKnowledgeLocally({ source, entries }) {
  const kbDir = path.join(aiEngineRoot, 'kb');
  const kbPath = path.join(kbDir, 'legal_knowledge_base.json');
  fs.mkdirSync(kbDir, { recursive: true });

  const mdFile = `ingested_${safeFileStem(source.originalName)}_${source.contentHash.slice(0, 10)}.md`;
  const mdPath = path.join(kbDir, mdFile);
  if (!fs.existsSync(mdPath)) {
    fs.writeFileSync(mdPath, `# ${source.title}\n\n${source.text}`, 'utf8');
  }

  const parsed = fs.existsSync(kbPath)
    ? JSON.parse(fs.readFileSync(kbPath, 'utf8'))
    : legalKnowledgeModules.reduce((acc, moduleName) => {
        acc[moduleName] = [];
        return acc;
      }, {});
  for (const moduleName of legalKnowledgeModules) {
    if (!Array.isArray(parsed[moduleName])) parsed[moduleName] = [];
  }

  let changed = false;
  for (const entry of entries) {
    const moduleName = legalKnowledgeModules.includes(entry.modulo) ? entry.modulo : 'normativa';
    if (parsed[moduleName].some(item => item.id === entry.id)) continue;
    parsed[moduleName].push({
      id: entry.id,
      titulo: entry.titulo,
      materia: entry.materia,
      fecha: entry.fecha,
      fuente: entry.fuente,
      url: entry.url,
      contenido: entry.contenido,
      resumen: entry.resumen,
      inteligencia: entry.inteligencia || {}
    });
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(kbPath, JSON.stringify(parsed, null, 2), 'utf8');
  }
  return { mdFile, changed };
}

function filterSourcesForIntent(results, intent) {
  const topic = normalizeText(intent?.topic?.label || '');
  const topicId = normalizeText(intent?.topic?.id || '');
  const area = normalizeText(intent?.area?.label || '');
  const topicTerms = [...new Set(getQueryTerms(`${topic} ${topicId}`).filter(term => term.length >= 4))];
  const hasSpecificTopic = topicTerms.length > 0 && !['tema no determinado', ''].includes(topic);

  return results.filter(item => {
    const sourceText = normalizeText([
      item.titulo,
      item.title,
      item.materia,
      item.fuente,
      item.source,
      item.resumen,
      item.excerpt,
      item.contenido,
      item.content
    ].join(' '));

    if (hasSpecificTopic) {
      const matchingTopicTerms = topicTerms.filter(term => containsNormalizedTerm(sourceText, term));
      if (matchingTopicTerms.length >= Math.min(2, topicTerms.length)) return true;
    }
    if (!hasSpecificTopic && area && sourceText.includes(area)) return true;
    return false;
  });
}

function containsNormalizedTerm(text, term) {
  const escaped = String(term || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(String(text || ''));
}

function isTechnicalSourceLabel(value = '') {
  return /\.(?:md|json|pdf)\b|ingested[_-]|chunk[_-]|[\\/]|lexia legal knowledge base|base jur[ií]dica local lexia|archivo jur[ií]dico local/i
    .test(String(value || ''));
}

function publicSourceLabel(item = {}) {
  const source = String(item.fuente || item.source || '').replace(/\s+/g, ' ').trim();
  if (source && !isTechnicalSourceLabel(source)) return source;
  const host = getSourceHost(item);
  return host || '';
}

function buildSourceSummary(results, intent, limit = 3) {
  const rankedSources = filterSourcesForIntent(results, intent)
    .filter(item => Number(item.relevance || 0) >= 10)
    .sort((a, b) => {
      return scoreSourceQuality(b) - scoreSourceQuality(a)
        || Number(b.relevance || 0) - Number(a.relevance || 0);
    });
  const specificSources = rankedSources.filter(item => !isGenericSourceResult(item));
  const officialSources = specificSources.filter(isOfficialLegalSource);
  const relevantSources = officialSources.length ? officialSources : (specificSources.length ? specificSources : rankedSources);

  if (!relevantSources.length) {
    return [
      '**Fuentes**',
      `No pude verificar una fuente específica sobre ${intent?.topic?.label || 'este tema'}. Conviene revisar la norma aplicable en El Peruano, SPIJ, Ministerio Público, Poder Judicial o la entidad competente.`
    ].join('\n');
  }

  const lines = ['**Fuentes**'];
  relevantSources.slice(0, limit).forEach((item, index) => {
    const rawTitle = String(item.titulo || item.title || '').replace(/\s+/g, ' ').trim();
    const title = rawTitle && !isTechnicalSourceLabel(rawTitle) ? rawTitle : 'Referencia jurídica';
    const source = publicSourceLabel(item);
    const matter = item.materia ? ` | Materia: ${item.materia}` : '';
    const url = item.url ? `\nURL: ${item.url}` : '';
    lines.push(`${index + 1}. ${title}${source ? ` | ${source}` : ''}${matter}${url}`);
  });
  if (!officialSources.length && relevantSources.some(isSecondaryLegalSource)) {
    lines.push('', 'Nota: esta referencia ayuda a ubicar el tema, pero conviene contrastar el texto vigente en El Peruano, SPIJ o la entidad oficial competente.');
  }
  return lines.join('\n');
}

function itemHasExternalUrl(item) {
  return /^https?:\/\//i.test(String(item?.url || ''));
}

function getSourceHost(item) {
  try {
    return new URL(String(item?.url || '')).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function isOfficialLegalSource(item) {
  const host = getSourceHost(item);
  const source = normalizeText(`${item?.fuente || item?.source || ''} ${item?.titulo || item?.title || ''}`);
  const officialHosts = [
    'elperuano.pe',
    'spij.minjus.gob.pe',
    'spijweb.minjus.gob.pe',
    'congreso.gob.pe',
    'leyes.congreso.gob.pe',
    'tc.gob.pe',
    'pj.gob.pe',
    'poderjudicial.gob.pe',
    'mpfn.gob.pe',
    'gob.pe',
    'minjus.gob.pe',
    'sunat.gob.pe',
    'sunarp.gob.pe',
    'indecopi.gob.pe',
    'servir.gob.pe',
    'mimp.gob.pe'
  ];
  return officialHosts.some(officialHost => host === officialHost || host.endsWith(`.${officialHost}`))
    || /\b(diario oficial|el peruano|spij|congreso de la republica|tribunal constitucional|poder judicial|ministerio publico|sunat|sunarp|indecopi|servir|mimp)\b/.test(source);
}

function isSecondaryLegalSource(item) {
  const host = getSourceHost(item);
  const source = normalizeText(`${item?.fuente || item?.source || ''} ${item?.titulo || item?.title || ''}`);
  return host.includes('lpderecho.pe')
    || source.includes('lp derecho')
    || source.includes('blog')
    || source.includes('portal juridico');
}

function scoreSourceQuality(item) {
  let score = Number(item?.relevance || 0);
  if (itemHasExternalUrl(item)) score += 15;
  if (isOfficialLegalSource(item)) score += 100;
  if ((item?.module || item?.modulo) === 'normativa') score += 24;
  if ((item?.module || item?.modulo) === 'doctrina') score += 4;
  if ((item?.module || item?.modulo) === 'sentencias_tc') score += 18;
  if ((item?.module || item?.modulo) === 'casaciones') score += 14;
  if (isSecondaryLegalSource(item)) score -= 35;
  if (isGenericSourceResult(item)) score -= 50;
  return score;
}

function isGenericSourceResult(item) {
  const text = normalizeText([
    item?.titulo,
    item?.title,
    item?.fuente,
    item?.source,
    item?.resumen,
    item?.excerpt
  ].join(' '));
  return text.includes('plataforma del estado peruano')
    || text.includes('que es gob pe')
    || text.includes('directorio nacional de redes sociales')
    || text.includes('lexia engine web discovery')
    || (text.includes('constitucion politica del peru') && text.includes('constitucion politica peru 2025 md'))
    || text.includes('resumen los derechos laborales')
    || text.includes('derechos laborales basicos')
    || text.includes('legal faqs')
    || text.includes('referencias fuente labor rights');
}

function splitLegalSections(raw) {
  return String(raw || '')
    .split(/\n{2,}|(?=^#{1,3}\s)|(?=\bArticulo\s+\d)|(?=\bArtículo\s+\d)/m)
    .map(section => section.replace(/\s+/g, ' ').trim())
    .filter(section => section.length >= 80);
}

function inferLegalType(fileName, text) {
  const normalized = normalizeText(`${fileName} ${text}`);
  if (normalized.includes('constitucion politica') || normalized.includes('constitución política')) return 'legal_article';
  if (normalized.includes('casacion') || normalized.includes('casación')) return 'cassation';
  if (normalized.includes('jurisprudencia') || normalized.includes('sentencia') || normalized.includes('precedente')) return 'jurisprudence';
  if (normalized.includes('articulo') || normalized.includes('artículo') || normalized.includes('codigo') || normalized.includes('código') || normalized.includes('ley')) return 'legal_article';
  return 'legal_document';
}

function buildLegalRecord(fileName, text, index) {
  const cleanText = text.trim();
  const heading = cleanText.match(/^(#{1,3}\s*)?(.{8,90}?)(?:\.|\:|\-|$)/)?.[2]?.trim();
  const type = inferLegalType(fileName, cleanText);
  return {
    id: `${type}:${fileName}:${index}`,
    type,
    title: heading || fileName.replace(/[_-]/g, ' ').replace(/\.md$/i, ''),
    source: fileName,
    excerpt: cleanText.slice(0, 520),
    content: cleanText
  };
}

function buildLegalCollections() {
  const collections = {
    legal_documents: [],
    legal_articles: [],
    jurisprudence: [],
    cassations: []
  };
  const kbDir = path.join(aiEngineRoot, 'kb');
  if (!fs.existsSync(kbDir)) return collections;

  const files = fs.readdirSync(kbDir).filter(file => file.endsWith('.md'));
  for (const file of files) {
    const raw = fs.readFileSync(path.join(kbDir, file), 'utf8');
    splitLegalSections(raw).forEach((section, index) => {
      const record = buildLegalRecord(file, section, index);
      if (record.type === 'cassation') collections.cassations.push(record);
      else if (record.type === 'jurisprudence') collections.jurisprudence.push(record);
      else if (record.type === 'legal_article') collections.legal_articles.push(record);
      else collections.legal_documents.push(record);
    });
  }
  return collections;
}

const legalIndex = buildLegalCollections();
const legalSearchCorpus = [
  ...legalIndex.legal_documents,
  ...legalIndex.legal_articles,
  ...legalIndex.jurisprudence,
  ...legalIndex.cassations
];

function scoreLegalRecord(record, query, terms) {
  const normalizedContent = normalizeText(`${record.title} ${record.excerpt} ${record.content}`);
  const normalizedQuery = normalizeText(query);
  const legalConceptPhrases = extractLegalConceptPhrases(query);
  const conceptTerms = new Set(legalConceptPhrases.flatMap(phrase => phrase.split(' ')));
  const articleRefs = extractArticleReferences(query);
  const genericNormativeTerms = new Set([
    'ley', 'norma', 'legal', 'derecho', 'derechos', 'tener', 'permite', 'permiten',
    'reconoce', 'cual', 'cuales', 'cuál', 'cuáles', 'fundamento', 'base', 'sustento',
    'articulo', 'art', 'inciso', 'codigo', 'constitucion', 'decreto'
  ]);
  let score = 0;

  if (normalizedContent.includes(normalizedQuery)) score += 20;
  for (const phrase of legalConceptPhrases) {
    if (normalizedContent.includes(phrase)) {
      score += 45;
      if (record.type === 'legal_article' && normalizeText(record.title).includes('articulo')) {
        score += 120;
      }
    }
  }
  for (const term of terms) {
    if (genericNormativeTerms.has(term) || (legalConceptPhrases.length && conceptTerms.has(term))) continue;
    const matches = normalizedContent.match(new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'));
    if (matches) score += Math.min(matches.length, 8) * 3;
    if (normalizeText(record.title).includes(term)) score += 4;
  }

  for (const article of articleRefs) {
    const exactArticlePattern = new RegExp(`\\b(?:articulo|art)\\s+${article}\\b`);
    if (exactArticlePattern.test(normalizedContent)) score += 140;
  }

  if (record.type === 'legal_article') score += 3;
  if (record.type === 'jurisprudence') score += 2;
  if (record.type === 'cassation') score += 2;
  return score;
}

function searchLegalEngine(query, limit = 12) {
  if (!shouldSearchLegalEngine(query)) return [];
  const terms = getQueryTerms(query);
  if (!terms.length) return [];

  return legalSearchCorpus
    .map(record => ({
      id: record.id,
      type: record.type,
      title: record.title,
      source: record.source,
      excerpt: record.excerpt,
      relevance: scoreLegalRecord(record, query, terms)
    }))
    .filter(result => result.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, limit);
}

function truncateForRag(value, maxLength = 900) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength).trim()}...`;
}

function buildRagContext(query, structuredResults = [], limit = 8) {
  const normalizedQueryForScope = normalizeText(query);
  const queryHasMinorContext = /\b(menor|menores|niño|nino|niña|nina|adolescente|abuso sexual|violacion sexual|violación sexual|tocamientos|actos libidinosos|revictimizacion|revictimización)\b/.test(normalizedQueryForScope);
  const queryHasPartnerViolenceContext = /\b(pareja|conviviente|ex pareja|expareja|esposo|esposa|enamorado|enamorada|violencia familiar|violencia contra la mujer|agresion|agresión|agredio|agredió|golpe|golpes|lesiones|amenaza|amenazas)\b/.test(normalizedQueryForScope);
  const adultPartnerScope = queryHasPartnerViolenceContext && !queryHasMinorContext;
  const isMinorAbuseResult = item => {
    const rawText = [
      item?.titulo,
      item?.title,
      item?.materia,
      item?.matter,
      item?.resumen,
      item?.excerpt
    ].filter(Boolean).join(' ').toLowerCase();
    const text = normalizeText([
      item?.titulo,
      item?.title,
      item?.materia,
      item?.matter,
      item?.resumen,
      item?.excerpt
    ].join(' '));
    return /\b(abuso sexual|menor|menores|niñ|nin|adolescente|tocamientos|actos libidinosos|176-a|ley 30403)\b/i.test(rawText)
      || /\bart(?:\.|iculo|ículo)?\s*173\b/i.test(rawText)
      || text.includes('abuso sexual contra menores')
      || text.includes('menor de edad')
      || text.includes('menores')
      || text.includes('menores de edad')
      || text.includes('nino')
      || text.includes('nina')
      || text.includes('adolescente')
      || text.includes('tocamientos')
      || text.includes('actos libidinosos')
      || text.includes('art. 173')
      || text.includes('articulo 173')
      || text.includes('artículo 173')
      || text.includes('176-a');
  };
  const isCompatibleWithCurrentScope = item => {
    if (adultPartnerScope && isMinorAbuseResult(item)) return false;
    return true;
  };
  const buildIntelligenceText = item => {
    const intelligence = item.inteligencia && typeof item.inteligencia === 'object' ? item.inteligencia : {};
    const parts = [];
    if (Array.isArray(intelligence.hechos_clave) && intelligence.hechos_clave.length) {
      parts.push(`Hechos clave: ${intelligence.hechos_clave.join('; ')}`);
    }
    if (Array.isArray(intelligence.problemas_juridicos) && intelligence.problemas_juridicos.length) {
      parts.push(`Problemas jurídicos: ${intelligence.problemas_juridicos.join('; ')}`);
    }
    if (Array.isArray(intelligence.reglas_practicas) && intelligence.reglas_practicas.length) {
      parts.push(`Reglas prácticas: ${intelligence.reglas_practicas.join('; ')}`);
    }
    if (Array.isArray(intelligence.riesgos) && intelligence.riesgos.length) {
      parts.push(`Riesgos: ${intelligence.riesgos.join('; ')}`);
    }
    if (Array.isArray(intelligence.documentos) && intelligence.documentos.length) {
      parts.push(`Documentos a revisar: ${intelligence.documentos.join('; ')}`);
    }
    if (Array.isArray(intelligence.pasos) && intelligence.pasos.length) {
      parts.push(`Pasos sugeridos: ${intelligence.pasos.join('; ')}`);
    }
    if (Array.isArray(intelligence.preguntas) && intelligence.preguntas.length) {
      parts.push(`Preguntas útiles: ${intelligence.preguntas.join('; ')}`);
    }
    return parts.join('\n');
  };
  const documentResults = searchLegalEngine(query, limit);
  const topStructured = Array.isArray(structuredResults) ? structuredResults[0] : null;
  const topMatter = normalizeText(topStructured?.materia || topStructured?.matter || '');
  const topTitle = normalizeText(topStructured?.titulo || topStructured?.title || '');
  const penalContext = Number(topStructured?.relevance || 0) >= 60
    && (topMatter.includes('penal') || topTitle.includes('abuso sexual') || topTitle.includes('menores'));
  const isPenalDocument = item => {
    const text = normalizeText([
      item?.title,
      item?.source,
      item?.excerpt,
      item?.content
    ].join(' '));
    return text.includes('codigo penal')
      || text.includes('código penal')
      || text.includes('derecho penal')
      || text.includes('delito')
      || text.includes('fiscalia')
      || text.includes('ministerio publico')
      || text.includes('casacion');
  };
  const isRelevantToPenalContext = item => {
    if (!penalContext) return true;
    const text = normalizeText([
      item?.titulo,
      item?.title,
      item?.materia,
      item?.matter,
      item?.resumen,
      item?.excerpt,
      item?.contenido,
      item?.content
    ].join(' '));
    return text.includes('penal')
      || text.includes('delito')
      || text.includes('abuso')
      || text.includes('violacion')
      || text.includes('tocamientos')
      || text.includes('actos libidinosos')
      || text.includes('menor')
      || text.includes('niño')
      || text.includes('niña')
      || text.includes('adolescente')
      || text.includes('familia');
  };
  const normalizedStructured = structuredResults
    .filter(isCompatibleWithCurrentScope)
    .filter(isRelevantToPenalContext)
    .map(item => ({
    id: `kb:${item.modulo || 'base'}:${item.id}`,
    title: item.titulo || 'Referencia jurídica',
    source: item.fuente || 'Base jurídica local LEXIA',
    module: item.modulo || 'base_juridica',
    matter: item.materia || '',
    url: item.url || '',
    excerpt: item.resumen || item.contenido || '',
    content: [item.contenido || item.resumen || '', buildIntelligenceText(item)].filter(Boolean).join('\n'),
    intelligence: item.inteligencia || {},
    relevance: item.relevance || 0
  }));
  const normalizedDocuments = documentResults
    .filter(isCompatibleWithCurrentScope)
    .filter(item => !penalContext || isPenalDocument(item))
    .map(item => ({
    id: `doc:${item.id}`,
    title: item.title || 'Documento legal',
    source: item.source || 'Archivo jurídico local',
    module: item.type || 'documento',
    matter: '',
    url: '',
    excerpt: item.excerpt || '',
    content: item.excerpt || '',
    relevance: item.relevance || 0
  }));

  const merged = [...normalizedStructured, ...normalizedDocuments]
    .filter(item => !(adultPartnerScope && isMinorAbuseResult(item)))
    .map(item => ({
      ...item,
      rankingScore: Number(item.relevance || 0)
        + (String(item.id || '').startsWith('kb:') ? 30 : 0)
        + (item.module === 'normativa' ? 18 : 0)
        + (item.module === 'legal_article' ? 35 : 0)
        + (itemHasExternalUrl(item) ? 20 : 0)
        + (isOfficialLegalSource(item) ? 80 : 0)
        - (isSecondaryLegalSource(item) ? 30 : 0)
        - (isGenericSourceResult(item) ? 35 : 0)
    }))
    .sort((a, b) => b.rankingScore - a.rankingScore || b.relevance - a.relevance)
    .reduce((acc, item) => {
      if (!acc.some(existing => existing.id === item.id)) acc.push(item);
      return acc;
    }, [])
    .slice(0, limit);

  if (!merged.length) {
    return {
      context: '',
      results: [],
      sources: []
    };
  }

  const context = [
    'CONTEXTO RAG RECUPERADO DE LA BASE LOCAL DE LEXIA:',
    'Usa estas referencias solo como apoyo. Primero responde al caso y al último mensaje del usuario; no conviertas la respuesta en un resumen de fuentes.'
  ];
  if (merged.some(item => item.module === 'doctrina')) {
    context.push('Las referencias marcadas como doctrina explican conceptos y argumentos, pero no son normas vinculantes. Si son extranjeras o históricas, no las presentes como derecho peruano vigente y contrástalas con normativa peruana aplicable.');
  }

  merged.forEach((item, index) => {
    const sourceId = `R${index + 1}`;
    const matter = item.matter ? ` | Materia: ${item.matter}` : '';
    const url = item.url ? ` | URL: ${item.url}` : '';
    context.push('');
    context.push(`[${sourceId}] ${item.title} | Fuente: ${item.source} | Tipo: ${item.module}${matter}${url}`);
    context.push(truncateForRag(item.content || item.excerpt));
  });

  return {
    context: context.join('\n'),
    results: merged,
    sources: merged.map((item, index) => ({
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

console.log(`📁 Motor jurídico local: ${legalSearchCorpus.length} registros indexados`);
console.log(`🏛️ Legal Knowledge Base: ${legalKnowledgeCorpus.length} registros estructurados`);


function searchPrioritizedLegalKnowledgeBase(query, limit = 12) {
  return prioritizeKnowledgeResults(searchLegalKnowledgeBase(query, limit), query);
}

function setLegalIngestedCorpusLoaded(value = true) {
  legalIngestedCorpusLoaded = Boolean(value);
}

function getLegalIngestedEntryCount() {
  return legalIngestedCorpus.length;
}

function getKnowledgeStats() {
  return {
    totalKB,
    legalSearchRecords: legalSearchCorpus.length,
    legalKnowledgeRecords: legalKnowledgeCorpus.length,
    ingestedEntries: legalIngestedCorpus.length
  };
}

return {
  normalizeText,
  getQueryTerms,
  safeFileStem,
  hashContent,
  inferLegalMatterFromText,
  inferLegalKnowledgeModule,
  extractLegalSignals,
  splitTextForLegalKnowledge,
  extractTextFromLegalUpload,
  buildIngestedLegalEntries,
  getCombinedLegalKnowledgeCorpus,
  legalKnowledgeModules,
  normalizeLegalKnowledgeRecord,
  scoreLegalKnowledgeRecord,
  searchLegalKnowledgeBase: searchPrioritizedLegalKnowledgeBase,
  searchRawLegalKnowledgeBase: searchLegalKnowledgeBase,
  evaluateLocalSearchSufficiency,
  logLocalSearchSufficiency,
  getLegalKnowledgeCounts,
  mergeRuntimeLegalKnowledge,
  ensureLegalIngestionDatabase,
  loadLegalIngestedKnowledgeFromDb,
  ensureLegalKnowledgeAvailable,
  persistIngestedLegalKnowledgeToDb,
  persistIngestedLegalKnowledgeLocally,
  filterSourcesForIntent,
  containsNormalizedTerm,
  buildSourceSummary,
  itemHasExternalUrl,
  isOfficialLegalSource,
  isSecondaryLegalSource,
  scoreSourceQuality,
  isGenericSourceResult,
  buildLegalCollections,
  legalIndex,
  legalSearchCorpus,
  searchLegalEngine,
  truncateForRag,
  buildRagContext,
  setLegalIngestedCorpusLoaded,
  getLegalIngestedEntryCount,
  getKnowledgeStats
};
}

module.exports = {
  createKnowledgeEngine
};
