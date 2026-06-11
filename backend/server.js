const express = require('express');
const path = require('path');
const fs = require('fs');
const fetch = global.fetch || require('node-fetch');
const cors = require('cors');

const projectRoot = path.join(__dirname, '..');
const frontendRoot = path.join(projectRoot, 'frontend');
const viewsRoot = path.join(frontendRoot, 'src', 'views');
const frontendSrcRoot = path.join(frontendRoot, 'src');
const publicRoot = path.join(frontendRoot, 'public');
const aiEngineRoot = path.join(projectRoot, 'ai-engine');

require('dotenv').config({ path: path.join(projectRoot, '.env') });

const app = express();
const port = process.env.PORT || 3000;
const openAiKey = process.env.OPENAI_API_KEY;
const legacyDataDir = path.join(projectRoot, 'data');
const dataDir = process.env.DATA_DIR || legacyDataDir;
const accountsPath = process.env.ACCOUNTS_PATH || path.join(dataDir, 'accounts.json');
const legacyAccountsPath = path.join(legacyDataDir, 'accounts.json');

if (!openAiKey) {
  console.warn('\n⚠️ WARNING: OPENAI_API_KEY no está configurada.');
  console.warn('Crea un archivo .env con: OPENAI_API_KEY=tu_clave_api\n');
}

app.use(express.json());
app.use(cors());

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function ensureAccountsStore() {
  const accountsDir = path.dirname(accountsPath);
  if (!fs.existsSync(accountsDir)) {
    fs.mkdirSync(accountsDir, { recursive: true });
  }
  if (!fs.existsSync(accountsPath)) {
    if (accountsPath !== legacyAccountsPath && fs.existsSync(legacyAccountsPath)) {
      fs.copyFileSync(legacyAccountsPath, accountsPath);
    } else {
      fs.writeFileSync(accountsPath, '[]', 'utf8');
    }
  }
}

function readAccounts() {
  ensureAccountsStore();
  try {
    const raw = fs.readFileSync(accountsPath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAccounts(accounts) {
  ensureAccountsStore();
  fs.writeFileSync(accountsPath, JSON.stringify(accounts, null, 2), 'utf8');
}

function sanitizeAccount(account) {
  return {
    email: normalizeEmail(account.email),
    name: String(account.name || '').trim(),
    profile: String(account.profile || '')
  };
}

app.get('/', (req, res) => {
  res.sendFile(path.join(viewsRoot, 'landing.html'));
});

app.get('/app', (req, res) => {
  res.sendFile(path.join(viewsRoot, 'index.html'));
});

app.use('/css', express.static(path.join(frontendSrcRoot, 'css'), { index: false }));
app.use('/js', express.static(path.join(frontendSrcRoot, 'js'), { index: false }));
app.use('/img', express.static(path.join(publicRoot, 'img'), { index: false }));
app.use(express.static(publicRoot, { index: false }));

app.get('/login', (req, res) => {
  res.sendFile(path.join(viewsRoot, 'login.html'));
});

app.get('/registro', (req, res) => {
  res.sendFile(path.join(viewsRoot, 'registro.html'));
});

app.get('/recuperar-password', (req, res) => {
  res.sendFile(path.join(viewsRoot, 'recuperar-password.html'));
});

app.get('/api/auth/account', (req, res) => {
  const email = normalizeEmail(req.query.email);
  if (!email) {
    return res.status(400).json({ error: 'El correo es obligatorio.' });
  }

  const account = readAccounts().find(item => normalizeEmail(item.email) === email);
  if (!account) {
    return res.status(404).json({ error: 'Ese correo no está registrado.' });
  }

  return res.json({ account: sanitizeAccount(account) });
});

app.post('/api/auth/register', (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');
  const name = String(req.body?.name || '').trim();
  const profile = String(req.body?.profile || '').trim();

  if (!name || !email || !password || !profile) {
    return res.status(400).json({ error: 'Completa todos los campos requeridos.' });
  }

  const accounts = readAccounts();
  const existing = accounts.find(item => normalizeEmail(item.email) === email);
  if (existing) {
    return res.status(409).json({ error: 'Ese correo ya está registrado.' });
  }

  const account = { email, password, name, profile, createdAt: new Date().toISOString() };
  accounts.push(account);
  writeAccounts(accounts);

  return res.status(201).json({ account: sanitizeAccount(account) });
});

app.post('/api/auth/login', (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');

  if (!email || !password) {
    return res.status(400).json({ error: 'Correo y contraseña son obligatorios.' });
  }

  const account = readAccounts().find(item => normalizeEmail(item.email) === email);
  if (!account) {
    return res.status(404).json({ field: 'email', error: 'Ese correo no está registrado.' });
  }

  if (String(account.password || '') !== password) {
    return res.status(401).json({ field: 'password', error: 'La contraseña es incorrecta.' });
  }

  return res.json({ account: sanitizeAccount(account) });
});

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
    'dias', 'tardes', 'noches', 'gracias', 'lexia'
  ]);
  return normalizeText(query)
    .split(' ')
    .filter(term => term.length >= 3 && !stopwords.has(term));
}

