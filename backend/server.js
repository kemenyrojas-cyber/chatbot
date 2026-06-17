const express = require('express');
const path = require('path');
const fs = require('fs');
const fetch = global.fetch || require('node-fetch');
const cors = require('cors');
const { Pool } = require('pg');

const projectRoot = path.join(__dirname, '..');
const frontendRoot = path.join(projectRoot, 'frontend');
const viewsRoot = path.join(frontendRoot, 'src', 'views');
const frontendSrcRoot = path.join(frontendRoot, 'src');
const publicRoot = path.join(frontendRoot, 'public');
const aiEngineRoot = path.join(projectRoot, 'ai-engine');

require('dotenv').config({ path: path.join(projectRoot, '.env') });

const app = express();
const port = process.env.PORT || 3000;
const publicUrl = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL || '';
const openAiKey = process.env.OPENAI_API_KEY;
const legacyDataDir = path.join(projectRoot, 'data');
const databaseUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL || '';
const databaseProvider = process.env.SUPABASE_DATABASE_URL ? 'supabase' : 'postgres';
const defaultDataDir = process.env.RENDER && databaseUrl ? '/var/data' : legacyDataDir;
const dataDir = process.env.DATA_DIR || defaultDataDir;
const accountsPath = process.env.ACCOUNTS_PATH || path.join(dataDir, 'accounts.json');
const legacyAccountsPath = path.join(legacyDataDir, 'accounts.json');
const accountsPool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
    })
  : null;
let accountsDbReady = null;
let accountsJsonSynced = false;
let chatsDbReady = null;

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
  try {
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
    fs.accessSync(accountsDir, fs.constants.R_OK | fs.constants.W_OK);
    fs.accessSync(accountsPath, fs.constants.R_OK | fs.constants.W_OK);

    if (!accountsJsonSynced && accountsPath !== legacyAccountsPath && fs.existsSync(legacyAccountsPath)) {
      const raw = fs.readFileSync(accountsPath, 'utf8');
      const accounts = JSON.parse(raw);
      const currentAccounts = Array.isArray(accounts) ? accounts : [];
      const legacyAccounts = readLegacyAccounts();
      let changed = false;

      for (const account of legacyAccounts) {
        const email = normalizeEmail(account.email);
        const password = String(account.password || '');
        const name = String(account.name || '').trim();
        const profile = String(account.profile || '').trim();
        if (!email || !password || !name || !profile) continue;

        const existingIndex = currentAccounts.findIndex(item => normalizeEmail(item.email) === email);
        const existing = existingIndex >= 0 ? currentAccounts[existingIndex] : null;
        const nextAccount = {
          email,
          password,
          name,
          profile,
          createdAt: existing?.createdAt || account.createdAt || new Date().toISOString()
        };

        if (existingIndex >= 0) {
          if (
            String(existing.password || '') !== password
            || String(existing.name || '').trim() !== name
            || String(existing.profile || '').trim() !== profile
          ) {
            currentAccounts[existingIndex] = nextAccount;
            changed = true;
          }
        } else {
          currentAccounts.push(nextAccount);
          changed = true;
        }
      }

      if (changed) {
        const tempPath = `${accountsPath}.tmp`;
        fs.writeFileSync(tempPath, JSON.stringify(currentAccounts, null, 2), 'utf8');
        fs.renameSync(tempPath, accountsPath);
      }
      accountsJsonSynced = true;
    }
  } catch (error) {
    throw new Error(`No se puede usar el archivo de cuentas en ${accountsPath}: ${error.message}`);
  }
}

function readAccounts() {
  ensureAccountsStore();
  try {
    const raw = fs.readFileSync(accountsPath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('No se pudo leer accounts.json:', error.message);
    throw new Error('No se pudo leer la base de cuentas.');
  }
}

function writeAccounts(accounts) {
  ensureAccountsStore();
  const tempPath = `${accountsPath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(accounts, null, 2), 'utf8');
  fs.renameSync(tempPath, accountsPath);
}

function readLegacyAccounts() {
  try {
    if (!fs.existsSync(legacyAccountsPath)) return [];
    const raw = fs.readFileSync(legacyAccountsPath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('No se pudo migrar data/accounts.json:', error.message);
    return [];
  }
}

function ensureProductionDatabaseConfigured() {
  if (process.env.RENDER && !accountsPool) {
    console.warn('SUPABASE_DATABASE_URL o DATABASE_URL no está configurada. Usando accounts.json como respaldo de autenticación.');
  }
}

async function ensureAccountsDatabase() {
  if (!accountsPool) {
    ensureProductionDatabaseConfigured();
    return;
  }

  if (!accountsDbReady) {
    accountsDbReady = (async () => {
      await accountsPool.query(`
        CREATE TABLE IF NOT EXISTS accounts (
          email TEXT PRIMARY KEY,
          password TEXT NOT NULL,
          name TEXT NOT NULL,
          profile TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      const legacyAccounts = readLegacyAccounts();
      if (legacyAccounts.length) {
        for (const account of legacyAccounts) {
          const email = normalizeEmail(account.email);
          const password = String(account.password || '');
          const name = String(account.name || '').trim();
          const profile = String(account.profile || '').trim();
          if (!email || !password || !name || !profile) continue;

          await accountsPool.query(
            `INSERT INTO accounts (email, password, name, profile, created_at)
             VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, NOW()))
             ON CONFLICT (email) DO UPDATE
             SET password = EXCLUDED.password,
                 name = EXCLUDED.name,
                 profile = EXCLUDED.profile`,
            [email, password, name, profile, account.createdAt || null]
          );
        }
      }
    })();
  }

  return accountsDbReady;
}

async function findAccountByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (accountsPool) {
    await ensureAccountsDatabase();
    const result = await accountsPool.query(
      'SELECT email, password, name, profile, created_at AS "createdAt" FROM accounts WHERE email = $1',
      [normalizedEmail]
    );
    return result.rows[0] || null;
  }

  ensureProductionDatabaseConfigured();
  return readAccounts().find(item => normalizeEmail(item.email) === normalizedEmail) || null;
}

