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

app.post('/api/chat', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt || !prompt.trim()) return res.status(400).json({ error: 'El prompt es obligatorio.' });
    if (!openAiKey) return res.status(500).json({ error: 'OPENAI_API_KEY no configurada. Contacta al administrador.' });

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
      return res.status(mapped.status).json({ error: mapped.error, providerCode: parsedError?.error?.code || null });
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
    res.status(500).json({ error: 'Error interno del servidor' });
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