function isGreetingOnly(text) {
  const normalized = normalizeText(text);
  return /^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|ola|hi|hello)( lexia)?$/.test(normalized);
}

function extractUserQuery(prompt) {
  const text = String(prompt || '').trim();
  const marker = 'Consulta del usuario:';
  const markerIndex = text.lastIndexOf(marker);
  if (markerIndex === -1) return text;
  return text.slice(markerIndex + marker.length).trim();
}

function buildGreetingAnswer() {
  return [
    'Hola, soy LEXIA. Puedo ayudarte con consulta jurídica, jurisprudencia, normativa, documentos, clientes, casos, agenda y plantillas.',
    '',
    'Escribe tu consulta con un tema concreto, por ejemplo: "posesión precaria", "despido arbitrario", "casación sobre alimentos" o "requisitos de una demanda civil".'
  ].join('\n');
}

function shouldSearchLegalEngine(query) {
  if (isGreetingOnly(query)) return false;
  const terms = getQueryTerms(query);
  return isLegalQuery(query) || terms.length >= 2;
}

const legalKnowledgeModules = ['normativa', 'jurisprudencia', 'casaciones', 'sentencias_tc'];

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

function scoreLegalKnowledgeRecord(record, query, terms) {
  const normalizedQuery = normalizeText(query);
  const normalizedTitle = normalizeText(record.titulo);
  const normalizedSummary = normalizeText(record.resumen);
  const normalizedMatter = normalizeText(record.materia);
  const normalizedBody = normalizeText(`${record.titulo} ${record.materia} ${record.resumen} ${record.contenido} ${record.fuente}`);
  let score = 0;

  if (normalizedBody.includes(normalizedQuery)) score += 25;
  if (normalizedTitle.includes(normalizedQuery)) score += 20;
  for (const term of terms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = normalizedBody.match(new RegExp(`\\b${escaped}`, 'g'));
    if (matches) score += Math.min(matches.length, 10) * 3;
    if (normalizedTitle.includes(term)) score += 7;
    if (normalizedMatter.includes(term)) score += 5;
    if (normalizedSummary.includes(term)) score += 4;
  }

  if (record.modulo === 'normativa') score += 3;
  if (record.modulo === 'jurisprudencia') score += 4;
  if (record.modulo === 'casaciones') score += 4;
  if (record.modulo === 'sentencias_tc') score += 4;
  return score;
}

function searchLegalKnowledgeBase(query, limit = 12) {
  if (!shouldSearchLegalEngine(query)) return [];
  const terms = getQueryTerms(query);
  if (!terms.length) return [];

  return legalKnowledgeCorpus
    .map(record => ({
      id: record.id,
      titulo: record.titulo,
      materia: record.materia,
      fecha: record.fecha,
      fuente: record.fuente,
      url: record.url,
      contenido: record.contenido,
      resumen: record.resumen,
      modulo: record.modulo,
      relevance: scoreLegalKnowledgeRecord(record, query, terms)
    }))
    .filter(result => result.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, limit);
}

function getLegalKnowledgeCounts() {
  return legalKnowledgeModules.reduce((acc, moduleName) => {
    acc[moduleName] = legalKnowledgeBase[moduleName].length;
    return acc;
  }, {});
}

function buildLegalKnowledgeAnswer(query, results) {
  if (!results.length) {
    return `LEXIA no encontró coincidencias directas para "${query}" en la base jurídica local.\n\nPrueba con materia, institución jurídica, norma, expediente, casación o palabras clave más específicas.`;
  }

  const labels = {
    normativa: 'Normativa',
    jurisprudencia: 'Jurisprudencia',
    casaciones: 'Casaciones',
    sentencias_tc: 'Sentencias TC'
  };
  const grouped = results.reduce((acc, item) => {
    const label = labels[item.modulo] || 'Resultados';
    acc[label] = acc[label] || [];
    acc[label].push(item);
    return acc;
  }, {});

  const lines = [
    `LEXIA encontró ${results.length} resultado(s) en la base jurídica local para "${query}".`,
    '',
    'Resultados ordenados por relevancia:'
  ];

  Object.entries(grouped).forEach(([label, items]) => {
    lines.push('', label);
    items.slice(0, 4).forEach((item, index) => {
      lines.push(`${index + 1}. ${item.titulo}`);
      lines.push(`Materia: ${item.materia || 'No especificada'} | Fuente: ${item.fuente} | Relevancia: ${item.relevance}`);
      if (item.url) lines.push(`URL: ${item.url}`);
      lines.push(item.resumen || item.contenido.slice(0, 320));
    });
  });

  lines.push('', 'Nota: respuesta generada con Legal Knowledge Base local de LEXIA, sin IA generativa.');
  return lines.join('\n');
}