async function createAccount(account) {
  const normalizedAccount = {
    email: normalizeEmail(account.email),
    password: String(account.password || ''),
    name: String(account.name || '').trim(),
    profile: String(account.profile || '').trim()
  };

  if (accountsPool) {
    await ensureAccountsDatabase();
    const result = await accountsPool.query(
      `INSERT INTO accounts (email, password, name, profile)
       VALUES ($1, $2, $3, $4)
       RETURNING email, password, name, profile, created_at AS "createdAt"`,
      [normalizedAccount.email, normalizedAccount.password, normalizedAccount.name, normalizedAccount.profile]
    );
    return result.rows[0];
  }

  ensureProductionDatabaseConfigured();
  const accounts = readAccounts();
  accounts.push({ ...normalizedAccount, createdAt: new Date().toISOString() });
  writeAccounts(accounts);
  return accounts[accounts.length - 1];
}

async function countAccounts() {
  if (accountsPool) {
    await ensureAccountsDatabase();
    const result = await accountsPool.query('SELECT COUNT(*)::int AS count FROM accounts');
    return result.rows[0]?.count || 0;
  }

  ensureProductionDatabaseConfigured();
  return readAccounts().length;
}

async function getAccountsStoreStatus() {
  if (accountsPool) {
    try {
      await ensureAccountsDatabase();
      return {
        ok: true,
        storage: 'postgres',
        provider: databaseProvider,
        databaseUrlConfigured: true,
        accounts: await countAccounts()
      };
    } catch (error) {
      return {
        ok: false,
        storage: 'postgres',
        provider: databaseProvider,
        databaseUrlConfigured: true,
        error: error.message
      };
    }
  }

  try {
    ensureAccountsStore();
    const stats = fs.statSync(accountsPath);
    return {
      ok: true,
      storage: 'json',
      databaseUrlConfigured: false,
      dataDir,
      accountsPath,
      usingPersistentDataDir: dataDir === '/var/data',
      warning: process.env.RENDER
        ? 'SUPABASE_DATABASE_URL o DATABASE_URL no está configurada. Usando accounts.json como respaldo de autenticación.'
        : undefined,
      accounts: await countAccounts(),
      updatedAt: stats.mtime.toISOString()
    };
  } catch (error) {
    return {
      ok: false,
      storage: 'json',
      databaseUrlConfigured: false,
      dataDir,
      accountsPath,
      usingPersistentDataDir: dataDir === '/var/data',
      error: error.message
    };
  }
}

async function ensureChatsDatabase() {
  if (!accountsPool) {
    ensureProductionDatabaseConfigured();
    return false;
  }

  await ensureAccountsDatabase();

  if (!chatsDbReady) {
    chatsDbReady = (async () => {
      await accountsPool.query(`
        CREATE TABLE IF NOT EXISTS chat_sessions (
          id TEXT PRIMARY KEY,
          account_email TEXT NOT NULL REFERENCES accounts(email) ON DELETE CASCADE,
          role TEXT NOT NULL DEFAULT 'abogado-independiente',
          title TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await accountsPool.query(`
        CREATE TABLE IF NOT EXISTS chat_messages (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
          account_email TEXT NOT NULL REFERENCES accounts(email) ON DELETE CASCADE,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await accountsPool.query('CREATE INDEX IF NOT EXISTS idx_chat_sessions_account_updated ON chat_sessions(account_email, updated_at DESC)');
      await accountsPool.query('CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created ON chat_messages(session_id, created_at ASC)');
    })();
  }

  await chatsDbReady;
  return true;
}

function serializeChatMessage(row) {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    metadata: row.metadata || {}
  };
}

function serializeChatSession(row, messages = []) {
  return {
    id: row.id,
    role: row.role,
    title: row.title,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    messages
  };
}

function normalizeClientDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function buildMessageId(sessionId, message) {
  return String(message?.id || `${sessionId}:${message?.role || 'message'}:${message?.createdAt || new Date().toISOString()}:${Buffer.from(String(message?.content || '')).toString('base64').slice(0, 24)}`);
}

async function upsertChatSessionRecord(email, session) {
  const ready = await ensureChatsDatabase();
  if (!ready) throw new Error('PostgreSQL no está configurado para chats.');

  const normalizedEmail = normalizeEmail(email);
  const id = String(session.id || '').trim();
  const title = String(session.title || 'Nueva consulta').trim().slice(0, 120) || 'Nueva consulta';
  const role = String(session.role || 'abogado-independiente').trim() || 'abogado-independiente';
  const createdAt = normalizeClientDate(session.createdAt);
  const updatedAt = normalizeClientDate(session.updatedAt || session.createdAt);

  if (!normalizedEmail || !id) {
    throw new Error('Email e id de conversación son obligatorios.');
  }

  const result = await accountsPool.query(
    `INSERT INTO chat_sessions (id, account_email, role, title, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE
     SET role = EXCLUDED.role,
         title = EXCLUDED.title,
         updated_at = GREATEST(chat_sessions.updated_at, EXCLUDED.updated_at)
     RETURNING id, account_email, role, title, created_at, updated_at`,
    [id, normalizedEmail, role, title, createdAt, updatedAt]
  );

  return result.rows[0];
}

async function insertChatMessageRecord(email, sessionId, message) {
  const ready = await ensureChatsDatabase();
  if (!ready) throw new Error('PostgreSQL no está configurado para chats.');

  const normalizedEmail = normalizeEmail(email);
  const id = buildMessageId(sessionId, message);
  const role = String(message?.role || '').trim();
  const content = String(message?.content || '').trim();
  const createdAt = normalizeClientDate(message?.createdAt);
  const metadata = message?.metadata && typeof message.metadata === 'object' ? message.metadata : {};

  if (!normalizedEmail || !sessionId || !role || !content) {
    throw new Error('Datos de mensaje incompletos.');
  }

  const result = await accountsPool.query(
    `INSERT INTO chat_messages (id, session_id, account_email, role, content, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
     ON CONFLICT (id) DO UPDATE
     SET content = EXCLUDED.content,
         metadata = EXCLUDED.metadata
     RETURNING id, session_id, account_email, role, content, metadata, created_at`,
    [id, sessionId, normalizedEmail, role, content, JSON.stringify(metadata), createdAt]
  );

  await accountsPool.query(
    'UPDATE chat_sessions SET updated_at = GREATEST(updated_at, $2::timestamptz) WHERE id = $1',
    [sessionId, createdAt]
  );

  return result.rows[0];
}

async function getChatMessages(sessionId, email) {
  const ready = await ensureChatsDatabase();
  if (!ready) throw new Error('PostgreSQL no está configurado para chats.');

  const result = await accountsPool.query(
    `SELECT id, role, content, metadata, created_at
     FROM chat_messages
     WHERE session_id = $1 AND account_email = $2
     ORDER BY created_at ASC`,
    [sessionId, normalizeEmail(email)]
  );
  return result.rows.map(serializeChatMessage);
}

async function getChatSessions(email, role = '') {
  const ready = await ensureChatsDatabase();
  if (!ready) throw new Error('PostgreSQL no está configurado para chats.');

  const values = [normalizeEmail(email)];
  const roleClause = role ? 'AND role = $2' : '';
  if (role) values.push(String(role));

  const result = await accountsPool.query(
    `SELECT id, account_email, role, title, created_at, updated_at
     FROM chat_sessions
     WHERE account_email = $1 ${roleClause}
     ORDER BY updated_at DESC
     LIMIT 120`,
    values
  );

  const sessions = [];
  for (const row of result.rows) {
    sessions.push(serializeChatSession(row, await getChatMessages(row.id, email)));
  }
  return sessions;
}

async function persistChatExchange(email, session, userMessage, assistantMessage) {
  if (!email || !session?.id || !userMessage?.content || !assistantMessage?.content) return false;
  try {
    await upsertChatSessionRecord(email, session);
    await insertChatMessageRecord(email, session.id, userMessage);
    await insertChatMessageRecord(email, session.id, assistantMessage);
    return true;
  } catch (error) {
    console.warn('No se pudo persistir chat en PostgreSQL:', error.message);
    return false;
  }
}

function sanitizeAccount(account) {
  return {
    email: normalizeEmail(account.email),
    name: String(account.name || '').trim(),
    profile: String(account.profile || '')
  };
}

function sendView(res, filename) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.sendFile(path.join(viewsRoot, filename));
}

app.get('/', (req, res) => {
  sendView(res, 'landing.html');
});

app.get('/app', (req, res) => {
  sendView(res, 'index.html');
});

app.use('/css', express.static(path.join(frontendSrcRoot, 'css'), { index: false }));
app.use('/js', express.static(path.join(frontendSrcRoot, 'js'), { index: false }));
app.use('/img', express.static(path.join(publicRoot, 'img'), { index: false }));
app.use(express.static(publicRoot, { index: false }));

app.get('/login', (req, res) => {
  sendView(res, 'login.html');
});

app.get('/registro', (req, res) => {
  sendView(res, 'registro.html');
});

app.get('/recuperar-password', (req, res) => {
  sendView(res, 'recuperar-password.html');
});

app.get('/api/auth/status', async (req, res) => {
  const status = await getAccountsStoreStatus();
  return res.status(status.ok ? 200 : 500).json(status);
});

app.get('/api/auth/account', async (req, res) => {
  try {
    const email = normalizeEmail(req.query.email);
    if (!email) {
      return res.status(400).json({ error: 'El correo es obligatorio.' });
    }

    const account = await findAccountByEmail(email);
    if (!account) {
      return res.status(404).json({ error: 'Ese correo no está registrado.' });
    }

    return res.json({ account: sanitizeAccount(account) });
  } catch (error) {
    console.error('Error consultando cuenta:', error.message);
    return res.status(500).json({ error: 'No se pudo consultar la base de cuentas.' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    const name = String(req.body?.name || '').trim();
    const profile = String(req.body?.profile || '').trim();

    if (!name || !email || !password || !profile) {
      return res.status(400).json({ error: 'Completa todos los campos requeridos.' });
    }

    const existing = await findAccountByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'Ese correo ya está registrado.' });
    }

    const account = await createAccount({ email, password, name, profile });

    return res.status(201).json({ account: sanitizeAccount(account) });
  } catch (error) {
    console.error('Error registrando cuenta:', error.message);
    return res.status(500).json({
      error: 'No se pudo guardar la cuenta. Revisa que Render tenga SUPABASE_DATABASE_URL o DATABASE_URL configurada.'
    });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'Correo y contraseña son obligatorios.' });
    }

    const account = await findAccountByEmail(email);
    if (!account) {
      return res.status(404).json({ field: 'email', error: 'Ese correo no está registrado.' });
    }

    if (String(account.password || '') !== password) {
      return res.status(401).json({ field: 'password', error: 'La contraseña es incorrecta.' });
    }

    return res.json({ account: sanitizeAccount(account) });
  } catch (error) {
    console.error('Error iniciando sesión:', error.message);
    return res.status(500).json({ error: 'No se pudo leer la base de cuentas.' });
  }
});

app.get('/api/chats', async (req, res) => {
  try {
    const email = normalizeEmail(req.query.email);
    const role = String(req.query.role || '').trim();
    if (!email) {
      return res.status(400).json({ error: 'El correo es obligatorio.' });
    }

    const chats = await getChatSessions(email, role);
    return res.json({ chats });
  } catch (error) {
    console.error('Error consultando chats:', error.message);
    const status = error.message.includes('PostgreSQL') ? 503 : 500;
    return res.status(status).json({ error: 'No se pudieron consultar las conversaciones.' });
  }
});

app.post('/api/chats', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const session = req.body?.session || req.body || {};
    if (!email || !session.id) {
      return res.status(400).json({ error: 'Email e id de conversación son obligatorios.' });
    }

    const row = await upsertChatSessionRecord(email, session);
    const messages = Array.isArray(session.messages) ? session.messages : [];
    for (const message of messages) {
      if (message?.role === 'system') continue;
      await insertChatMessageRecord(email, row.id, message);
    }

    return res.status(201).json({
      chat: serializeChatSession(row, await getChatMessages(row.id, email))
    });
  } catch (error) {
    console.error('Error guardando chat:', error.message);
    const status = error.message.includes('PostgreSQL') ? 503 : 500;
    return res.status(status).json({ error: 'No se pudo guardar la conversación.' });
  }
});

app.get('/api/chats/:id/messages', async (req, res) => {
  try {
    const email = normalizeEmail(req.query.email);
    const sessionId = String(req.params.id || '').trim();
    if (!email || !sessionId) {
      return res.status(400).json({ error: 'Email e id de conversación son obligatorios.' });
    }

    const messages = await getChatMessages(sessionId, email);
    return res.json({ messages });
  } catch (error) {
    console.error('Error consultando mensajes:', error.message);
    const status = error.message.includes('PostgreSQL') ? 503 : 500;
    return res.status(status).json({ error: 'No se pudieron consultar los mensajes.' });
  }
});