function splitLegalSections(raw) {
  return String(raw || '')
    .split(/\n{2,}|(?=^#{1,3}\s)/m)
    .map(section => section.replace(/\s+/g, ' ').trim())
    .filter(section => section.length >= 80);
}

function inferLegalType(fileName, text) {
  const normalized = normalizeText(`${fileName} ${text}`);
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
  let score = 0;

  if (normalizedContent.includes(normalizedQuery)) score += 20;
  for (const term of terms) {
    const matches = normalizedContent.match(new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'));
    if (matches) score += Math.min(matches.length, 8) * 3;
    if (normalizeText(record.title).includes(term)) score += 4;
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

function buildLocalLegalAnswer(query, results) {
  if (!results.length) {
    return `LEXIA no encontró coincidencias directas para "${query}" en la base jurídica local.\n\nSugerencia: prueba con términos más específicos como materia, norma, institución jurídica o hecho relevante.`;
  }

  const grouped = results.reduce((acc, item) => {
    const label = {
      legal_document: 'Documentos legales',
      legal_article: 'Artículos y normativa',
      jurisprudence: 'Jurisprudencia',
      cassation: 'Casaciones'
    }[item.type] || 'Resultados';
    acc[label] = acc[label] || [];
    acc[label].push(item);
    return acc;
  }, {});

  const lines = [
    `LEXIA encontró ${results.length} resultado(s) jurídicos locales para "${query}".`,
    '',
    'Resultados ordenados por relevancia:'
  ];

  Object.entries(grouped).forEach(([label, items]) => {
    lines.push('', label);
    items.slice(0, 4).forEach((item, index) => {
      lines.push(`${index + 1}. ${item.title}`);
      lines.push(`Fuente: ${item.source} | Relevancia: ${item.relevance}`);
      lines.push(item.excerpt);
    });
  });

  lines.push('', 'Nota: respuesta generada con el motor jurídico local de LEXIA, sin IA generativa.');
  return lines.join('\n');
}

console.log(`📁 Motor jurídico local: ${legalSearchCorpus.length} registros indexados`);
console.log(`🏛️ Legal Knowledge Base: ${legalKnowledgeCorpus.length} registros estructurados`);

// Cargar embeddings
let kbEmbeddings = null;
try {
  const embPath = path.join(aiEngineRoot, 'kb', 'embeddings.json');
  if (fs.existsSync(embPath)) {
    kbEmbeddings = JSON.parse(fs.readFileSync(embPath, 'utf8'));
    console.log(`✅ Embeddings cargados: ${kbEmbeddings.length} items`);
  }
} catch (e) {
  console.warn('⚠️ Embeddings no disponibles (usaremos búsqueda de texto)');
}

// Utilidades
function dot(a, b) { return a.reduce((s, v, i) => s + v * b[i], 0); }
function norm(a) { return Math.sqrt(a.reduce((s, v) => s + v * v, 0)); }

function mapOpenAiError(status, errorPayload) {
  const message = errorPayload?.error?.message || '';
  const code = errorPayload?.error?.code || '';

  if (code === 'insufficient_quota') {
    return {
      status: 502,
      error: 'La cuenta de OpenAI no tiene cuota disponible. Revisa billing, usage o usa una API key con saldo.'
    };
  }

  if (status === 401) {
    return {
      status: 502,
      error: 'La API key de OpenAI es inválida o no tiene permisos para este proyecto.'
    };
  }

  if (status === 403) {
    return {
      status: 502,
      error: 'La cuenta de OpenAI no tiene acceso al modelo configurado o a este recurso.'
    };
  }

  if (status === 429) {
    return {
      status: 502,
      error: 'OpenAI rechazó la solicitud por límite de uso o cuota. Intenta de nuevo o revisa tu plan.'
    };
  }

  return {
    status: 502,
    error: message || 'Error conectando con OpenAI.'
  };
}

// Detector robusto de consultas jurídicas
function isLegalQuery(text) {
  if (!text) return false;
  const keywords = [
    'contrato','compraventa','derecho','juzgado','demanda','abogado','inmueble','despido','salario','laboral',
    'tribut','penal','delito','fiscal','familia','alimentos','divorcio','custodia','herencia','testamento',
    'arrendamiento','propiedad','posesión','acción','proceso','litigación','juicio','sentencia','recurso',
    'apelación','casación','habeas corpus','amparo','tutela','mandato','poder','procuración','notario',
    'escritura','registro','hipoteca','embargo','secuestro','incautación','multa','sanción','pena',
    'prisión','indemnización','daño','perjuicio','responsabilidad','culpa','negligencia','fraude','estafa',
    'robo','hurto','violencia','acoso','difamación','injuria','calumnia','agresión','asalto','homicidio',
    'aborto','adopción','patria potestad','guarda','visita','pensión','renta','cuota','arancel','honorario',
    'empresa','sociedad','quiebra','insolvencia','liquidación','ley','código','articulado','inciso'
  ];
  return keywords.some(k => text.toLowerCase().includes(k));
}

app.post('/api/legal-query', (req, res) => {
  const query = String(req.body?.query || '').trim();
  if (!query) {
    return res.status(400).json({ error: 'La consulta es obligatoria.' });
  }

  const results = searchLegalEngine(query);
  return res.json({
    query,
    results,
    searched: shouldSearchLegalEngine(query),
    collections: {
      legal_documents: legalIndex.legal_documents.length,
      legal_articles: legalIndex.legal_articles.length,
      jurisprudence: legalIndex.jurisprudence.length,
      cassations: legalIndex.cassations.length
    }
  });
});

app.post('/api/legal-search', (req, res) => {
  const query = String(req.body?.query || '').trim();
  if (!query) {
    return res.status(400).json({ error: 'La consulta es obligatoria.' });
  }

  const results = searchLegalKnowledgeBase(query);
  return res.json({
    query,
    results,
    searched: shouldSearchLegalEngine(query),
    modules: getLegalKnowledgeCounts()
  });
});

app.post('/api/chat', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt || !prompt.trim()) return res.status(400).json({ error: 'El prompt es obligatorio.' });
    const userQuery = extractUserQuery(prompt);
    if (isGreetingOnly(userQuery)) {
      return res.json({
        answer: buildGreetingAnswer(),
        results: [],
        source: 'LEXIA',
        fallback: false,
        model: 'local-greeting'
      });
    }
    const localResults = searchLegalKnowledgeBase(userQuery);
    if (!openAiKey) {
      return res.json({
        answer: buildLegalKnowledgeAnswer(userQuery, localResults),
        results: localResults,
        source: 'LEXIA Legal Knowledge Base',
        fallback: true,
        model: 'local-legal-engine'
      });
    }

    // CONFIG
    const model = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
    const embModel = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
    const temperature = Number(process.env.OPENAI_TEMPERATURE || 0.1);

    // SISTEMA EXPERTO EN DERECHO PERUANO
    const systemPrompt = `Eres LEXIA, una IA jurídica especializada en Derecho peruano. Tu función en "Nueva Consulta (IA)" es resolver consultas legales con rigor, utilidad práctica y fuentes verificables cuando estén disponibles.

CAPACIDADES QUE DEBES EJECUTAR EN CADA RESPUESTA:
- Chat con IA jurídica: responde la pregunta concreta antes de ampliar.
- Consulta de leyes: identifica normas, códigos, artículos, requisitos, plazos y autoridades competentes cuando aplique.
- Jurisprudencia: cita sentencias, precedentes, criterios o jurisprudencia solo si aparecen en la base de conocimiento o si el usuario los proporciona. No inventes números de expediente, fechas, salas ni citas.
- Análisis de casos: si hay hechos, separa hechos relevantes, problema jurídico, regla aplicable, análisis y conclusión.
- Sugerencias inteligentes: incluye próximos pasos prácticos, documentos a reunir, riesgos y preguntas de seguimiento útiles.
- Fuentes citadas: termina con una sección "Fuentes y verificación" indicando las normas o referencias usadas. Si no hay fuente específica en el contexto, dilo claramente y recomienda verificar en El Peruano, SPIJ, PJ, TC o la entidad competente.

ESPECIALIDAD EN DERECHO PERUANO:
- Civil: contratos, obligaciones, bienes, herencias, familia.
- Penal: delitos, penas y procedimiento penal.
- Laboral: trabajo, remuneración, seguridad social y despidos.
- Comercial: empresas, sociedades e insolvencia.
- Tributario: impuestos y obligaciones fiscales.
- Procesal: juicios, recursos y medidas cautelares.
- Administrativo: actos, recursos y contratación pública.
- Constitucional: derechos fundamentales y garantías.

FORMATO OBLIGATORIO:
1. Respuesta breve
2. Base legal aplicable
3. Análisis jurídico
4. Jurisprudencia o criterios relevantes
5. Recomendaciones y siguientes pasos
6. Fuentes y verificación

REGLAS:
- Siempre responde en español, con tono profesional y claro.
- Prioriza Derecho peruano salvo que el usuario indique otra jurisdicción.
- Si falta información clave, responde con supuestos explícitos y preguntas concretas.
- Advierte cuando sea necesaria revisión de un abogado o documento real.
- No presentes orientación general como asesoría legal definitiva.
- No hagas valoraciones morales; limita la respuesta al análisis legal.
- No afirmes tener información en tiempo real si no está disponible en el contexto.`;

    // RECUPERACIÓN DE CONTEXTO (búsqueda por relevancia)
    let retrieved = '';
    const promptLower = prompt.toLowerCase();
    
    // Búsqueda simple pero efectiva
    if (kbContent.length > 0) {
      const promptTerms = (promptLower.match(/[a-záéíóúñü0-9]{4,}/g) || [])
        .filter((word, index, words) => words.indexOf(word) === index);
      const sentences = kbContent.split(/[.!?\n]+/);
      const relevant = sentences
        .filter(s => {
          const lowerSentence = s.toLowerCase();
          const relevanceScore = promptTerms.reduce((score, word) => {
            if (lowerSentence.includes(word)) score += 1;
            return score;
          }, 0);
          return relevanceScore > 0;
        })
        .slice(0, 10)
        .map(s => s.trim())
        .filter(s => s.length > 20);

      if (relevant.length > 0) {
        retrieved = relevant.map(r => `• ${r}`).join('\n');
      }
    }

    const context = retrieved 
      ? `REFERENCIAS RELEVANTES DE LA BASE DE CONOCIMIENTO:\n${retrieved}\n\n`
      : '';

    // LLAMADA A OPENAI
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'Authorization': `Bearer ${openAiKey}` 
      },
      body: JSON.stringify({
        model,
        messages: [
          { 
            role: 'system', 
            content: systemPrompt + (context ? '\n\n' + context : '') + (kbContent.length > 0 ? '\n\nBASE DE CONOCIMIENTO:\n' + kbContent.substring(0, 4000) : '')
          },
          { 
            role: 'user', 
            content: prompt 
          }
        ],
        max_tokens: 2000,
        temperature
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      let parsedError = null;
      try {
        parsedError = JSON.parse(errorBody);
      } catch {
        parsedError = null;
      }
      console.error('❌ Error OpenAI:', errorBody);
      const mapped = mapOpenAiError(response.status, parsedError);
      return res.json({
        answer: buildLegalKnowledgeAnswer(userQuery, localResults),
        results: localResults,
        source: 'LEXIA Legal Knowledge Base',
        fallback: true,
        providerError: mapped.error,
        providerCode: parsedError?.error?.code || null,
        model: 'local-legal-engine'
      });
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.trim() || 'No se pudo generar respuesta';
    
    res.json({ 
      answer,
      source: 'LEXIA (lpderecho.pe + OpenAI)',
      model
    });
  } catch (error) {
    console.error('❌ Error interno:', error);
    const query = extractUserQuery(req.body?.prompt);
    const localResults = query ? searchLegalKnowledgeBase(query) : [];
    res.json({
      answer: query
        ? buildLegalKnowledgeAnswer(query, localResults)
        : 'LEXIA no pudo procesar la consulta, pero la base jurídica local está disponible en /api/legal-search.',
      results: localResults,
      source: 'LEXIA Legal Knowledge Base',
      fallback: true,
      providerError: 'Error interno usando el proveedor generativo.',
      model: 'local-legal-engine'
    });
  }
});

app.listen(port, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 LEXIA - ASESOR JURÍDICO INTELIGENTE');
  console.log('='.repeat(60));
  console.log(`\n🌐 Servidor: http://localhost:${port}`);
  console.log(`📚 Base de conocimiento: ${totalKB} KB`);
  console.log(`🔑 OpenAI: ${openAiKey ? '✅ Conectado' : '❌ No configurado'}`);
  console.log(`💱 Modelo: ${process.env.OPENAI_MODEL || 'gpt-3.5-turbo'}`);
  console.log('\n' + '='.repeat(60) + '\n');
});