app.post('/api/chats/:id/messages', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const sessionId = String(req.params.id || '').trim();
    const message = req.body?.message || req.body || {};
    if (!email || !sessionId || !message.role || !message.content) {
      return res.status(400).json({ error: 'Email, conversación y mensaje son obligatorios.' });
    }

    const row = await insertChatMessageRecord(email, sessionId, message);
    return res.status(201).json({ message: serializeChatMessage(row) });
  } catch (error) {
    console.error('Error guardando mensaje:', error.message);
    const status = error.message.includes('PostgreSQL') ? 503 : 500;
    return res.status(status).json({ error: 'No se pudo guardar el mensaje.' });
  }
});

app.delete('/api/chats/:id', async (req, res) => {
  try {
    const email = normalizeEmail(req.query.email || req.body?.email);
    const sessionId = String(req.params.id || '').trim();
    if (!email || !sessionId) {
      return res.status(400).json({ error: 'Email e id de conversación son obligatorios.' });
    }

    const ready = await ensureChatsDatabase();
    if (!ready) {
      return res.status(503).json({ error: 'PostgreSQL no está configurado para chats.' });
    }

    await accountsPool.query(
      'DELETE FROM chat_sessions WHERE id = $1 AND account_email = $2',
      [sessionId, email]
    );
    return res.json({ ok: true });
  } catch (error) {
    console.error('Error eliminando chat:', error.message);
    const status = error.message.includes('PostgreSQL') ? 503 : 500;
    return res.status(status).json({ error: 'No se pudo eliminar la conversación.' });
  }
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

const legalIntentTypes = [
  {
    id: 'consulta_informativa',
    label: 'Consulta informativa',
    patterns: [
      'quiero saber', 'quisiera saber', 'necesito saber', 'que es', 'qué es',
      'explicame', 'explícame', 'informacion sobre', 'información sobre',
      'saber sobre', 'hablame de', 'háblame de', 'consulta sobre'
    ]
  },
  {
    id: 'analisis_caso',
    label: 'Análisis de caso',
    patterns: [
      'mi caso', 'me paso', 'me pasó', 'denuncie', 'denuncié', 'me denunciaron',
      'me demandaron', 'quiero demandar', 'puedo denunciar', 'puedo demandar',
      'que puedo hacer', 'qué puedo hacer'
    ]
  },
  {
    id: 'redaccion_documento',
    label: 'Redacción o revisión de documento',
    patterns: [
      'redacta', 'prepara', 'modelo de', 'plantilla', 'contrato de',
      'demanda de', 'carta notarial', 'escrito', 'revisar documento'
    ]
  },
  {
    id: 'busqueda_jurisprudencia',
    label: 'Búsqueda de jurisprudencia',
    patterns: [
      'jurisprudencia', 'casacion', 'casación', 'sentencia', 'precedente',
      'criterio del tribunal', 'criterio de la corte'
    ]
  }
];

const legalAreas = [
  {
    id: 'derecho_penal',
    label: 'Derecho Penal',
    keywords: [
      'penal', 'delito', 'denuncia', 'fiscalia', 'fiscalía', 'pena', 'prision', 'prisión',
      'extorsion', 'extorsión', 'robo', 'hurto', 'estafa', 'fraude', 'homicidio',
      'lesiones', 'amenaza', 'amenazas', 'violencia', 'coaccion', 'coacción',
      'secuestro', 'difamacion', 'difamación', 'injuria', 'calumnia'
    ],
    topics: [
      { id: 'extorsion', label: 'Extorsión', keywords: ['extorsion', 'extorsión', 'chantaje', 'amenaza para pagar', 'cobro de cupos'] },
      { id: 'robo', label: 'Robo', keywords: ['robo', 'asaltaron', 'asalto'] },
      { id: 'hurto', label: 'Hurto', keywords: ['hurto', 'sustraccion', 'sustracción'] },
      { id: 'estafa', label: 'Estafa', keywords: ['estafa', 'fraude', 'engaño'] },
      { id: 'difamacion', label: 'Difamación', keywords: ['difamacion', 'difamación', 'injuria', 'calumnia'] }
    ]
  },
  {
    id: 'derecho_laboral',
    label: 'Derecho Laboral',
    keywords: ['laboral', 'trabajo', 'despido', 'sueldo', 'salario', 'cts', 'gratificacion', 'gratificación', 'vacaciones', 'empleador'],
    topics: [
      { id: 'despido', label: 'Despido', keywords: ['despido', 'despidieron', 'despedido'] },
      { id: 'beneficios_sociales', label: 'Beneficios sociales', keywords: ['cts', 'gratificacion', 'gratificación', 'vacaciones', 'liquidacion', 'liquidación'] }
    ]
  },
  {
    id: 'derecho_civil',
    label: 'Derecho Civil',
    keywords: ['civil', 'contrato', 'compraventa', 'propiedad', 'posesion', 'posesión', 'inmueble', 'herencia', 'sucesion', 'sucesión'],
    topics: [
      { id: 'contrato', label: 'Contrato', keywords: ['contrato', 'clausula', 'cláusula'] },
      { id: 'compraventa', label: 'Compraventa', keywords: ['compraventa', 'compra venta'] },
      { id: 'posesion', label: 'Posesión', keywords: ['posesion', 'posesión', 'posesion precaria', 'posesión precaria'] },
      { id: 'herencia', label: 'Herencia', keywords: ['herencia', 'sucesion', 'sucesión', 'testamento'] }
    ]
  },
  {
    id: 'derecho_familia',
    label: 'Derecho de Familia',
    keywords: ['familia', 'alimentos', 'divorcio', 'tenencia', 'visitas', 'custodia', 'patria potestad'],
    topics: [
      { id: 'alimentos', label: 'Alimentos', keywords: ['alimentos', 'pension alimenticia', 'pensión alimenticia'] },
      { id: 'divorcio', label: 'Divorcio', keywords: ['divorcio', 'separacion', 'separación'] },
      { id: 'tenencia', label: 'Tenencia', keywords: ['tenencia', 'custodia', 'visitas'] }
    ]
  },
  {
    id: 'derecho_administrativo',
    label: 'Derecho Administrativo',
    keywords: ['administrativo', 'municipalidad', 'entidad publica', 'entidad pública', 'procedimiento administrativo', 'sancion', 'sanción', 'multa'],
    topics: [
      { id: 'multa', label: 'Multa administrativa', keywords: ['multa', 'sancion', 'sanción'] },
      { id: 'procedimiento_administrativo', label: 'Procedimiento administrativo', keywords: ['procedimiento administrativo', 'recurso administrativo'] }
    ]
  },
  {
    id: 'derecho_tributario',
    label: 'Derecho Tributario',
    keywords: ['tributario', 'sunat', 'impuesto', 'igv', 'renta', 'fiscalizacion', 'fiscalización'],
    topics: [
      { id: 'impuestos', label: 'Impuestos', keywords: ['impuesto', 'igv', 'renta'] },
      { id: 'fiscalizacion', label: 'Fiscalización tributaria', keywords: ['fiscalizacion', 'fiscalización', 'sunat'] }
    ]
  }
];

function includesAny(normalizedText, patterns) {
  return patterns.some(pattern => normalizedText.includes(normalizeText(pattern)));
}

function classifyLegalIntent(query) {
  const normalized = normalizeText(query);
  const terms = getQueryTerms(query);
  const matchedType = legalIntentTypes.find(type => includesAny(normalized, type.patterns));
  const matchedArea = legalAreas.find(area => includesAny(normalized, area.keywords));
  const matchedTopic = matchedArea?.topics.find(topic => includesAny(normalized, topic.keywords));
  const fallbackTopic = terms.length ? terms.join(' ') : '';

  return {
    type: {
      id: matchedType?.id || 'consulta_general',
      label: matchedType?.label || 'Consulta general',
      confidence: matchedType ? 'alta' : 'baja'
    },
    area: {
      id: matchedArea?.id || 'area_no_determinada',
      label: matchedArea?.label || 'Área no determinada',
      confidence: matchedArea ? 'alta' : 'baja'
    },
    topic: {
      id: matchedTopic?.id || (fallbackTopic ? fallbackTopic.replace(/\s+/g, '_') : 'tema_no_determinado'),
      label: matchedTopic?.label || fallbackTopic || 'Tema no determinado',
      confidence: matchedTopic ? 'alta' : (fallbackTopic ? 'media' : 'baja')
    },
    originalQuery: String(query || '').trim(),
    needsMoreFacts: !matchedArea || !matchedTopic
  };
}

function isGreetingOnly(text) {
  const normalized = normalizeText(text);
  return /^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|ola|hi|hello)( lexia)?$/.test(normalized);
}

function isConversationalFollowUp(text) {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  const legalTerms = getQueryTerms(text);
  const fillerWords = new Set([
    'asi', 'así', 'explica', 'explicame', 'explícame', 'explicamelo', 'explícamelo',
    'entiendo', 'entendi', 'entendí', 'claro', 'mejor', 'simple', 'sencillo',
    'resumen', 'resume', 'detalla', 'continua', 'continúa', 'sigue', 'ok',
    'vale', 'perfecto', 'gracias', 'no', 'si', 'sí', 'eso', 'esa', 'este'
  ]);
  const meaningfulTerms = legalTerms.filter(term => !fillerWords.has(term));
  const followUpPattern = /^(asi|así|explica|explicame|explícame|explicamelo|explícamelo|hazlo|dilo|ponlo|resumelo|resúmelo|resume|continua|continúa|sigue|no entendi|no entendí|no entiendo|mas claro|más claro|en simple|en sencillo|ok|vale|gracias)(\s.*)?$/;
  return followUpPattern.test(normalized) && meaningfulTerms.length < 2 && !isLegalQuery(text);
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
    'Hola, soy LEXIA. Estoy aquí para ayudarte a entender tu consulta legal paso a paso, con lenguaje claro y sin complicarte con tecnicismos innecesarios.',
    '',
    'Cuéntame qué pasó, qué documento tienes o qué duda quieres resolver. Si todavía no sabes cómo explicarlo, puedes empezar con algo simple como: "tengo un problema con mi contrato", "me despidieron", "quiero saber sobre alimentos" o "necesito preparar una demanda".',
    '',
    'Yo te ayudo a ordenar los hechos, ubicar el área legal y ver los siguientes pasos.'
  ].join('\n');
}

function buildFollowUpClarificationAnswer() {
  return [
    'Claro. Te lo explico con gusto, pero necesito saber sobre qué tema o caso quieres que lo haga.',
    '',
    'Puedes escribirme una frase corta, por ejemplo:',
    '- "Explícame el despido arbitrario"',
    '- "Explícame qué hacer si me deben alimentos"',
    '- "Explícame cómo responder una carta notarial"',
    '- "Explícame este contrato"',
    '',
    'Si estabas respondiendo a una explicación anterior, copia una parte o dime el tema y lo pongo en palabras más simples.'
  ].join('\n');
}

function shouldSearchLegalEngine(query) {
  if (isGreetingOnly(query) || isConversationalFollowUp(query)) return false;
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
    return `Entiendo la consulta sobre "${query}". En la base jurídica local no encontré una coincidencia directa con esos términos.\n\nPara ayudarte mejor, prueba agregando un dato concreto: la materia, la institución jurídica, la norma, el expediente, una casación o el hecho principal. Por ejemplo: "despido arbitrario con contrato indeterminado" o "posesión precaria sin contrato escrito".`;
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
    `Revisé la base jurídica local para "${query}" y encontré ${results.length} resultado(s) que pueden servirte como punto de partida.`,
    '',
    'Te los ordeno por relevancia para que puedas ubicar primero lo más cercano al caso:'
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

  lines.push('', 'Siguiente paso sugerido: revisa si alguno de estos resultados coincide con los hechos de tu caso. Si me das más detalles, puedo ayudarte a convertirlo en una explicación más clara y práctica.');
  lines.push('', 'Nota: respuesta generada con Legal Knowledge Base local de LEXIA, sin IA generativa.');
  return lines.join('\n');
}

function filterSourcesForIntent(results, intent) {
  const topic = normalizeText(intent?.topic?.label || '');
  const topicId = normalizeText(intent?.topic?.id || '');
  const area = normalizeText(intent?.area?.label || '');
  const hasSpecificTopic = topic && !['tema no determinado', ''].includes(topic);

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

    if (hasSpecificTopic && (sourceText.includes(topic) || sourceText.includes(topicId))) return true;
    if (!hasSpecificTopic && area && sourceText.includes(area)) return true;
    return false;
  });
}

function buildSourceSummary(results, intent, limit = 3) {
  const relevantSources = filterSourcesForIntent(results, intent);

  if (!relevantSources.length) {
    return [
      'Fuentes y verificación',
      `No encontré una fuente específica sobre ${intent?.topic?.label || 'este tema'} en la base local. Conviene verificar la norma aplicable en El Peruano, SPIJ, Ministerio Público, Poder Judicial o la entidad competente.`
    ].join('\n');
  }

  const lines = ['Fuentes y verificación'];
  relevantSources.slice(0, limit).forEach((item, index) => {
    const title = item.titulo || item.title || 'Referencia jurídica';
    const source = item.fuente || item.source || 'Base jurídica local LEXIA';
    const matter = item.materia ? ` | Materia: ${item.materia}` : '';
    const url = item.url ? `\nURL: ${item.url}` : '';
    lines.push(`${index + 1}. ${title} | Fuente: ${source}${matter}${url}`);
  });
  return lines.join('\n');
}

function buildTopicGuidance(intent) {
  const topicId = intent?.topic?.id || '';
  const areaId = intent?.area?.id || '';

  if (topicId === 'extorsion') {
    return [
      'La extorsión, en palabras simples, ocurre cuando alguien usa amenazas, violencia o presión ilegítima para obligar a otra persona a entregar dinero, bienes, hacer algo o dejar de hacer algo.',
      '',
      'En un caso así, lo más importante es no manejarlo solo. Guarda mensajes, audios, números, capturas, cuentas bancarias, nombres o cualquier dato que permita identificar a la persona. Evita borrar conversaciones y no acuerdes pagos sin orientación, porque eso puede aumentar el riesgo.',
      '',
      'Como primer paso práctico, conviene hacer la denuncia ante la Policía Nacional o el Ministerio Público. Si hay amenaza inmediata contra tu vida, familia o negocio, prioriza tu seguridad y busca ayuda urgente.'
    ];
  }

  if (topicId === 'robo') {
    return [
      'El robo implica apoderarse de un bien ajeno usando violencia o amenaza. Esa violencia o intimidación es lo que lo diferencia del hurto.',
      '',
      'Si ocurrió recientemente, conviene denunciar cuanto antes, conservar pruebas, identificar testigos y guardar cualquier documento, foto o video relacionado.'
    ];
  }

  if (topicId === 'hurto') {
    return [
      'El hurto es la sustracción de un bien ajeno sin violencia ni amenaza directa contra la persona.',
      '',
      'Para orientarte mejor habría que revisar qué bien fue sustraído, cómo ocurrió, si hay cámaras, testigos o documentos que acrediten propiedad.'
    ];
  }

  if (topicId === 'despido') {
    return [
      'En un despido, lo primero es revisar si hubo una causa legal válida y si el empleador siguió el procedimiento correcto.',
      '',
      'Guarda contrato, boletas, carta de despido, correos, mensajes, asistencia y cualquier prueba de la relación laboral.'
    ];
  }

  if (topicId === 'divorcio') {
    return [
      'En divorcio, la ruta depende de si ambas partes están de acuerdo y de si hay hijos, bienes o pensión de alimentos por resolver.',
      '',
      'Antes de elegir la vía, conviene ordenar partida de matrimonio, documentos de hijos, bienes comunes y acuerdos posibles.'
    ];
  }

  if (areaId === 'derecho_penal') {
    return [
      'Por lo que escribes, estamos ante una consulta de Derecho Penal. En estos temas importa mucho distinguir si buscas información general, si eres víctima, si te investigan o si ya existe denuncia.',
      '',
      'Cuéntame qué ocurrió, cuándo pasó, si hay denuncia y qué pruebas tienes para orientarte con más precisión.'
    ];
  }

  return [
    `Entiendo que quieres orientación sobre ${intent?.topic?.label || 'este tema'}. Con la información actual puedo darte una guía general, pero para afinarla necesito algunos datos del caso.`,
    '',
    'Lo más útil es saber qué ocurrió, cuándo ocurrió, qué documentos o pruebas existen y qué resultado buscas.'
  ];
}

function buildConversationalLegalAnswer(query, intent, results) {
  const lines = [
    `Entiendo. Por lo que me cuentas, esto parece relacionarse con ${intent.topic.label} dentro de ${intent.area.label}.`,
    ''
  ];

  lines.push(...buildTopicGuidance(intent));
  lines.push('');
  lines.push('Para ayudarte mejor, respóndeme solo lo que tengas a la mano:');
  lines.push('1. ¿Qué pasó y cuándo ocurrió?');
  lines.push('2. ¿Tienes documentos, mensajes, contrato, denuncia, carta, resolución o alguna prueba?');
  lines.push('3. ¿Qué resultado buscas: orientarte, responder, denunciar, demandar, negociar o preparar un documento?');
  lines.push('');
  lines.push('Con esos datos puedo darte una orientación más precisa, próximos pasos y los documentos que conviene reunir.');
  lines.push('');
  lines.push('Nota: esto es orientación general. Si hay riesgo actual, amenazas concretas o plazos próximos, conviene buscar apoyo inmediato de la autoridad competente y asesoría legal directa.');
  lines.push('');
  lines.push(buildSourceSummary(results, intent));

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

function truncateForRag(value, maxLength = 900) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength).trim()}...`;
}

function buildRagContext(query, structuredResults = [], limit = 8) {
  const documentResults = searchLegalEngine(query, 8);
  const normalizedStructured = structuredResults.map(item => ({
    id: `kb:${item.modulo || 'base'}:${item.id}`,
    title: item.titulo || 'Referencia jurídica',
    source: item.fuente || 'Base jurídica local LEXIA',
    module: item.modulo || 'base_juridica',
    matter: item.materia || '',
    url: item.url || '',
    excerpt: item.resumen || item.contenido || '',
    content: item.contenido || item.resumen || '',
    relevance: item.relevance || 0
  }));
  const normalizedDocuments = documentResults.map(item => ({
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
    .sort((a, b) => b.relevance - a.relevance)
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
    'Usa estas referencias como fuente principal. Si una respuesta requiere una fuente que no está aquí, dilo claramente y sugiere verificar en una fuente oficial.'
  ];

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

function buildLocalLegalAnswer(query, results) {
  if (!results.length) {
    return `Entiendo tu consulta sobre "${query}". Con esos términos no encontré una coincidencia directa en la base jurídica local.\n\nPara orientarte mejor, agrega datos como materia, norma, institución jurídica, documento disponible, fecha aproximada o el hecho principal. Con eso puedo acercarme más a tu situación.`;
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
    `Revisé la base jurídica local para "${query}" y encontré ${results.length} resultado(s) jurídicos relacionados.`,
    '',
    'Te muestro primero los más relevantes:'
  ];

  Object.entries(grouped).forEach(([label, items]) => {
    lines.push('', label);
    items.slice(0, 4).forEach((item, index) => {
      lines.push(`${index + 1}. ${item.title}`);
      lines.push(`Fuente: ${item.source} | Relevancia: ${item.relevance}`);
      lines.push(item.excerpt);
    });
  });

  lines.push('', 'Si quieres, puedes contarme los hechos principales del caso y usaré estos resultados para darte una orientación más conversada y práctica.');
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
    'prisión','indemnización','daño','perjuicio','responsabilidad','culpa','negligencia','fraude','estafa','extorsión','extorsion',
    'robo','hurto','violencia','acoso','difamación','injuria','calumnia','agresión','asalto','homicidio',
    'aborto','adopción','patria potestad','guarda','visita','pensión','renta','cuota','arancel','honorario',
    'empresa','sociedad','quiebra','insolvencia','liquidación','ley','código','articulado','inciso'
  ];
  return keywords.some(k => text.toLowerCase().includes(k));
}

app.post('/api/legal-intent', (req, res) => {
  const query = String(req.body?.query || req.body?.prompt || '').trim();
  if (!query) {
    return res.status(400).json({ error: 'La consulta es obligatoria.' });
  }

  return res.json({
    query,
    intent: classifyLegalIntent(extractUserQuery(query))
  });
});

app.post('/api/legal-query', (req, res) => {
  const query = String(req.body?.query || '').trim();
  if (!query) {
    return res.status(400).json({ error: 'La consulta es obligatoria.' });
  }

  const results = searchLegalEngine(query);
  return res.json({
    query,
    intent: classifyLegalIntent(query),
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
    intent: classifyLegalIntent(query),
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
    const chatEmail = normalizeEmail(req.body?.email);
    const chatSessionId = String(req.body?.sessionId || '').trim();
    const chatRole = String(req.body?.role || 'abogado-independiente').trim() || 'abogado-independiente';
    const chatTitle = String(req.body?.title || userQuery || 'Nueva consulta').trim().slice(0, 120) || 'Nueva consulta';
    const userCreatedAt = normalizeClientDate(req.body?.userCreatedAt);
    const assistantCreatedAt = normalizeClientDate(req.body?.assistantCreatedAt);
    const chatSession = chatSessionId
      ? {
          id: chatSessionId,
          role: chatRole,
          title: chatTitle,
          createdAt: req.body?.sessionCreatedAt || userCreatedAt,
          updatedAt: assistantCreatedAt
        }
      : null;
    const userMessage = chatSessionId
      ? {
          id: req.body?.userMessageId || `${chatSessionId}:user:${userCreatedAt}`,
          role: 'user',
          content: userQuery,
          createdAt: userCreatedAt
        }
      : null;
    const persistAnswer = async (answer, metadata = {}) => {
      if (!chatEmail || !chatSessionId || !chatSession || !userMessage) return false;
      return persistChatExchange(chatEmail, chatSession, userMessage, {
        id: req.body?.assistantMessageId || `${chatSessionId}:assistant:${assistantCreatedAt}`,
        role: 'assistant',
        content: answer,
        createdAt: assistantCreatedAt,
        metadata
      });
    };
    const intent = classifyLegalIntent(userQuery);
    if (isGreetingOnly(userQuery)) {
      const answer = buildGreetingAnswer();
      const persisted = await persistAnswer(answer, { model: 'local-greeting', source: 'LEXIA' });
      return res.json({
        answer,
        intent,
        results: [],
        source: 'LEXIA',
        fallback: false,
        model: 'local-greeting',
        persisted
      });
    }
    if (isConversationalFollowUp(userQuery)) {
      const answer = buildFollowUpClarificationAnswer();
      const persisted = await persistAnswer(answer, { model: 'local-follow-up', source: 'LEXIA' });
      return res.json({
        answer,
        intent,
        results: [],
        source: 'LEXIA',
        fallback: false,
        model: 'local-follow-up',
        persisted
      });
    }
    const localResults = searchLegalKnowledgeBase(userQuery);
    const ragContext = buildRagContext(userQuery, localResults);
    if (!openAiKey) {
      const answer = buildConversationalLegalAnswer(userQuery, intent, ragContext.results);
      const persisted = await persistAnswer(answer, { model: 'local-rag-engine', source: 'LEXIA RAG Local', ragSources: ragContext.sources });
      return res.json({
        answer,
        intent,
        results: ragContext.results,
        ragSources: ragContext.sources,
        source: 'LEXIA RAG Local',
        fallback: true,
        model: 'local-rag-engine',
        persisted
      });
    }

    // CONFIG
    const model = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
    const embModel = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
    const temperature = Number(process.env.OPENAI_TEMPERATURE || 0.35);

    // SISTEMA EXPERTO EN DERECHO PERUANO
    const systemPrompt = `Eres LEXIA, una IA jurídica especializada en Derecho peruano. Tu función en "Nueva Consulta (IA)" es conversar con la persona como lo haría un abogado cercano, paciente y claro: escuchas primero, explicas con palabras entendibles y luego das criterio jurídico riguroso, útil y verificable cuando existan fuentes.

PERSONALIDAD Y ESTILO:
- Mantén una conversación amable, humana y profesional. No respondas como un buscador ni como un formulario.
- Empieza reconociendo brevemente la preocupación del usuario cuando corresponda: "Entiendo", "Veamos el caso", "Con esos datos, lo importante es...".
- Usa lenguaje sencillo antes de introducir términos técnicos. Cuando uses un término jurídico, explícalo en una frase corta.
- Si faltan datos, no te limites a decir que falta información: responde lo posible con supuestos claros y formula 2 a 4 preguntas concretas para continuar la conversación.
- Evita respuestas frías, excesivamente largas o llenas de tecnicismos. Prioriza frases directas, ejemplos simples y próximos pasos.
- Puedes usar "te recomiendo", "conviene revisar" y "lo primero sería", dejando claro que es orientación general y no patrocinio legal.
- Haz que la persona se sienta acompañada: resume su problema en una frase, valida la preocupación sin exagerar y continúa con una guía práctica.
- No empieces con listas largas si el usuario hizo una pregunta simple. Primero responde en una frase clara y luego amplía si hace falta.

CAPACIDADES QUE DEBES EJECUTAR EN CADA RESPUESTA:
- Chat con IA jurídica: responde la pregunta concreta antes de ampliar.
- Consulta de leyes: identifica normas, códigos, artículos, requisitos, plazos y autoridades competentes cuando aplique.
- Jurisprudencia: cita sentencias, precedentes, criterios o jurisprudencia solo si aparecen en la base de conocimiento o si el usuario los proporciona. No inventes números de expediente, fechas, salas ni citas.
- Análisis de casos: si hay hechos, separa hechos relevantes, problema jurídico, regla aplicable, análisis y conclusión.
- Sugerencias inteligentes: incluye próximos pasos prácticos, documentos a reunir, riesgos y preguntas de seguimiento útiles.
- Fuentes citadas: termina con una sección "Fuentes y verificación" indicando las normas o referencias usadas. Si no hay fuente específica en el contexto, dilo claramente y recomienda verificar en El Peruano, SPIJ, PJ, TC o la entidad competente.
- RAG: antes de responder, usa el "CONTEXTO RAG RECUPERADO" cuando exista. Cita las referencias recuperadas como [R1], [R2], etc. No inventes fuentes que no estén en ese contexto.

ESPECIALIDAD EN DERECHO PERUANO:
- Civil: contratos, obligaciones, bienes, herencias, familia.
- Penal: delitos, penas y procedimiento penal.
- Laboral: trabajo, remuneración, seguridad social y despidos.
- Comercial: empresas, sociedades e insolvencia.
- Tributario: impuestos y obligaciones fiscales.
- Procesal: juicios, recursos y medidas cautelares.
- Administrativo: actos, recursos y contratación pública.
- Constitucional: derechos fundamentales y garantías.

FORMATO DE RESPUESTA:
No uses un formato rígido si la consulta es simple. Organiza la respuesta como una conversación clara con estas partes cuando aporten valor:
1. Primero, una respuesta directa y entendible.
2. Luego, la explicación legal en lenguaje sencillo.
3. Si corresponde, base legal, criterios o jurisprudencia relevante.
4. Después, pasos prácticos y documentos que conviene reunir.
5. Cierra con preguntas de seguimiento útiles o con "Fuentes y verificación" cuando hayas usado normas o referencias.

REGLAS:
- Siempre responde en español, con tono profesional, cercano y claro.
- Prioriza Derecho peruano salvo que el usuario indique otra jurisdicción.
- Si falta información clave, responde con supuestos explícitos y preguntas concretas.
- Advierte cuando sea necesaria revisión de un abogado o documento real.
- No presentes orientación general como asesoría legal definitiva.
- No hagas valoraciones morales; limita la respuesta al análisis legal.
- No afirmes tener información en tiempo real si no está disponible en el contexto.`;

    const context = ragContext.context;
    const intentContext = [
      'INTENCIÓN JURÍDICA DETECTADA:',
      `Tipo: ${intent.type.label}`,
      `Área: ${intent.area.label}`,
      `Tema: ${intent.topic.label}`,
      `Confianza: tipo=${intent.type.confidence}, área=${intent.area.confidence}, tema=${intent.topic.confidence}`
    ].join('\n');

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
            content: systemPrompt + '\n\n' + intentContext + (context ? '\n\n' + context : '')
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
      const answer = buildConversationalLegalAnswer(userQuery, intent, ragContext.results);
      const persisted = await persistAnswer(answer, { model: 'local-rag-engine', source: 'LEXIA RAG Local', ragSources: ragContext.sources, providerError: mapped.error });
      return res.json({
        answer,
        intent,
        results: ragContext.results,
        ragSources: ragContext.sources,
        source: 'LEXIA RAG Local',
        fallback: true,
        providerError: mapped.error,
        providerCode: parsedError?.error?.code || null,
        model: 'local-rag-engine',
        persisted
      });
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.trim() || 'No se pudo generar respuesta';
    const persisted = await persistAnswer(answer, { model, source: 'LEXIA (lpderecho.pe + OpenAI)', ragSources: ragContext.sources });
    
    res.json({ 
      answer,
      intent,
      ragSources: ragContext.sources,
      source: 'LEXIA (lpderecho.pe + OpenAI)',
      model,
      retrieval: {
        mode: 'rag',
        results: ragContext.results.length
      },
      persisted
    });
  } catch (error) {
    console.error('❌ Error interno:', error);
    const query = extractUserQuery(req.body?.prompt);
    const localResults = query ? searchLegalKnowledgeBase(query) : [];
    const intent = query ? classifyLegalIntent(query) : null;
    res.json({
      answer: query
        ? buildConversationalLegalAnswer(query, intent, localResults)
        : 'LEXIA no pudo procesar la consulta, pero la base jurídica local está disponible en /api/legal-search.',
      intent,
      results: localResults,
      source: 'LEXIA Legal Knowledge Base',
      fallback: true,
      providerError: 'Error interno usando el proveedor generativo.',
      model: 'local-legal-engine'
    });
  }
});

app.listen(port, async () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 LEXIA - ASESOR JURÍDICO INTELIGENTE');
  console.log('='.repeat(60));
  console.log(`\n🌐 Servidor local: http://localhost:${port}`);
  if (publicUrl) {
    console.log(`🌎 Servidor publico: ${publicUrl}`);
  }
  const accountsStatus = await getAccountsStoreStatus();
  const accountsStoreLabel = accountsStatus.storage === 'postgres'
    ? 'PostgreSQL'
    : accountsStatus.accountsPath;
  console.log(`👤 Cuentas: ${accountsStatus.ok ? '✅' : '❌'} ${accountsStoreLabel}`);
  if (!accountsStatus.ok) {
    console.log(`   Error cuentas: ${accountsStatus.error}`);
  }
  console.log(`📚 Base de conocimiento: ${totalKB} KB`);
  console.log(`🔑 OpenAI: ${openAiKey ? '✅ Conectado' : '❌ No configurado'}`);
  console.log(`💱 Modelo: ${process.env.OPENAI_MODEL || 'gpt-3.5-turbo'}`);
  console.log('\n' + '='.repeat(60) + '\n');
});
