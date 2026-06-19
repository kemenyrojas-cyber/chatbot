const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const fetch = global.fetch || require('node-fetch');
const cors = require('cors');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const cheerio = require('cheerio');
const { Pool } = require('pg');
const { createLexiaEngine } = require('./lexia-engine/orchestrator');
const { createRateLimiter } = require('./lexia-engine/flow-control');
const { prioritizeKnowledgeResults } = require('./lexia-engine/knowledge-prioritizer');

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
const rawXAiKey = process.env.XAI_API_KEY || '';
const rawGroqKey = process.env.GROQ_API_KEY || process.env.GROCK_API_KEY || '';
const xAiKey = rawXAiKey && !String(rawXAiKey).startsWith('gsk_') ? rawXAiKey : '';
const groqKey = rawGroqKey || (String(rawXAiKey).startsWith('gsk_') ? rawXAiKey : '');
const xAiBaseUrl = String(process.env.XAI_BASE_URL || process.env.GROK_BASE_URL || 'https://api.x.ai/v1').trim().replace(/\/+$/, '');
const grokModel = process.env.XAI_MODEL || process.env.GROK_MODEL || 'grok-4.3';
const groqBaseUrl = String(process.env.GROQ_BASE_URL || process.env.GROCK_BASE_URL || 'https://api.groq.com/openai/v1').trim().replace(/\/+$/, '');
const groqModel = process.env.GROQ_MODEL || process.env.GROCK_MODEL || 'llama-3.3-70b-versatile';
const ollamaBaseUrl = String(process.env.OLLAMA_BASE_URL || '').trim().replace(/\/+$/, '');
const ollamaModel = process.env.OLLAMA_MODEL || 'llama3.1:8b';
const ollamaEnabled = Boolean(ollamaBaseUrl) && process.env.OLLAMA_ENABLED !== 'false';
const configuredAiProvider = String(process.env.AI_PROVIDER || '').trim().toLowerCase();
const forceLocalProvider = configuredAiProvider === 'local';
const externalProviderRequested = Boolean(configuredAiProvider && configuredAiProvider !== 'local');
const preferGrok = !forceLocalProvider && (['grok', 'xai'].includes(configuredAiProvider) || process.env.GROK_PREFER === 'true' || process.env.XAI_PREFER === 'true');
const preferGroq = !forceLocalProvider && (['groq', 'grock'].includes(configuredAiProvider) || (configuredAiProvider === 'grok' && Boolean(groqKey) && !xAiKey) || process.env.GROQ_PREFER === 'true' || process.env.GROCK_PREFER === 'true');
const preferOllama = !forceLocalProvider && (configuredAiProvider === 'ollama' || process.env.OLLAMA_PREFER === 'true');
const providerTimeoutMs = Number(process.env.AI_PROVIDER_TIMEOUT_MS || 45000);
const lexiaQueryRateLimiter = createRateLimiter({
  enabled: process.env.LEXIA_RATE_LIMIT_ENABLED !== 'false',
  windowMs: Number(process.env.LEXIA_RATE_LIMIT_WINDOW_MS || 60000),
  maxRequests: Number(process.env.LEXIA_RATE_LIMIT_MAX || 30),
  bucketLimit: Number(process.env.LEXIA_RATE_LIMIT_BUCKET_LIMIT || 10000)
});
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
let notificationsDbReady = null;
let legalIngestionDbReady = null;
let legalIngestedCorpusLoaded = false;
let legalIngestedCorpus = [];
const legalIngestUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.LEGAL_INGEST_MAX_FILE_MB || 10) * 1024 * 1024,
    files: 1
  }
});

if (!openAiKey) {
  console.warn('\n⚠️ WARNING: OPENAI_API_KEY no está configurada.');
  console.warn('Crea un archivo .env con: OPENAI_API_KEY=tu_clave_api\n');
}

if (ollamaEnabled) {
  console.log(`🧠 Ollama configurado: ${ollamaBaseUrl} | Modelo: ${ollamaModel}`);
}

app.use(express.json({ limit: '15mb' }));
app.use(cors());
app.use(['/api/chat', '/api/legal-query', '/api/legal-search', '/api/legal-engine/feed', '/api/legal-engine/discover'], lexiaQueryRateLimiter);

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

      await accountsPool.query('ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ');

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
      await accountsPool.query('CREATE INDEX IF NOT EXISTS idx_chat_sessions_account_deleted ON chat_sessions(account_email, deleted_at)');
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
     WHERE chat_sessions.deleted_at IS NULL
     RETURNING id, account_email, role, title, created_at, updated_at`,
    [id, normalizedEmail, role, title, createdAt, updatedAt]
  );

  return result.rows[0] || null;
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

  const sessionResult = await accountsPool.query(
    'SELECT 1 FROM chat_sessions WHERE id = $1 AND account_email = $2 AND deleted_at IS NULL',
    [sessionId, normalizedEmail]
  );
  if (!sessionResult.rowCount) {
    throw new Error('La conversación fue eliminada.');
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
    'UPDATE chat_sessions SET updated_at = GREATEST(updated_at, $2::timestamptz) WHERE id = $1 AND deleted_at IS NULL',
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

async function getRecentChatMessages(sessionId, email, limit = 12) {
  const ready = await ensureChatsDatabase();
  if (!ready) throw new Error('PostgreSQL no está configurado para chats.');

  const result = await accountsPool.query(
    `SELECT id, role, content, metadata, created_at
     FROM chat_messages
     WHERE session_id = $1 AND account_email = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [sessionId, normalizeEmail(email), Math.max(1, Math.min(Number(limit) || 12, 12))]
  );

  return result.rows.reverse().map(serializeChatMessage);
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
     WHERE account_email = $1 ${roleClause} AND deleted_at IS NULL
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

async function getDeletedChatIds(email, role = '') {
  const ready = await ensureChatsDatabase();
  if (!ready) throw new Error('PostgreSQL no está configurado para chats.');

  const values = [normalizeEmail(email)];
  const roleClause = role ? 'AND role = $2' : '';
  if (role) values.push(String(role));

  const result = await accountsPool.query(
    `SELECT id
     FROM chat_sessions
     WHERE account_email = $1 ${roleClause} AND deleted_at IS NOT NULL
     ORDER BY deleted_at DESC
     LIMIT 500`,
    values
  );

  return result.rows.map(row => row.id);
}

async function persistChatExchange(email, session, userMessage, assistantMessage) {
  if (!email || !session?.id || !userMessage?.content || !assistantMessage?.content) return false;
  try {
    const row = await upsertChatSessionRecord(email, session);
    if (!row) return false;
    await insertChatMessageRecord(email, session.id, userMessage);
    await insertChatMessageRecord(email, session.id, assistantMessage);
    return true;
  } catch (error) {
    console.warn('No se pudo persistir chat en PostgreSQL:', error.message);
    return false;
  }
}

async function ensureNotificationsDatabase() {
  if (!accountsPool) {
    ensureProductionDatabaseConfigured();
    return false;
  }

  await ensureAccountsDatabase();

  if (!notificationsDbReady) {
    notificationsDbReady = (async () => {
      await accountsPool.query(`
        CREATE TABLE IF NOT EXISTS notifications (
          id TEXT PRIMARY KEY,
          account_email TEXT NOT NULL REFERENCES accounts(email) ON DELETE CASCADE,
          role TEXT NOT NULL DEFAULT 'abogado-independiente',
          title TEXT NOT NULL,
          detail TEXT NOT NULL,
          read BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await accountsPool.query('CREATE INDEX IF NOT EXISTS idx_notifications_account_created ON notifications(account_email, created_at DESC)');
      await accountsPool.query('CREATE INDEX IF NOT EXISTS idx_notifications_account_role_read ON notifications(account_email, role, read)');
    })();
  }

  await notificationsDbReady;
  return true;
}

function serializeNotification(row) {
  return {
    id: row.id,
    role: row.role,
    title: row.title,
    detail: row.detail,
    read: Boolean(row.read),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
  };
}

async function getNotifications(email, role = '') {
  const ready = await ensureNotificationsDatabase();
  if (!ready) throw new Error('PostgreSQL no está configurado para notificaciones.');

  const values = [normalizeEmail(email)];
  const roleClause = role ? 'AND role = $2' : '';
  if (role) values.push(String(role));

  const result = await accountsPool.query(
    `SELECT id, role, title, detail, read, created_at
     FROM notifications
     WHERE account_email = $1 ${roleClause}
     ORDER BY created_at DESC
     LIMIT 100`,
    values
  );

  return result.rows.map(serializeNotification);
}

async function upsertNotificationRecord(email, notification) {
  const ready = await ensureNotificationsDatabase();
  if (!ready) throw new Error('PostgreSQL no está configurado para notificaciones.');

  const normalizedEmail = normalizeEmail(email);
  const id = String(notification?.id || '').trim();
  const role = String(notification?.role || 'abogado-independiente').trim() || 'abogado-independiente';
  const title = String(notification?.title || '').trim().slice(0, 160);
  const detail = String(notification?.detail || '').trim().slice(0, 1000);
  const read = Boolean(notification?.read);
  const createdAt = normalizeClientDate(notification?.createdAt);

  if (!normalizedEmail || !id || !title) {
    throw new Error('Email, id y título de notificación son obligatorios.');
  }

  const result = await accountsPool.query(
    `INSERT INTO notifications (id, account_email, role, title, detail, read, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE
     SET role = EXCLUDED.role,
         title = EXCLUDED.title,
         detail = EXCLUDED.detail,
         read = EXCLUDED.read
     RETURNING id, role, title, detail, read, created_at`,
    [id, normalizedEmail, role, title, detail, read, createdAt]
  );

  return result.rows[0];
}

async function markNotificationsRead(email, role = '') {
  const ready = await ensureNotificationsDatabase();
  if (!ready) throw new Error('PostgreSQL no está configurado para notificaciones.');

  const values = [normalizeEmail(email)];
  const roleClause = role ? 'AND role = $2' : '';
  if (role) values.push(String(role));

  await accountsPool.query(
    `UPDATE notifications
     SET read = TRUE
     WHERE account_email = $1 ${roleClause}`,
    values
  );
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
    const deletedChatIds = await getDeletedChatIds(email, role);
    return res.json({ chats, deletedChatIds });
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
    if (!row) {
      return res.status(200).json({ deleted: true });
    }

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
    const role = String(req.query.role || req.body?.role || 'abogado-independiente').trim() || 'abogado-independiente';
    const sessionId = String(req.params.id || '').trim();
    if (!email || !sessionId) {
      return res.status(400).json({ error: 'Email e id de conversación son obligatorios.' });
    }

    const ready = await ensureChatsDatabase();
    if (!ready) {
      return res.status(503).json({ error: 'PostgreSQL no está configurado para chats.' });
    }

    await accountsPool.query(
      `INSERT INTO chat_sessions (id, account_email, role, title, deleted_at)
       VALUES ($1, $2, $3, 'Conversación eliminada', NOW())
       ON CONFLICT (id) DO UPDATE
       SET deleted_at = NOW(),
           account_email = EXCLUDED.account_email,
           role = COALESCE(chat_sessions.role, EXCLUDED.role)`,
      [sessionId, email, role]
    );
    return res.json({ ok: true });
  } catch (error) {
    console.error('Error eliminando chat:', error.message);
    const status = error.message.includes('PostgreSQL') ? 503 : 500;
    return res.status(status).json({ error: 'No se pudo eliminar la conversación.' });
  }
});

app.get('/api/notifications', async (req, res) => {
  try {
    const email = normalizeEmail(req.query.email);
    const role = String(req.query.role || '').trim();
    if (!email) {
      return res.status(400).json({ error: 'El correo es obligatorio.' });
    }

    const notifications = await getNotifications(email, role);
    return res.json({ notifications });
  } catch (error) {
    console.error('Error consultando notificaciones:', error.message);
    const status = error.message.includes('PostgreSQL') ? 503 : 500;
    return res.status(status).json({ error: 'No se pudieron consultar las notificaciones.' });
  }
});

app.post('/api/notifications', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const notification = req.body?.notification || req.body || {};
    if (!email || !notification.id || !notification.title) {
      return res.status(400).json({ error: 'Email, id y título de notificación son obligatorios.' });
    }

    const row = await upsertNotificationRecord(email, notification);
    return res.status(201).json({ notification: serializeNotification(row) });
  } catch (error) {
    console.error('Error guardando notificación:', error.message);
    const status = error.message.includes('PostgreSQL') ? 503 : 500;
    return res.status(status).json({ error: 'No se pudo guardar la notificación.' });
  }
});

app.patch('/api/notifications/read-all', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email || req.query.email);
    const role = String(req.body?.role || req.query.role || '').trim();
    if (!email) {
      return res.status(400).json({ error: 'El correo es obligatorio.' });
    }

    await markNotificationsRead(email, role);
    return res.json({ ok: true });
  } catch (error) {
    console.error('Error marcando notificaciones:', error.message);
    const status = error.message.includes('PostgreSQL') ? 503 : 500;
    return res.status(status).json({ error: 'No se pudieron marcar las notificaciones.' });
  }
});

app.patch('/api/notifications/:id/read', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email || req.query.email);
    const id = String(req.params.id || '').trim();
    if (!email || !id) {
      return res.status(400).json({ error: 'Email e id de notificación son obligatorios.' });
    }

    const ready = await ensureNotificationsDatabase();
    if (!ready) {
      return res.status(503).json({ error: 'PostgreSQL no está configurado para notificaciones.' });
    }

    await accountsPool.query(
      'UPDATE notifications SET read = TRUE WHERE id = $1 AND account_email = $2',
      [id, email]
    );
    return res.json({ ok: true });
  } catch (error) {
    console.error('Error marcando notificación:', error.message);
    const status = error.message.includes('PostgreSQL') ? 503 : 500;
    return res.status(status).json({ error: 'No se pudo marcar la notificación.' });
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
    'dias', 'tardes', 'noches', 'gracias', 'lexia', 'alexia', 'puedo', 'hacer', 'hago',
    'dime', 'decir', 'explica', 'explícame', 'entiendo'
  ]);
  return normalizeText(query)
    .split(' ')
    .filter(term => term.length >= 3 && !stopwords.has(term));
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

function splitTextForLegalKnowledge(text, maxChunks = 8) {
  const clean = String(text || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) return [];

  const sections = clean
    .split(/\n{2,}|(?=^#{1,3}\s)|(?=\bArticulo\s+\d)|(?=\bArtículo\s+\d)/im)
    .map(section => section.replace(/\s+/g, ' ').trim())
    .filter(section => section.length >= 180);

  const source = sections.length ? sections : [clean.replace(/\s+/g, ' ').trim()];
  const chunks = [];
  for (const section of source) {
    if (chunks.length >= maxChunks) break;
    if (section.length <= 2400) {
      chunks.push(section);
      continue;
    }
    for (let index = 0; index < section.length && chunks.length < maxChunks; index += 2200) {
      chunks.push(section.slice(index, index + 2400).trim());
    }
  }
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

function getAllowedLegalSourceHosts() {
  const configured = String(process.env.LEGAL_ALLOWED_SOURCE_HOSTS || '')
    .split(/[;,]/)
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
  return configured.length ? configured : [
    'elperuano.pe',
    'www.elperuano.pe',
    'tc.gob.pe',
    'www.tc.gob.pe',
    'pj.gob.pe',
    'www.pj.gob.pe',
    'gob.pe',
    'www.gob.pe',
    'sunarp.gob.pe',
    'www.sunarp.gob.pe',
    'sunafil.gob.pe',
    'www.sunafil.gob.pe',
    'lpderecho.pe',
    'www.lpderecho.pe'
  ];
}

function parseTrustedLegalUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || '').trim());
  } catch {
    throw new Error('URL inválida.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Solo se permiten URLs http o https.');
  }

  const host = parsed.hostname.toLowerCase();
  const allowedHosts = getAllowedLegalSourceHosts();
  const allowed = allowedHosts.some(domain => host === domain || host.endsWith(`.${domain}`));
  if (!allowed) {
    throw new Error(`Fuente no permitida para alimentar LEXIA: ${host}`);
  }

  return parsed;
}

async function fetchWithTimeout(url, options = {}) {
  const timeoutMs = Number(options.timeoutMs || process.env.LEGAL_WEB_FETCH_TIMEOUT_MS || 12000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'user-agent': 'LEXIA-Legal-Intelligence/1.0 (+https://chatbot-563e.onrender.com)',
        accept: 'text/html,application/xhtml+xml,application/pdf,text/plain;q=0.9,*/*;q=0.5',
        ...(options.headers || {})
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

function robotsAllowsPath(robotsText, targetPath) {
  const lines = String(robotsText || '').split(/\r?\n/);
  let applies = false;
  const disallows = [];

  for (const rawLine of lines) {
    const line = rawLine.split('#')[0].trim();
    if (!line) continue;
    const [fieldRaw, ...valueParts] = line.split(':');
    const field = String(fieldRaw || '').trim().toLowerCase();
    const value = valueParts.join(':').trim();
    if (field === 'user-agent') {
      const agent = value.toLowerCase();
      applies = agent === '*' || agent.includes('lexia');
      continue;
    }
    if (applies && field === 'disallow' && value) disallows.push(value);
  }

  return !disallows.some(rule => {
    if (rule === '/') return true;
    return targetPath.startsWith(rule);
  });
}

async function verifyRobotsPermission(parsedUrl) {
  if (process.env.LEGAL_WEB_SKIP_ROBOTS === 'true') return true;
  const robotsUrl = `${parsedUrl.origin}/robots.txt`;
  try {
    const response = await fetchWithTimeout(robotsUrl, { timeoutMs: 6000 });
    if (!response.ok) return true;
    const robotsText = await response.text();
    return robotsAllowsPath(robotsText, parsedUrl.pathname || '/');
  } catch (error) {
    console.warn(`[LEXIA Web Ingest] No se pudo verificar robots.txt en ${parsedUrl.hostname}: ${error.message}`);
    return true;
  }
}

function extractReadableHtml(html, url) {
  const $ = cheerio.load(String(html || ''));
  $('script, style, nav, footer, header, aside, form, noscript, svg, iframe').remove();
  const title = $('meta[property="og:title"]').attr('content')
    || $('title').first().text()
    || $('h1').first().text()
    || url;
  const date = $('meta[property="article:published_time"]').attr('content')
    || $('meta[name="date"]').attr('content')
    || $('time').first().attr('datetime')
    || $('time').first().text()
    || '';
  const candidates = [
    $('article').text(),
    $('main').text(),
    $('[role="main"]').text(),
    $('.article, .post, .content, .entry-content, .nota, .news').text(),
    $('body').text()
  ].map(item => String(item || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const text = candidates.sort((a, b) => b.length - a.length)[0] || '';
  return {
    title: String(title || '').replace(/\s+/g, ' ').trim().slice(0, 180),
    date: String(date || '').replace(/\s+/g, ' ').trim().slice(0, 40),
    text
  };
}

async function fetchLegalWebSource(rawUrl) {
  const parsedUrl = parseTrustedLegalUrl(rawUrl);
  const robotsAllowed = await verifyRobotsPermission(parsedUrl);
  if (!robotsAllowed) throw new Error('La fuente bloquea esta ruta en robots.txt.');

  const response = await fetchWithTimeout(parsedUrl.toString());
  if (!response.ok) throw new Error(`La fuente respondió ${response.status}.`);

  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const maxBytes = Number(process.env.LEGAL_WEB_MAX_BYTES || 6 * 1024 * 1024);
  if (buffer.length > maxBytes) throw new Error('La página supera el tamaño máximo permitido.');

  if (contentType.includes('pdf') || parsedUrl.pathname.toLowerCase().endsWith('.pdf')) {
    const parsed = await pdfParse(buffer);
    return {
      title: path.basename(parsedUrl.pathname) || parsedUrl.hostname,
      text: String(parsed.text || ''),
      date: '',
      mimeType: 'application/pdf',
      sourceLabel: parsedUrl.hostname
    };
  }

  if (contentType.includes('html') || contentType.includes('text') || !contentType) {
    const html = buffer.toString('utf8');
    const extracted = extractReadableHtml(html, parsedUrl.toString());
    return {
      title: extracted.title || parsedUrl.hostname,
      text: extracted.text,
      date: extracted.date,
      mimeType: contentType || 'text/html',
      sourceLabel: parsedUrl.hostname
    };
  }

  throw new Error(`Tipo de contenido no soportado desde web: ${contentType}`);
}

function getLegalDiscoverySeedUrls() {
  return String(process.env.LEGAL_DISCOVERY_SEED_URLS || '')
    .split(/[;,]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function normalizeAbsoluteUrl(href, baseUrl) {
  try {
    const parsed = new URL(String(href || '').trim(), baseUrl);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function extractCandidateLinksFromHtml(html, baseUrl, query = '') {
  const $ = cheerio.load(String(html || ''));
  const queryTerms = getQueryTerms(query);
  const candidates = [];
  const seen = new Set();

  $('a[href]').each((_, element) => {
    const href = $(element).attr('href');
    const url = normalizeAbsoluteUrl(href, baseUrl);
    if (!url || seen.has(url)) return;

    let parsed = null;
    try {
      parsed = parseTrustedLegalUrl(url);
    } catch {
      return;
    }

    const label = $(element).text().replace(/\s+/g, ' ').trim().slice(0, 220);
    const haystack = normalizeText(`${label} ${parsed.pathname}`);
    const relevance = queryTerms.length
      ? queryTerms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0)
      : 1;

    if (queryTerms.length && relevance === 0) return;
    seen.add(url);
    candidates.push({
      url: parsed.toString(),
      title: label || parsed.pathname.split('/').filter(Boolean).pop() || parsed.hostname,
      host: parsed.hostname,
      relevance
    });
  });

  return candidates
    .sort((a, b) => b.relevance - a.relevance || a.url.localeCompare(b.url))
    .slice(0, 50);
}

async function discoverLegalSourceCandidates({ query = '', seedUrls = [], limit = 12 } = {}) {
  const seeds = [...new Set((seedUrls.length ? seedUrls : getLegalDiscoverySeedUrls()).map(item => item.trim()).filter(Boolean))];
  const maxLimit = Math.max(1, Math.min(Number(limit) || 12, 25));
  const candidates = [];
  const errors = [];
  const seen = new Set();

  for (const seedUrl of seeds.slice(0, 8)) {
    try {
      const parsedSeed = parseTrustedLegalUrl(seedUrl);
      const response = await fetchWithTimeout(parsedSeed.toString(), {
        headers: { accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5' }
      });
      if (!response.ok) throw new Error(`La semilla respondió ${response.status}.`);

      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      if (!contentType.includes('html') && !contentType.includes('text') && contentType) {
        throw new Error(`La semilla no es HTML/texto: ${contentType}.`);
      }

      const html = await response.text();
      for (const candidate of extractCandidateLinksFromHtml(html, parsedSeed.toString(), query)) {
        if (seen.has(candidate.url)) continue;
        seen.add(candidate.url);
        candidates.push({ ...candidate, seedUrl: parsedSeed.toString() });
        if (candidates.length >= maxLimit) break;
      }
    } catch (error) {
      errors.push({ seedUrl, error: error.message });
    }
    if (candidates.length >= maxLimit) break;
  }

  return { candidates: candidates.slice(0, maxLimit), errors };
}

function evaluateLegalContent(text, title = '', url = '') {
  const normalized = normalizeText(`${title} ${url} ${text.slice(0, 30000)}`);
  const legalTerms = [
    'ley', 'decreto', 'norma', 'reglamento', 'resolucion', 'sentencia', 'casacion',
    'jurisprudencia', 'tribunal constitucional', 'poder judicial', 'demanda', 'proceso',
    'codigo', 'constitucion', 'articulo', 'derecho', 'laboral', 'penal', 'civil',
    'familia', 'administrativo', 'sunarp', 'ministerio', 'publicado', 'vigente'
  ];
  const updateTerms = [
    'actualizado', 'actualizada', 'modifican', 'modifica', 'aprueban', 'aprueba',
    'publican', 'publica', 'vigente', 'entra en vigencia', 'decreto supremo',
    'decreto legislativo', 'ley n', 'resolucion', 'norma legal'
  ];
  const score = legalTerms.reduce((total, term) => total + (normalized.includes(normalizeText(term)) ? 8 : 0), 0)
    + updateTerms.reduce((total, term) => total + (normalized.includes(normalizeText(term)) ? 6 : 0), 0)
    + Math.min(Math.floor(String(text || '').length / 800), 20);

  const isLegal = score >= 24 && String(text || '').trim().length >= 350;
  return {
    isLegal,
    score,
    reason: isLegal
      ? 'contenido jurídico detectado'
      : 'contenido insuficiente o no claramente jurídico',
    signals: {
      legalTerms: legalTerms.filter(term => normalized.includes(normalizeText(term))).slice(0, 12),
      updateTerms: updateTerms.filter(term => normalized.includes(normalizeText(term))).slice(0, 8)
    }
  };
}

function normalizeReviewStatus(value, fallback = 'pending_review') {
  const status = normalizeText(value).replace(/\s+/g, '_');
  return ['approved', 'pending_review', 'rejected'].includes(status) ? status : fallback;
}

function getLegalCuratorEmails() {
  return String(process.env.LEGAL_CURATOR_EMAILS || '')
    .split(',')
    .map(normalizeEmail)
    .filter(Boolean);
}

function isLegalCuratorEmail(email) {
  const curators = getLegalCuratorEmails();
  const normalized = normalizeEmail(email);
  if (!curators.length) {
    return !process.env.RENDER && process.env.NODE_ENV !== 'production';
  }
  return Boolean(normalized && curators.includes(normalized));
}

function assertLegalCuratorAccess(email) {
  if (isLegalCuratorEmail(email)) return true;
  const error = new Error('Esta acción requiere curaduría interna de LEXIA.');
  error.statusCode = 403;
  throw error;
}

function assertLoggedBrainContributor(email) {
  if (normalizeEmail(email)) return true;
  const error = new Error('Debes iniciar sesión para proponer fuentes al cerebro de LEXIA.');
  error.statusCode = 401;
  throw error;
}

const legalIntentTypes = [
  {
    id: 'consulta_normativa',
    label: 'Consulta normativa',
    patterns: [
      'articulo', 'artículo', 'inciso', 'ley', 'codigo', 'código', 'constitucion', 'constitución',
      'art culo', 'constituci',
      'decreto', 'norma', 'reglamento', 'dame el articulo', 'dame el artículo',
      'busca el articulo', 'busca el artículo', 'que dice el articulo', 'qué dice el artículo'
    ]
  },
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
  },
  {
    id: 'orientacion_legal',
    label: 'Orientación legal',
    patterns: [
      'que hago', 'qué hago', 'que puedo hacer', 'qué puedo hacer', 'me paso', 'me pasó',
      'mi empleador', 'mi vecino', 'mi trabajador', 'me quieren', 'me notificaron',
      'ayer', 'hoy', 'plazo tengo', 'plazo para'
    ]
  }
];

const legalAreas = [
  {
    id: 'derecho_constitucional',
    label: 'Derecho Constitucional',
    keywords: [
      'constitucion', 'constitución', 'constitucional', 'derechos fundamentales', 'amparo',
      'constituci',
      'habeas corpus', 'habeas data', 'accion de cumplimiento', 'acción de cumplimiento',
      'tribunal constitucional', 'tc', 'articulo constitucional', 'artículo constitucional'
    ],
    topics: [
      { id: 'constitucion', label: 'Constitución', keywords: ['constitucion', 'constitución', 'constituci', 'articulo', 'artículo', 'art culo', 'derechos fundamentales'] },
      { id: 'habeas_data', label: 'Hábeas data', keywords: ['habeas data', 'datos personales', 'acceso a informacion', 'acceso a información'] },
      { id: 'amparo', label: 'Amparo', keywords: ['amparo', 'derechos constitucionales'] },
      { id: 'habeas_corpus', label: 'Hábeas corpus', keywords: ['habeas corpus', 'libertad individual'] }
    ]
  },
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
    keywords: ['laboral', 'trabajo', 'trabajador', 'trabajadora', 'empleado', 'empleada', 'empleador', 'despido', 'despidi', 'despide', 'despiden', 'despidio', 'despidió', 'despidieron', 'despedido', 'despedida', 'carta de despido', 'sin carta', 'sueldo', 'salario', 'cts', 'gratificacion', 'gratificación', 'vacaciones', 'liquidacion', 'liquidación'],
    topics: [
      { id: 'despido', label: 'Despido', keywords: ['despido', 'despidi', 'despide', 'despiden', 'despidio', 'despidió', 'despidieron', 'despedido', 'despedida', 'sin carta'] },
      { id: 'beneficios_sociales', label: 'Beneficios sociales', keywords: ['cts', 'gratificacion', 'gratificación', 'vacaciones', 'liquidacion', 'liquidación'] }
    ]
  },
  {
    id: 'derecho_civil',
    label: 'Derecho Civil',
    keywords: ['civil', 'contrato', 'compraventa', 'propiedad', 'posesion', 'posesión', 'inmueble', 'terreno', 'predio', 'vecino', 'lindero', 'linderos', 'construyo', 'construyó', 'edifico', 'edificó', 'herencia', 'sucesion', 'sucesión'],
    topics: [
      { id: 'contrato', label: 'Contrato', keywords: ['contrato', 'clausula', 'cláusula'] },
      { id: 'compraventa', label: 'Compraventa', keywords: ['compraventa', 'compra venta'] },
      { id: 'posesion', label: 'Posesión', keywords: ['posesion', 'posesión', 'posesion precaria', 'posesión precaria'] },
      { id: 'propiedad_inmueble', label: 'Propiedad inmueble', keywords: ['propiedad', 'terreno', 'predio', 'inmueble', 'lindero', 'linderos', 'construyo', 'construyó'] },
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

function countPatternScore(normalizedText, patterns, weight = 1) {
  return patterns.reduce((score, pattern) => (
    normalizedText.includes(normalizeText(pattern)) ? score + weight : score
  ), 0);
}

function confidenceFromScore(score, high = 10, medium = 4) {
  if (score >= high) return 'alta';
  if (score >= medium) return 'media';
  return 'baja';
}

function inferLegalObjective(normalizedText) {
  const objectives = [
    { id: 'ubicar_norma', label: 'Ubicar norma o artículo', patterns: ['dame', 'busca', 'articulo', 'artículo', 'art culo', 'inciso', 'ley', 'codigo', 'código', 'constitucion', 'constitución', 'constituci', 'que dice', 'qué dice'] },
    { id: 'orientacion', label: 'Orientación legal', patterns: ['que hago', 'qué hago', 'que puedo hacer', 'qué puedo hacer', 'me paso', 'me pasó', 'ayer', 'hoy', 'tengo un problema', 'mi vecino', 'mi empleador'] },
    { id: 'calcular_plazo', label: 'Identificar plazo o vencimiento', patterns: ['plazo', 'cuanto tiempo', 'cuánto tiempo', 'dias', 'días', 'vence', 'vencimiento', 'caducidad', 'prescripcion', 'prescripción'] },
    { id: 'preparar_documento', label: 'Preparar o revisar documento', patterns: ['redacta', 'prepara', 'modelo', 'plantilla', 'carta', 'demanda', 'contrato', 'escrito'] },
    { id: 'buscar_criterio', label: 'Buscar criterio jurisprudencial', patterns: ['jurisprudencia', 'casacion', 'casación', 'sentencia', 'precedente', 'criterio'] }
  ];
  const ranked = objectives
    .map(item => ({ ...item, score: countPatternScore(normalizedText, item.patterns, 3) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  return {
    id: best?.score > 0 ? best.id : 'entender_situacion',
    label: best?.score > 0 ? best.label : 'Entender situación jurídica',
    confidence: confidenceFromScore(best?.score || 0, 6, 3)
  };
}

function inferComplexity(normalizedText, query, areaConfidence, topicConfidence) {
  const terms = getQueryTerms(query);
  const hasProcedure = /\b(demanda|denuncia|apelacion|apelación|casacion|casación|medida cautelar|expediente|audiencia|sentencia|recurso)\b/.test(normalizedText);
  const hasMultipleFacts = /[,;]|\by\b|\bademas\b|\bademás\b|\bpero\b/.test(normalizedText) && String(query || '').length > 90;
  if (hasProcedure || hasMultipleFacts || terms.length >= 12) return 'alta';
  if (areaConfidence === 'alta' && topicConfidence !== 'baja') return 'media';
  return 'baja';
}

function buildMissingInfoForInterpretation(normalizedText, typeId, areaId, topicId) {
  if (typeId === 'consulta_normativa') {
    const missing = [];
    if (!/\b(articulo|art culo|artículo|ley|codigo|código|constitucion|constituci|constitución|decreto|norma)\b/.test(normalizedText)) {
      missing.push('norma o artículo específico');
    }
    return missing;
  }

  const missing = [];
  if (!/\b(hoy|ayer|fecha|dia|día|mes|año|202\d|19\d\d)\b/.test(normalizedText)) missing.push('fecha aproximada');
  if (!/\b(documento|contrato|carta|correo|mensaje|denuncia|resolucion|resolución|boleta|prueba|audio|video|captura|partida|titulo|título)\b/.test(normalizedText)) missing.push('documentos o pruebas');
  if (areaId === 'derecho_laboral' && topicId === 'despido' && !/\b(carta|contrato|boleta|planilla|liquidacion|liquidación)\b/.test(normalizedText)) {
    missing.push('carta, contrato o boletas');
  }
  if (areaId === 'derecho_civil' && ['propiedad_inmueble', 'posesion'].includes(topicId) && !/\b(partida|titulo|título|plano|lindero|contrato|constancia)\b/.test(normalizedText)) {
    missing.push('título, partida, plano o prueba de posesión');
  }
  return [...new Set(missing)].slice(0, 5);
}

function interpretLegalQuery(query, memoryMessages = []) {
  const memoryText = normalizeMemoryMessages(memoryMessages)
    .filter(message => message.role === 'user')
    .slice(-4)
    .map(message => message.content)
    .join(' ');
  const fullText = [memoryText, query].filter(Boolean).join(' ');
  const currentNormalized = normalizeText(query);
  const normalized = normalizeText(fullText);
  const terms = getQueryTerms(query);
  const typeScores = legalIntentTypes
    .map(type => ({ ...type, score: countPatternScore(normalized, type.patterns, 4) }))
    .sort((a, b) => b.score - a.score);
  const currentAreaScores = legalAreas
    .map(area => {
      const areaScore = countPatternScore(currentNormalized, area.keywords, 3);
      const topicScore = Math.max(0, ...(area.topics || []).map(topic => countPatternScore(currentNormalized, topic.keywords, 5)));
      return { ...area, score: areaScore + topicScore };
    })
    .sort((a, b) => b.score - a.score);
  const memoryAreaScores = legalAreas
    .map(area => {
      const areaScore = countPatternScore(normalized, area.keywords, 3);
      const topicScore = Math.max(0, ...(area.topics || []).map(topic => countPatternScore(normalized, topic.keywords, 5)));
      return { ...area, score: areaScore + topicScore };
    })
    .sort((a, b) => b.score - a.score);
  const matchedType = typeScores[0]?.score > 0 ? typeScores[0] : null;
  const matchedArea = currentAreaScores[0]?.score > 0 ? currentAreaScores[0] : (memoryAreaScores[0]?.score > 0 ? memoryAreaScores[0] : null);
  const topicScores = (matchedArea?.topics || [])
    .map(topic => {
      const currentScore = countPatternScore(currentNormalized, topic.keywords, 5);
      const memoryScore = countPatternScore(normalized, topic.keywords, 3);
      return { ...topic, score: currentScore > 0 ? currentScore + memoryScore : memoryScore };
    })
    .sort((a, b) => b.score - a.score);
  const matchedTopic = topicScores[0]?.score > 0 ? topicScores[0] : null;
  const fallbackTopic = terms.length ? terms.join(' ') : '';
  const areaConfidence = confidenceFromScore(matchedArea?.score || 0, 6, 3);
  const topicConfidence = confidenceFromScore(matchedTopic?.score || 0, 5, 3);
  const typeConfidence = confidenceFromScore(matchedType?.score || 0, 6, 3);
  const objective = inferLegalObjective(normalized);
  const concepts = [
    ...(matchedArea?.keywords || []),
    ...(matchedTopic?.keywords || []),
    ...terms
  ].map(item => normalizeText(item)).filter(Boolean);
  const uniqueConcepts = [...new Set(concepts)].slice(0, 12);
  const typeId = matchedType?.id || (objective.id === 'ubicar_norma' ? 'consulta_normativa' : 'consulta_general');
  const typeLabel = matchedType?.label || (objective.id === 'ubicar_norma' ? 'Consulta normativa' : 'Consulta general');
  const areaId = matchedArea?.id || 'area_no_determinada';
  const topicId = matchedTopic?.id || (fallbackTopic ? fallbackTopic.replace(/\s+/g, '_') : 'tema_no_determinado');

  return {
    type: {
      id: typeId,
      label: typeLabel,
      confidence: matchedType ? typeConfidence : (objective.id === 'ubicar_norma' ? 'media' : 'baja')
    },
    area: {
      id: areaId,
      label: matchedArea?.label || 'Área no determinada',
      confidence: matchedArea ? areaConfidence : 'baja'
    },
    topic: {
      id: topicId,
      label: matchedTopic?.label || fallbackTopic || 'Tema no determinado',
      confidence: matchedTopic ? topicConfidence : (fallbackTopic ? 'media' : 'baja')
    },
    objective,
    concepts: uniqueConcepts,
    complexity: inferComplexity(normalized, query, areaConfidence, topicConfidence),
    missingInfo: buildMissingInfoForInterpretation(normalized, typeId, areaId, topicId),
    interpretation: {
      areaScore: matchedArea?.score || 0,
      topicScore: matchedTopic?.score || 0,
      typeScore: matchedType?.score || 0,
      usedMemory: Boolean(memoryText),
      currentAreaScore: currentAreaScores[0]?.score || 0,
      currentAreaId: currentAreaScores[0]?.score > 0 ? currentAreaScores[0].id : '',
      currentTopicScore: topicScores[0]?.score || 0
    },
    originalQuery: String(query || '').trim(),
    needsMoreFacts: typeId !== 'consulta_normativa' && (!matchedArea || !matchedTopic)
  };
}

function classifyLegalIntent(query) {
  return interpretLegalQuery(query, []);
}

function mergeConversationIntent(currentIntent, memoryIntent) {
  const currentIsFollowUp = isConversationalFollowUp(currentIntent?.originalQuery || '');
  const currentHasLegalSignal = !currentIsFollowUp && ((currentIntent?.interpretation?.currentAreaScore || 0) > 0
    || currentIntent?.topic?.confidence === 'media'
    || currentIntent?.topic?.confidence === 'alta');
  const areaConflict = currentIntent?.area?.id
    && memoryIntent?.area?.id
    && currentIntent.area.id !== 'area_no_determinada'
    && memoryIntent.area.id !== 'area_no_determinada'
    && currentIntent.area.id !== memoryIntent.area.id;
  const topicConflict = currentIntent?.topic?.id
    && memoryIntent?.topic?.id
    && currentIntent.topic.id !== 'tema_no_determinado'
    && memoryIntent.topic.id !== 'tema_no_determinado'
    && currentIntent.topic.id !== memoryIntent.topic.id;
  const topicShift = Boolean(currentHasLegalSignal && (areaConflict || topicConflict));
  const useMemoryArea = !topicShift && (currentIsFollowUp || currentIntent?.area?.confidence !== 'alta') && memoryIntent?.area?.confidence === 'alta';
  const useMemoryTopic = !topicShift && (currentIsFollowUp || currentIntent?.topic?.confidence !== 'alta') && memoryIntent?.topic?.confidence === 'alta';
  const area = useMemoryArea ? memoryIntent.area : currentIntent.area;
  const topic = useMemoryTopic ? memoryIntent.topic : currentIntent.topic;

  return {
    type: topicShift || currentIntent?.type?.confidence === 'alta' ? currentIntent.type : (memoryIntent?.type || currentIntent.type),
    area,
    topic,
    objective: topicShift || currentIntent?.objective?.confidence === 'alta' ? currentIntent.objective : (memoryIntent?.objective || currentIntent.objective),
    concepts: topicShift
      ? [...new Set([...(currentIntent?.concepts || [])])].slice(0, 12)
      : [...new Set([...(currentIntent?.concepts || []), ...(memoryIntent?.concepts || [])])].slice(0, 12),
    complexity: topicShift ? currentIntent?.complexity : (currentIntent?.complexity === 'alta' || memoryIntent?.complexity === 'alta' ? 'alta' : (currentIntent?.complexity || memoryIntent?.complexity || 'baja')),
    missingInfo: topicShift
      ? [...new Set([...(currentIntent?.missingInfo || [])])].slice(0, 5)
      : [...new Set([...(currentIntent?.missingInfo || []), ...(memoryIntent?.missingInfo || [])])].slice(0, 5),
    interpretation: {
      ...(memoryIntent?.interpretation || {}),
      ...(currentIntent?.interpretation || {}),
      mergedWithMemory: useMemoryArea || useMemoryTopic,
      topicShift
    },
    originalQuery: currentIntent?.originalQuery || '',
    needsMoreFacts: currentIntent?.type?.id !== 'consulta_normativa' && (area?.confidence !== 'alta' || topic?.confidence !== 'alta')
  };
}

function buildInterpretationSearchQuery(userQuery, intent, memorySearchQuery) {
  const enriched = [
    userQuery,
    intent?.area?.label,
    intent?.topic?.label,
    intent?.objective?.label,
    ...(intent?.concepts || []).slice(0, 8),
    memorySearchQuery && memorySearchQuery !== userQuery ? memorySearchQuery : ''
  ].filter(Boolean).join(' ');
  return truncateForRag(enriched, 1200);
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
  const followUpPattern = /^(asi|así|como asi|cómo así|explica|explicame|explícame|explicamelo|explícamelo|hazlo|dilo|ponlo|resumelo|resúmelo|resume|continua|continúa|sigue|no entendi|no entendí|no entiendo|mas claro|más claro|en simple|en sencillo|ok|vale|gracias)(\s.*)?$/;
  return followUpPattern.test(normalized) && meaningfulTerms.length < 2 && !isLegalQuery(text);
}

function extractUserQuery(prompt) {
  const text = String(prompt || '').trim();
  const marker = 'Consulta del usuario:';
  const markerIndex = text.lastIndexOf(marker);
  if (markerIndex === -1) return text;
  return text.slice(markerIndex + marker.length).trim();
}

function isTemporaryChatMessage(message) {
  const role = String(message?.role || '').trim();
  const content = String(message?.content || '').replace(/\s+/g, ' ').trim();
  if (!content) return true;
  if (role === 'system') return true;
  return /^procesando consulta jur[ií]dica\.?$/i.test(content);
}

function normalizeMemoryMessages(messages = []) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter(message => !isTemporaryChatMessage(message))
    .filter(message => ['user', 'assistant'].includes(String(message.role || '').trim()))
    .slice(-12)
    .map(message => ({
      role: String(message.role || '').trim(),
      content: truncateForRag(message.content, 700),
      createdAt: message.createdAt || message.created_at || null
    }));
}

async function loadConversationMemory(email, sessionId, fallbackMessages = []) {
  const fallback = normalizeMemoryMessages(fallbackMessages);
  if (!email || !sessionId) return fallback;

  try {
    const persistedMessages = await getRecentChatMessages(sessionId, email, 12);
    const normalized = normalizeMemoryMessages(persistedMessages);
    return normalized.length ? normalized : fallback;
  } catch (error) {
    console.warn('LEXIA usará memoria local enviada por el frontend:', error.message);
    return fallback;
  }
}

function buildConversationMemoryContext(messages = [], intent = null) {
  const normalized = normalizeMemoryMessages(messages);
  if (!normalized.length) return '';

  const lines = ['HILO DE CONVERSACIÓN RECIENTE:'];
  if (intent) {
    lines.push(`Tema jurídico detectado: ${intent.area.label} / ${intent.topic.label}.`);
  }
  lines.push('Lee esto como una conversación viva. El último mensaje puede corregir o precisar lo anterior. No repitas respuestas anteriores.');

  normalized.slice(-6).forEach((message, index) => {
    const speaker = message.role === 'assistant' ? 'LEXIA' : 'Usuario';
    lines.push(`${index + 1}. ${speaker}: ${truncateForRag(message.content, 320)}`);
  });

  return lines.join('\n');
}

function buildMemorySearchQuery(userQuery, messages = []) {
  const normalized = normalizeMemoryMessages(messages);
  if (!normalized.length) return userQuery;

  const recentUserFacts = normalized
    .filter(message => message.role === 'user')
    .slice(-4)
    .map(message => message.content)
    .join(' ');
  const recentAssistantContext = normalized
    .filter(message => message.role === 'assistant')
    .slice(-2)
    .map(message => message.content)
    .join(' ');

  return truncateForRag(
    [
      recentUserFacts ? `Hechos y tema previos: ${recentUserFacts}` : '',
      recentAssistantContext ? `Orientación previa: ${recentAssistantContext}` : '',
      `Pregunta actual: ${userQuery}`
    ].filter(Boolean).join('\n'),
    1800
  );
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
    'Claro, pero necesito ubicar el caso para no responderte en abstracto.',
    '',
    '¿De qué problema jurídico estamos hablando: despido, deuda, alimentos, contrato, denuncia u otro tema?'
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

function scoreLegalKnowledgeRecord(record, query, terms) {
  const normalizedQuery = normalizeText(query);
  const normalizedTitle = normalizeText(record.titulo);
  const normalizedSummary = normalizeText(record.resumen);
  const normalizedMatter = normalizeText(record.materia);
  const normalizedIntelligence = normalizeText(JSON.stringify(record.inteligencia || {}));
  const normalizedBody = normalizeText(`${record.titulo} ${record.materia} ${record.resumen} ${record.contenido} ${record.fuente} ${normalizedIntelligence}`);
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
    if (normalizedIntelligence.includes(term)) score += 5;
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
  const topicTerms = getQueryTerms(`${topic} ${topicId}`).filter(term => term.length >= 4);
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

    if (hasSpecificTopic && topicTerms.some(term => containsNormalizedTerm(sourceText, term))) return true;
    if (!hasSpecificTopic && area && sourceText.includes(area)) return true;
    return false;
  });
}

function containsNormalizedTerm(text, term) {
  const escaped = String(term || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(String(text || ''));
}

function buildSourceSummary(results, intent, limit = 3) {
  const rankedSources = filterSourcesForIntent(results, intent)
    .filter(item => Number(item.relevance || 0) >= 10)
    .sort((a, b) => {
      const aHasUrl = itemHasExternalUrl(a) ? 1 : 0;
      const bHasUrl = itemHasExternalUrl(b) ? 1 : 0;
      const aGeneric = isGenericSourceResult(a) ? 1 : 0;
      const bGeneric = isGenericSourceResult(b) ? 1 : 0;
      return (bHasUrl - aHasUrl) || (aGeneric - bGeneric) || Number(b.relevance || 0) - Number(a.relevance || 0);
    });
  const specificSources = rankedSources.filter(item => !isGenericSourceResult(item));
  const relevantSources = specificSources.length ? specificSources : rankedSources;

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

function itemHasExternalUrl(item) {
  return /^https?:\/\//i.test(String(item?.url || ''));
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
  return text.includes('constitucion politica')
    || text.includes('resumen los derechos laborales')
    || text.includes('derechos laborales basicos')
    || text.includes('legal faqs')
    || text.includes('referencias fuente labor rights');
}

function buildTopicGuidance(intent) {
  const topicId = intent?.topic?.id || '';
  const areaId = intent?.area?.id || '';
  const typeId = intent?.type?.id || '';

  if (typeId === 'consulta_normativa') {
    return [
      'Esto es una consulta normativa. Lo central es ubicar la norma, artículo, inciso o disposición aplicable y verificar si el texto está vigente.',
      '',
      'Si me das el nombre exacto de la norma o el artículo, puedo ayudarte a ordenar la lectura, explicar su alcance y vincularlo con el caso concreto.'
    ];
  }

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

  if (topicId === 'beneficios_sociales') {
    return [
      'Si tu empleador no te paga beneficios sociales, el caso se ordena por conceptos: CTS, gratificaciones, vacaciones, remuneraciones pendientes y liquidación.',
      '',
      'No conviene reclamar todo junto sin cálculo; primero hay que separar periodos, montos y pagos que sí recibiste.'
    ];
  }

  if (topicId === 'alimentos') {
    return [
      'En alimentos, primero hay que distinguir si hablas de una demanda de pensión, una denuncia por incumplimiento, una liquidación de deuda o una ejecución de acta/sentencia.',
      '',
      'Los datos clave son: quién pide alimentos, para quién, si ya existe sentencia o conciliación, cuánto se debe y desde cuándo no se paga.'
    ];
  }

  if (topicId === 'propiedad_inmueble' || topicId === 'posesion') {
    return [
      'En un conflicto sobre terreno, propiedad, posesión o linderos, lo primero es diferenciar quién tiene título, quién posee realmente y qué acto generó el conflicto.',
      '',
      'Conviene revisar partida registral, título, planos, contrato, constancias de posesión, fotos, comunicaciones y cualquier prueba de la construcción o invasión.'
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
    `Con lo que me dices, esto se debe mirar desde ${intent?.area?.label || 'el área legal aplicable'}, pero falta aterrizar el hecho central.`,
    '',
    'Para darte una respuesta útil, necesito ubicar qué pasó, cuándo pasó y qué documento o prueba existe.'
  ];
}

function extractPotentialFacts(query, memoryMessages = []) {
  const userMessages = normalizeMemoryMessages(memoryMessages)
    .filter(message => message.role === 'user')
    .map(message => message.content)
    .filter(content => !isGreetingOnly(content));
  return [...userMessages.slice(-3), query]
    .map(item => String(item || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(-4);
}

function buildLegalReasoningProfile(query, intent, memoryMessages = [], knowledgeResults = []) {
  const facts = extractPotentialFacts(query, memoryMessages);
  const normalized = normalizeText(facts.join(' '));
  const missing = [];
  const risks = [];
  const nextSteps = [];
  const knowledgeIntelligence = (Array.isArray(knowledgeResults) ? knowledgeResults : [])
    .map(item => item?.inteligencia)
    .filter(item => item && typeof item === 'object');

  if (!/\b(hoy|ayer|fecha|dia|día|mes|año|202\d|19\d\d)\b/.test(normalized)) {
    missing.push('fecha o momento aproximado de los hechos');
  }
  if (!/\b(documento|contrato|carta|correo|mensaje|denuncia|resolucion|resolución|boleta|prueba|audio|video|captura)\b/.test(normalized)) {
    missing.push('documentos o pruebas disponibles');
  }
  if (
    intent?.objective?.confidence === 'baja'
    && !/\b(quiero|busco|necesito|denunciar|demandar|responder|negociar|calcular|redactar|orientar)\b/.test(normalized)
  ) {
    missing.push('objetivo concreto del usuario');
  }

  if (intent?.area?.id === 'derecho_penal') {
    risks.push('posibles plazos, denuncia, conservación de pruebas y seguridad de la víctima o investigado');
    nextSteps.push('ordenar hechos, identificar prueba, verificar si existe denuncia y definir si corresponde acudir a PNP o Ministerio Público');
  } else if (intent?.area?.id === 'derecho_laboral') {
    risks.push('caducidad o pérdida de oportunidad para reclamar, prueba de vínculo laboral y comunicaciones del empleador');
    nextSteps.push('reunir contrato, boletas, comunicaciones, asistencia y fecha exacta de cese o incumplimiento');
  } else if (intent?.area?.id === 'derecho_familia') {
    risks.push('interés superior del menor, capacidad económica, necesidades acreditadas y medidas urgentes');
    nextSteps.push('ordenar partidas, gastos, ingresos, acuerdos previos y datos del menor o familiares involucrados');
  } else if (intent?.area?.id === 'derecho_civil') {
    risks.push('validez documental, titularidad, plazos, incumplimiento y prueba escrita');
    nextSteps.push('revisar contratos, partidas, comunicaciones, pagos y cronología de hechos');
  } else {
    risks.push('datos incompletos pueden cambiar el análisis jurídico y la autoridad competente');
    nextSteps.push('precisar materia, hechos principales, fecha, documentos y objetivo');
  }

  for (const intelligence of knowledgeIntelligence.slice(0, 3)) {
    if (Array.isArray(intelligence.riesgos)) {
      risks.push(...intelligence.riesgos.slice(0, 2));
    }
    if (Array.isArray(intelligence.pasos)) {
      nextSteps.push(...intelligence.pasos.slice(0, 2));
    }
    if (Array.isArray(intelligence.documentos) && intelligence.documentos.length) {
      missing.push(`documentos relevantes: ${intelligence.documentos.slice(0, 4).join(', ')}`);
    }
  }

  return {
    facts,
    legalIssue: intent?.topic?.confidence === 'alta'
      ? `Determinar consecuencias, opciones y próximos pasos sobre ${intent.topic.label}.`
      : `Identificar el problema jurídico principal dentro de ${intent?.area?.label || 'la materia aplicable'}.`,
    applicableArea: intent?.area?.label || 'Área no determinada',
    topic: intent?.topic?.label || 'Tema no determinado',
    risks: [...new Set(risks)].slice(0, 5),
    nextSteps: [...new Set(nextSteps)].slice(0, 5),
    missingInfo: [...new Set(missing)].slice(0, 5)
  };
}

function buildLegalReasoningContext(reasoningProfile) {
  if (!reasoningProfile) return '';
  return [
    'LEGAL REASONING ENGINE:',
    `Hechos detectados: ${reasoningProfile.facts.length ? reasoningProfile.facts.join(' | ') : 'no hay hechos suficientes'}`,
    `Problema jurídico: ${reasoningProfile.legalIssue}`,
    `Área: ${reasoningProfile.applicableArea}`,
    `Tema: ${reasoningProfile.topic}`,
    `Riesgos a evaluar: ${reasoningProfile.risks.join(' | ')}`,
    `Próximos pasos sugeridos: ${reasoningProfile.nextSteps.join(' | ')}`,
    `Datos faltantes: ${reasoningProfile.missingInfo.length ? reasoningProfile.missingInfo.join(' | ') : 'sin datos faltantes críticos detectados'}`,
    'Usa este análisis como estructura interna. No muestres esta sección literalmente.'
  ].join('\n');
}

const legalGraphRelationWeights = {
  PERTENECE_A: 0.72,
  REGULA: 0.86,
  INTERPRETA: 0.82,
  REQUIERE_PRUEBA: 0.7,
  GENERA_RIESGO: 0.68,
  SUGIERE_PASO: 0.62,
  SE_RELACIONA_CON: 0.55,
  FUENTE_SUSTENTA: 0.78
};

const legalGraphSourceTrust = {
  normativa: 0.82,
  jurisprudencia: 0.78,
  casaciones: 0.8,
  sentencias_tc: 0.84
};

function makeGraphNode(type, label, metadata = {}) {
  const cleanLabel = String(label || '').replace(/\s+/g, ' ').trim();
  if (!cleanLabel) return null;
  return {
    id: `${type}:${normalizeText(cleanLabel).replace(/\s+/g, '_').slice(0, 90)}`,
    type,
    label: cleanLabel,
    metadata
  };
}

function makeGraphEdge(from, relation, to, options = {}) {
  if (!from?.id || !to?.id) return null;
  const baseWeight = legalGraphRelationWeights[relation] || legalGraphRelationWeights.SE_RELACIONA_CON;
  const sourceTrust = Number(options.sourceTrust ?? 0.65);
  const evidenceStrength = Math.min(Number(options.evidenceCount || 1) / 4, 1);
  const weight = Number(Math.min(0.98, (baseWeight * 0.58) + (sourceTrust * 0.28) + (evidenceStrength * 0.14)).toFixed(3));
  return {
    from: from.id,
    relation,
    to: to.id,
    weight,
    evidence: options.evidence || [],
    sourceTrust
  };
}

function addGraphNode(graph, node) {
  if (!node) return null;
  if (!graph.nodes.has(node.id)) graph.nodes.set(node.id, node);
  return graph.nodes.get(node.id);
}

function addGraphEdge(graph, edge) {
  if (!edge) return;
  const key = `${edge.from}|${edge.relation}|${edge.to}`;
  const current = graph.edges.get(key);
  if (!current || edge.weight > current.weight) {
    graph.edges.set(key, edge);
  }
}

function buildKnowledgeGraphFromResults(intent, results = []) {
  const graph = { nodes: new Map(), edges: new Map() };
  const areaNode = addGraphNode(graph, makeGraphNode('materia', intent?.area?.label, { confidence: intent?.area?.confidence }));
  const topicNode = addGraphNode(graph, makeGraphNode('institucion', intent?.topic?.label, { confidence: intent?.topic?.confidence }));
  const objectiveNode = addGraphNode(graph, makeGraphNode('objetivo', intent?.objective?.label, { confidence: intent?.objective?.confidence }));

  if (topicNode && areaNode) {
    addGraphEdge(graph, makeGraphEdge(topicNode, 'PERTENECE_A', areaNode, {
      sourceTrust: 0.72,
      evidence: ['interpretacion_consulta']
    }));
  }
  if (objectiveNode && topicNode) {
    addGraphEdge(graph, makeGraphEdge(objectiveNode, 'SE_RELACIONA_CON', topicNode, {
      sourceTrust: 0.68,
      evidence: ['objetivo_usuario']
    }));
  }

  for (const item of Array.isArray(results) ? results.slice(0, 8) : []) {
    const sourceTrust = legalGraphSourceTrust[item.modulo] || 0.66;
    const sourceNode = addGraphNode(graph, makeGraphNode('fuente', item.titulo, {
      modulo: item.modulo,
      fuente: item.fuente,
      relevance: item.relevance,
      url: item.url
    }));
    const matterNode = addGraphNode(graph, makeGraphNode('materia', item.materia || intent?.area?.label, { source: item.id }));
    if (sourceNode && matterNode) {
      addGraphEdge(graph, makeGraphEdge(sourceNode, 'PERTENECE_A', matterNode, {
        sourceTrust,
        evidence: [item.id],
        evidenceCount: 1
      }));
    }
    if (sourceNode && topicNode) {
      const relation = item.modulo === 'jurisprudencia' || item.modulo === 'casaciones' || item.modulo === 'sentencias_tc'
        ? 'INTERPRETA'
        : 'REGULA';
      addGraphEdge(graph, makeGraphEdge(sourceNode, relation, topicNode, {
        sourceTrust,
        evidence: [item.id],
        evidenceCount: Math.max(1, Math.round(Number(item.relevance || 0) / 35))
      }));
    }

    const intelligence = item.inteligencia && typeof item.inteligencia === 'object' ? item.inteligencia : {};
    for (const doc of Array.isArray(intelligence.documentos) ? intelligence.documentos.slice(0, 4) : []) {
      const docNode = addGraphNode(graph, makeGraphNode('prueba', doc, { source: item.id }));
      addGraphEdge(graph, makeGraphEdge(topicNode, 'REQUIERE_PRUEBA', docNode, {
        sourceTrust,
        evidence: [item.id]
      }));
    }
    for (const risk of Array.isArray(intelligence.riesgos) ? intelligence.riesgos.slice(0, 4) : []) {
      const riskNode = addGraphNode(graph, makeGraphNode('riesgo', risk, { source: item.id }));
      addGraphEdge(graph, makeGraphEdge(topicNode, 'GENERA_RIESGO', riskNode, {
        sourceTrust,
        evidence: [item.id]
      }));
    }
    for (const step of Array.isArray(intelligence.pasos) ? intelligence.pasos.slice(0, 3) : []) {
      const stepNode = addGraphNode(graph, makeGraphNode('paso', step, { source: item.id }));
      addGraphEdge(graph, makeGraphEdge(topicNode, 'SUGIERE_PASO', stepNode, {
        sourceTrust,
        evidence: [item.id]
      }));
    }
  }

  return {
    nodes: [...graph.nodes.values()],
    edges: [...graph.edges.values()]
  };
}

function scoreLegalGraphHypothesis(hypothesis, graph, intent, results = []) {
  const normalizedTopic = normalizeText(hypothesis.topic || '');
  const relevantEdges = graph.edges.filter(edge => {
    const from = graph.nodes.find(node => node.id === edge.from);
    const to = graph.nodes.find(node => node.id === edge.to);
    return normalizeText(`${from?.label || ''} ${to?.label || ''}`).includes(normalizedTopic);
  });
  const evidenceScore = Math.min(relevantEdges.reduce((sum, edge) => sum + edge.weight, 0) / 4, 0.38);
  const retrievalScore = Math.min((Array.isArray(results) ? results : []).reduce((sum, item) => sum + Number(item.relevance || 0), 0) / 500, 0.24);
  const intentScore = (intent?.area?.confidence === 'alta' ? 0.16 : intent?.area?.confidence === 'media' ? 0.1 : 0.04)
    + (intent?.topic?.confidence === 'alta' ? 0.14 : intent?.topic?.confidence === 'media' ? 0.08 : 0.03);
  const complexityPenalty = intent?.complexity === 'alta' ? 0.04 : 0;
  const hasMissingInfo = Array.isArray(intent?.missingInfo) && intent.missingInfo.length > 0;
  const cap = intent?.type?.id === 'consulta_normativa' && !hasMissingInfo ? 0.98 : 0.94;
  return Number(Math.max(0.05, Math.min(cap, hypothesis.base + evidenceScore + retrievalScore + intentScore - complexityPenalty)).toFixed(3));
}

function buildLegalGraphHypotheses(intent, graph, results = []) {
  const hypotheses = [];
  const area = intent?.area?.label || 'Materia no determinada';
  const topic = intent?.topic?.label || 'Tema no determinado';

  hypotheses.push({
    id: 'h_principal',
    label: `${topic} dentro de ${area}`,
    topic,
    area,
    base: 0.18,
    explanation: 'Hipótesis principal derivada de la interpretación de la consulta.'
  });

  const modules = [...new Set((Array.isArray(results) ? results : []).map(item => item.modulo).filter(Boolean))];
  for (const moduleName of modules.slice(0, 3)) {
    hypotheses.push({
      id: `h_${moduleName}`,
      label: `${topic} sustentado por ${moduleName}`,
      topic,
      area,
      base: moduleName === 'normativa' ? 0.16 : 0.14,
      explanation: `Hipótesis reforzada por resultados de ${moduleName}.`
    });
  }

  return hypotheses
    .map(item => ({
      ...item,
      probability: scoreLegalGraphHypothesis(item, graph, intent, results),
      evidence: graph.edges
        .filter(edge => edge.evidence?.length)
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 5)
    }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 5);
}

function buildLegalGraphReasoning(intent, results = []) {
  const graph = buildKnowledgeGraphFromResults(intent, results);
  const hypotheses = buildLegalGraphHypotheses(intent, graph, results);
  return {
    graph,
    hypotheses,
    summary: {
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      strongestHypothesis: hypotheses[0]?.label || null,
      probability: hypotheses[0]?.probability || 0
    }
  };
}

function buildLegalGraphContext(graphReasoning) {
  if (!graphReasoning?.hypotheses?.length) return '';
  const lines = [
    'LEGAL KNOWLEDGE GRAPH:',
    `Nodos activados: ${graphReasoning.summary.nodes}. Relaciones evaluadas: ${graphReasoning.summary.edges}.`,
    'Hipótesis jurídicas ponderadas:'
  ];
  graphReasoning.hypotheses.slice(0, 3).forEach((hypothesis, index) => {
    lines.push(`${index + 1}. ${hypothesis.label} | probabilidad=${hypothesis.probability} | ${hypothesis.explanation}`);
  });
  lines.push('Usa estas hipótesis como razonamiento interno. No afirmes una hipótesis como definitiva si faltan hechos o documentos.');
  return lines.join('\n');
}

function buildProgressiveGuidance(intent, reasoningProfile, graphReasoning) {
  const topicId = intent?.topic?.id || '';
  const factsText = normalizeText((reasoningProfile?.facts || []).join(' '));
  const lines = [];

  if (topicId === 'despido') {
    lines.push('Con lo que ya contaste, el punto principal no es solo que hubo un despido, sino cómo se comunicó y si existía una causa válida.');
    if (factsText.includes('llamaron') || factsText.includes('oficina') || factsText.includes('no podian seguir')) {
      lines.push('Si te llamaron a la oficina y te dijeron que no podían seguir contratándote, eso puede ser indicio de cese verbal o comunicación informal. Conviene dejar constancia escrita cuanto antes.');
    }
    lines.push('La ruta práctica es ordenar fecha de cese, forma de comunicación, tipo de contrato y pruebas del vínculo laboral.');
    lines.push('No borres mensajes ni firmes documentos sin leerlos, porque podrían cambiar la lectura del caso.');
    return lines;
  }

  if (topicId === 'propiedad_inmueble' || topicId === 'posesion') {
    lines.push('Con los hechos descritos, la hipótesis principal es un conflicto civil sobre propiedad, posesión o linderos.');
    lines.push('La diferencia clave será si tienes título inscrito, posesión acreditada, plano o algún documento que ubique el límite del terreno.');
    return lines;
  }

  if (intent?.type?.id === 'consulta_normativa') {
    lines.push('La consulta se debe tratar como búsqueda normativa: ubicar el texto, verificar vigencia y explicar alcance.');
    return lines;
  }

  lines.push(...buildTopicGuidance(intent));
  return lines;
}

function buildTargetedMissingQuestions(intent, reasoningProfile) {
  const missing = Array.isArray(reasoningProfile?.missingInfo) && reasoningProfile.missingInfo.length
    ? reasoningProfile.missingInfo
    : Array.isArray(intent?.missingInfo) ? intent.missingInfo : [];
  const unique = [...new Set(missing)]
    .filter(item => !String(item).startsWith('documentos relevantes:'))
    .slice(0, 3);
  if (!unique.length) return [];
  return [
    'Para afinar la respuesta, falta confirmar:',
    ...unique.map((item, index) => `${index + 1}. ${item.charAt(0).toUpperCase()}${item.slice(1)}.`)
  ];
}

function buildSingleLegalQuestion(intent, reasoningProfile) {
  const topicId = intent?.topic?.id || '';
  const missing = Array.isArray(reasoningProfile?.missingInfo) ? reasoningProfile.missingInfo : [];

  if (topicId === 'despido') return '¿Te entregaron una carta de despido o solo te lo dijeron verbalmente?';
  if (topicId === 'beneficios_sociales') return '¿Sigues trabajando ahí o ya terminó la relación laboral?';
  if (topicId === 'alimentos') return '¿Ya existe una sentencia o acta de conciliación sobre alimentos?';
  if (topicId === 'propiedad_inmueble' || topicId === 'posesion') return '¿Tienes título, contrato o partida registral del inmueble?';
  if (intent?.area?.id === 'derecho_penal') return '¿Ya hiciste denuncia o todavía estás evaluando si corresponde denunciar?';
  if (missing.some(item => normalizeText(item).includes('fecha'))) return '¿Cuándo ocurrió el hecho principal?';
  if (missing.some(item => normalizeText(item).includes('document'))) return '¿Qué documento o prueba tienes ahora mismo?';
  return '¿Qué resultado buscas: reclamar, denunciar, negociar, responder un documento o solo entender tus derechos?';
}

function isShortUserInput(query) {
  const terms = getQueryTerms(query);
  return terms.length <= 3 || String(query || '').trim().length <= 45;
}

function collectIntelligenceItems(results, key, limit = 5) {
  const items = [];
  for (const result of Array.isArray(results) ? results : []) {
    const intelligence = result?.inteligencia || result?.intelligence || {};
    const values = intelligence?.[key];
    if (!Array.isArray(values)) continue;
    for (const value of values) {
      const clean = String(value || '').replace(/\s+/g, ' ').trim();
      if (clean && !items.some(item => normalizeText(item) === normalizeText(clean))) {
        items.push(clean);
      }
      if (items.length >= limit) return items;
    }
  }
  return items;
}

function buildLocalLegalAnalysisSections(intent, results, reasoningProfile) {
  const topResult = Array.isArray(results)
    ? results.find(item => {
        const intelligence = item?.inteligencia || item?.intelligence || {};
        return Object.keys(intelligence).length;
      })
    : null;
  const rules = collectIntelligenceItems(results, 'reglas_practicas', 3);
  const legalProblems = collectIntelligenceItems(results, 'problemas_juridicos', 3);
  const risks = collectIntelligenceItems(results, 'riesgos', 4);
  const documents = collectIntelligenceItems(results, 'documentos', 5);
  const steps = collectIntelligenceItems(results, 'pasos', 5);
  const usefulQuestions = collectIntelligenceItems(results, 'preguntas', 3);
  const lines = [];

  if (!topResult && !rules.length && !steps.length) return lines;

  lines.push('Análisis inicial:');
  if (legalProblems.length) {
    lines.push(`El problema jurídico principal es ${legalProblems[0]}.`);
  } else if (reasoningProfile?.legalIssue) {
    lines.push(reasoningProfile.legalIssue);
  }
  if (rules.length) {
    lines.push(`Criterio práctico: ${rules[0]}.`);
  }
  if (risks.length) {
    lines.push(`Riesgo a cuidar: ${risks[0]}.`);
  }

  if (steps.length) {
    lines.push('', 'Qué hacer ahora:');
    steps.slice(0, 4).forEach((step, index) => {
      lines.push(`${index + 1}. ${step.charAt(0).toUpperCase()}${step.slice(1)}.`);
    });
  }

  if (documents.length) {
    lines.push('', 'Documentos o pruebas útiles:');
    lines.push(documents.slice(0, 5).join(', ') + '.');
  }

  if (usefulQuestions.length) {
    lines.push('', 'Para darte una ruta más exacta, responde:');
    usefulQuestions.slice(0, 3).forEach((question, index) => {
      lines.push(`${index + 1}. ${question}`);
    });
  }

  return lines;
}

function buildConversationalLegalAnswer(query, intent, results, reasoningProfile = null, graphReasoning = null) {
  const lines = [];
  const shortInput = isShortUserInput(query);
  const normalizedQuery = normalizeText(query);
  const forcedBenefitsGuidance = normalizedQuery.includes('beneficios sociales')
    ? [
        'Si tu empleador no te paga beneficios sociales, el punto no es solo reclamar: primero hay que identificar qué concepto falta y desde cuándo.',
        'En laboral, CTS, gratificaciones, vacaciones, remuneraciones pendientes y liquidación se revisan por separado para no mezclar montos.'
      ]
    : null;
  const guidance = forcedBenefitsGuidance || buildProgressiveGuidance(intent, reasoningProfile, graphReasoning);
  const localAnalysis = buildLocalLegalAnalysisSections(intent, results, reasoningProfile);
  const rules = collectIntelligenceItems(results, 'reglas_practicas', 2);
  const risks = collectIntelligenceItems(results, 'riesgos', 2);
  const steps = collectIntelligenceItems(results, 'pasos', 3);
  const documents = collectIntelligenceItems(results, 'documentos', 4);

  if (intent?.type?.id === 'consulta_normativa') {
    lines.push(guidance[0] || 'Primero hay que ubicar la norma exacta y confirmar si está vigente.');
    if (results.length) {
      lines.push('Con las referencias disponibles puedo ayudarte a entender el alcance, pero no conviene citar una norma sin verificar el texto oficial.');
    } else {
      lines.push('No tengo una coincidencia exacta en la base local; lo correcto es verificarla en una fuente oficial antes de usarla.');
    }
  } else {
    if (guidance.length) {
      lines.push(guidance.slice(0, shortInput ? 1 : 2).join(' '));
    } else {
      lines.push(`Veo que esto cae en ${intent?.area?.label || 'un tema jurídico'}, pero necesito un dato más para aterrizarlo bien.`);
    }

    if (!shortInput && rules.length) {
      lines.push('');
      lines.push(`La clave jurídica aquí es esta: ${rules[0]}.`);
    }

    if (!shortInput && risks.length) {
      lines.push(`El riesgo práctico es ${risks[0]}, así que conviene actuar con documentos y fechas claras.`);
    }

    if (!shortInput && steps.length) {
      lines.push('');
      lines.push(`Yo empezaría por ${steps.slice(0, 3).join(', ')}.`);
    }

    if (!shortInput && documents.length) {
      lines.push('');
      lines.push(`Ten cerca ${documents.slice(0, 4).join(', ')}; con eso se puede evaluar mejor la ruta legal.`);
    }

    lines.push('');
    lines.push(normalizedQuery.includes('beneficios sociales')
      ? '¿Sigues trabajando ahí o ya terminó la relación laboral?'
      : buildSingleLegalQuestion(intent, reasoningProfile));
  }

  const sourceSummary = buildSourceSummary(results, intent);
  if (!shortInput && results.length && !sourceSummary.includes('No encontré una fuente específica')) {
    lines.push('');
    lines.push(sourceSummary);
  }

  return lines.join('\n');
}

function buildMemoryAwareLocalAnswer(query, intent, results, reasoningProfile, graphReasoning, memoryMessages = []) {
  const normalizedMemory = normalizeMemoryMessages(memoryMessages);
  const recentUserMessages = normalizedMemory.filter(message => message.role === 'user').slice(-3);
  const recentAssistant = normalizedMemory.filter(message => message.role === 'assistant').slice(-1)[0];
  const followUp = isConversationalFollowUp(query) || (normalizedMemory.length > 0 && getQueryTerms(query).length <= 3);

  if (!followUp) {
    return buildConversationalLegalAnswer(query, intent, results, reasoningProfile, graphReasoning);
  }

  const lines = [];
  const previousFacts = recentUserMessages
    .map(message => message.content)
    .filter(content => !isConversationalFollowUp(content));
  const lastUserFact = previousFacts.length
    ? previousFacts[previousFacts.length - 1]
    : (reasoningProfile?.facts || []).find(fact => !isConversationalFollowUp(fact)) || query;

  lines.push(`En tu caso, lo importante sigue siendo esto: ${truncateForRag(lastUserFact, 220)}`);

  const intelligence = (results || [])
    .map(item => item.intelligence || item.inteligencia)
    .find(item => item && typeof item === 'object');
  const steps = Array.isArray(intelligence?.pasos) ? intelligence.pasos : reasoningProfile?.nextSteps || [];
  const documents = Array.isArray(intelligence?.documentos) ? intelligence.documentos : [];
  const risks = Array.isArray(intelligence?.riesgos) ? intelligence.riesgos : reasoningProfile?.risks || [];

  const nextSteps = steps.length ? steps : [
    'ordenar los hechos en una línea de tiempo',
    'separar documentos, pagos y comunicaciones',
    'definir si buscas reclamar, denunciar, negociar o calcular un monto'
  ];
  lines.push('');
  lines.push(`Lo aterrizo así: primero ${nextSteps.slice(0, 3).join(', ')}.`);

  if (documents.length) {
    lines.push('');
    lines.push(`Para sostenerlo legalmente, sirven especialmente: ${documents.slice(0, 5).join(', ')}.`);
  }

  if (risks.length) {
    lines.push('');
    lines.push(`El cuidado principal es ${risks[0]}.`);
  }

  lines.push('');
  lines.push(buildSingleLegalQuestion(intent, reasoningProfile));

  const sourceSummary = buildSourceSummary(results, intent, 2);
  if (results.length && !sourceSummary.includes('No encontré una fuente específica')) {
    lines.push('');
    lines.push(sourceSummary);
  }
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
  const normalizedStructured = structuredResults.map(item => ({
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
    .map(item => ({
      ...item,
      rankingScore: Number(item.relevance || 0)
        + (String(item.id || '').startsWith('kb:') ? 30 : 0)
        + (itemHasExternalUrl(item) ? 20 : 0)
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

function createProviderTimeout() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(providerTimeoutMs, 5000));
  return { controller, timeout };
}

async function callOpenAiChat(messages, options = {}) {
  if (!openAiKey) {
    throw {
      provider: 'openai',
      code: 'not_configured',
      error: 'OpenAI no está configurado.'
    };
  }

  const model = options.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const temperature = Number.isFinite(options.temperature) ? options.temperature : Number(process.env.OPENAI_TEMPERATURE || 0.35);
  const { controller, timeout } = createProviderTimeout();

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openAiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
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
      throw {
        provider: 'openai',
        code: parsedError?.error?.code || null,
        error: mapped.error,
        status: mapped.status
      };
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.trim();
    if (!answer) {
      throw {
        provider: 'openai',
        code: 'empty_response',
        error: 'OpenAI no devolvió una respuesta válida.'
      };
    }

    return {
      answer,
      model,
      provider: 'openai',
      source: 'LEXIA (lpderecho.pe + OpenAI)'
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw {
        provider: 'openai',
        code: 'timeout',
        error: 'OpenAI no respondió dentro del tiempo límite.'
      };
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function callGrokChat(messages, options = {}) {
  if (!xAiKey) {
    throw {
      provider: 'grok',
      code: 'not_configured',
      error: 'Grok/xAI no está configurado.'
    };
  }

  const model = options.model || grokModel;
  const temperature = Number.isFinite(options.temperature) ? options.temperature : Number(process.env.GROK_TEMPERATURE || process.env.XAI_TEMPERATURE || process.env.OPENAI_TEMPERATURE || 0.35);
  const { controller, timeout } = createProviderTimeout();

  try {
    const response = await fetch(`${xAiBaseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${xAiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: Number(process.env.GROK_MAX_TOKENS || process.env.XAI_MAX_TOKENS || 2000),
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
      console.error('❌ Error Grok/xAI:', errorBody);
      throw {
        provider: 'grok',
        code: parsedError?.error?.code || null,
        error: parsedError?.error?.message || parsedError?.error || `Grok/xAI respondió con estado ${response.status}.`,
        status: response.status
      };
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.trim();
    if (!answer) {
      throw {
        provider: 'grok',
        code: 'empty_response',
        error: 'Grok/xAI no devolvió una respuesta válida.'
      };
    }

    return {
      answer,
      model: data.model || model,
      provider: 'grok',
      source: 'LEXIA (RAG local + Grok/xAI)'
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw {
        provider: 'grok',
        code: 'timeout',
        error: 'Grok/xAI no respondió dentro del tiempo límite.'
      };
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function callGroqChat(messages, options = {}) {
  if (!groqKey) {
    throw {
      provider: 'groq',
      code: 'not_configured',
      error: 'GroqCloud no está configurado.'
    };
  }

  const model = options.model || groqModel;
  const temperature = Number.isFinite(options.temperature) ? options.temperature : Number(process.env.GROQ_TEMPERATURE || process.env.GROCK_TEMPERATURE || process.env.OPENAI_TEMPERATURE || 0.35);
  const { controller, timeout } = createProviderTimeout();

  try {
    const response = await fetch(`${groqBaseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: Number(process.env.GROQ_MAX_TOKENS || process.env.GROCK_MAX_TOKENS || 2000),
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
      console.error('❌ Error GroqCloud:', errorBody);
      throw {
        provider: 'groq',
        code: parsedError?.error?.code || null,
        error: parsedError?.error?.message || parsedError?.error || `GroqCloud respondió con estado ${response.status}.`,
        status: response.status
      };
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.trim();
    if (!answer) {
      throw {
        provider: 'groq',
        code: 'empty_response',
        error: 'GroqCloud no devolvió una respuesta válida.'
      };
    }

    return {
      answer,
      model: data.model || model,
      provider: 'groq',
      source: 'LEXIA (RAG local + GroqCloud)'
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw {
        provider: 'groq',
        code: 'timeout',
        error: 'GroqCloud no respondió dentro del tiempo límite.'
      };
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function callOllamaChat(messages, options = {}) {
  if (!ollamaEnabled) {
    throw {
      provider: 'ollama',
      code: 'not_configured',
      error: 'Ollama no está configurado.'
    };
  }

  const model = options.model || ollamaModel;
  const temperature = Number.isFinite(options.temperature) ? options.temperature : Number(process.env.OLLAMA_TEMPERATURE || process.env.OPENAI_TEMPERATURE || 0.35);
  const { controller, timeout } = createProviderTimeout();
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.OLLAMA_API_KEY) {
    headers.Authorization = `Bearer ${process.env.OLLAMA_API_KEY}`;
  }

  try {
    const response = await fetch(`${ollamaBaseUrl}/api/chat`, {
      method: 'POST',
      signal: controller.signal,
      headers,
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        keep_alive: process.env.OLLAMA_KEEP_ALIVE || '5m',
        options: {
          temperature
        }
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
      console.error('❌ Error Ollama:', errorBody);
      throw {
        provider: 'ollama',
        code: parsedError?.error ? 'ollama_error' : null,
        error: parsedError?.error || `Ollama respondió con estado ${response.status}.`,
        status: response.status
      };
    }

    const data = await response.json();
    const answer = data.message?.content?.trim();
    if (!answer) {
      throw {
        provider: 'ollama',
        code: 'empty_response',
        error: 'Ollama no devolvió una respuesta válida.'
      };
    }

    return {
      answer,
      model,
      provider: 'ollama',
      source: 'LEXIA (RAG local + Ollama)'
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw {
        provider: 'ollama',
        code: 'timeout',
        error: 'Ollama no respondió dentro del tiempo límite.'
      };
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function generateWithConfiguredProvider(messages, options = {}) {
  if (forceLocalProvider) {
    return {
      answer: '',
      provider: 'local',
      model: 'local-rag-engine',
      source: 'LEXIA RAG Local',
      providerErrors: []
    };
  }

  const providers = preferGroq
    ? ['groq', 'grok', 'openai', 'ollama']
    : (preferGrok
      ? ['grok', 'groq', 'openai', 'ollama']
      : (preferOllama ? ['ollama', 'groq', 'grok', 'openai'] : ['openai', 'groq', 'grok', 'ollama']));
  const errors = [];

  for (const provider of providers) {
    try {
      if (provider === 'groq' && groqKey) {
        return { ...(await callGroqChat(messages, options)), providerErrors: errors };
      }
      if (provider === 'grok' && xAiKey) {
        return { ...(await callGrokChat(messages, options)), providerErrors: errors };
      }
      if (provider === 'openai' && openAiKey) {
        return { ...(await callOpenAiChat(messages, options)), providerErrors: errors };
      }
      if (provider === 'ollama' && ollamaEnabled) {
        return { ...(await callOllamaChat(messages, options)), providerErrors: errors };
      }
    } catch (error) {
      const providerError = {
        provider: error.provider || provider,
        code: error.code || null,
        error: error.error || error.message || 'Error del proveedor generativo.'
      };
      errors.push(providerError);
      console.warn(`LEXIA proveedor ${providerError.provider} no disponible: ${providerError.error}`);
    }
  }

  return { answer: '', provider: 'local', model: 'local-rag-engine', source: 'LEXIA RAG Local', providerErrors: errors };
}

function buildLexiaSystemPrompt() {
  return `Eres LEXIA, una IA jurídica especializada en Derecho peruano. Tu función en "Nueva Consulta (IA)" es conversar con la persona como lo haría un abogado cercano, paciente y claro: escuchas primero, explicas con palabras entendibles y luego das criterio jurídico riguroso, útil y verificable cuando existan fuentes.

PERSONALIDAD Y ESTILO:
- Mantén una conversación amable, humana y profesional. No respondas como un buscador ni como un formulario.
- Habla como una abogada cercana: directa, clara y con criterio. No suenes como manual, catálogo, plantilla ni soporte técnico.
- Responde primero a la intención real del usuario. Si pregunta "qué hago", da una ruta; si pregunta "cómo así", explica lo anterior; si da un dato nuevo, incorpóralo.
- Si ya hay historial, continúa el hilo sin saludar, sin resumir todo de nuevo y sin repetir la misma estructura.
- El último mensaje del usuario manda. Si corrige algo ("no me denunciaron", "yo soy el denunciado", "era verbal", "ya pagué"), actualiza la hipótesis jurídica y responde sobre esa corrección, no repitas la pregunta anterior.
- Distingue el rol procesal del usuario: víctima, denunciado/investigado, demandante, demandado, trabajador, empleador, acreedor o deudor. Si el rol no está claro, pregunta por ese rol en una sola pregunta.
- No concluyas que no existe investigación, proceso, deuda, despido o responsabilidad solo porque el usuario no fue notificado o no conoce una denuncia. Formula la conclusión con cuidado: "si no has sido notificado", "hasta donde sabes", "habría que verificar".
- Si el usuario escribe poco o ambiguo, haz una sola pregunta concreta y jurídica. No hagas listas de preguntas salvo que el usuario pida preparar el caso.
- Nunca cierres con dos o más preguntas. Si necesitas continuar, elige la pregunta jurídica más importante y haz solo esa.
- Si no entiendes algo, pregunta al usuario en vez de inventar hechos.
- Empieza reconociendo brevemente la preocupación solo cuando ayude: "Con esos datos...", "En tu caso...", "Lo relevante aquí es...".
- Usa lenguaje sencillo antes de introducir términos técnicos. Cuando uses un término jurídico, explícalo en una frase corta.
- Si faltan datos, responde lo posible con supuestos claros y formula una pregunta concreta para continuar.
- Evita respuestas frías, excesivamente largas o llenas de tecnicismos. Prioriza frases directas, ejemplos simples y próximos pasos.
- Puedes usar "te recomiendo", "conviene revisar" y "lo primero sería", dejando claro que es orientación general y no patrocinio legal.
- No empieces con listas largas si el usuario hizo una pregunta simple. Primero responde en una frase clara y luego amplía si hace falta.
- Mantente dentro del mundo jurídico. No respondas como consejero general, psicólogo, vendedor ni bot administrativo.

CAPACIDADES QUE DEBES EJECUTAR EN CADA RESPUESTA:
- Razonamiento jurídico: antes de responder, analiza internamente hechos, problema jurídico, regla aplicable, riesgos, prueba disponible, datos faltantes y conclusión probable. No muestres cadena de pensamiento; muestra solo un resumen claro del criterio y las razones principales.
- Chat con IA jurídica: responde la pregunta concreta antes de ampliar.
- Conversación antes que fuente: si el usuario está aclarando o siguiendo el hilo, responde a esa aclaración. No abras secciones de fuentes salvo que cites una norma, entidad o referencia concreta que cambie la respuesta.
- Consulta de leyes: identifica normas, códigos, artículos, requisitos, plazos y autoridades competentes cuando aplique.
- Jurisprudencia: cita sentencias, precedentes, criterios o jurisprudencia solo si aparecen en la base de conocimiento o si el usuario los proporciona. No inventes números de expediente, fechas, salas ni citas.
- Análisis de casos: si hay hechos, separa hechos relevantes, problema jurídico, regla aplicable, análisis y conclusión.
- Sugerencias inteligentes: incluye próximos pasos prácticos, documentos a reunir, riesgos y preguntas de seguimiento útiles.
- Fuentes citadas: usa "Fuentes y verificación" solo cuando realmente hayas usado una fuente concreta. No llenes la respuesta con fuentes si el usuario solo está conversando o aclarando hechos.
- RAG: cuando exista "CONTEXTO RAG RECUPERADO", úsalo como respaldo silencioso. Cita [R1], [R2] solo si esa fuente sostiene una afirmación importante. No dejes que el RAG sustituya el diálogo.

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
No uses un formato rígido si la consulta es simple. Organiza la respuesta como una conversación jurídica clara solo con las partes que aporten valor:
1. Primero, una respuesta directa y entendible.
2. Luego, la explicación legal en lenguaje sencillo.
3. Si corresponde, base legal, criterios o jurisprudencia relevante.
4. Después, pasos prácticos y documentos que conviene reunir.
5. Cierra con una pregunta concreta si falta información, o con "Fuentes y verificación" solo cuando hayas usado normas o referencias específicas.

REGLAS:
- Siempre responde en español, con tono profesional, cercano y claro.
- Prioriza Derecho peruano salvo que el usuario indique otra jurisdicción.
- Si falta información clave, responde con supuestos explícitos y preguntas concretas.
- Advierte cuando sea necesaria revisión de un abogado o documento real.
- No presentes orientación general como asesoría legal definitiva.
- No hagas valoraciones morales; limita la respuesta al análisis legal.
- No afirmes tener información en tiempo real si no está disponible en el contexto.`;
}

let lexiaEngineInstance = null;

function getLexiaEngine() {
  if (lexiaEngineInstance) return lexiaEngineInstance;

  lexiaEngineInstance = createLexiaEngine({
    brain: {
      interpret: interpretLegalQuery,
      mergeIntent: mergeConversationIntent,
      buildInterpretationSearchQuery,
      isGreetingOnly,
      isConversationalFollowUp,
      isShortUserInput
    },
    memory: {
      normalizeMessages: normalizeMemoryMessages,
      buildSearchQuery: buildMemorySearchQuery,
      buildContext: buildConversationMemoryContext
    },
    knowledge: {
      ensureAvailable: ensureLegalKnowledgeAvailable,
      search: query => prioritizeKnowledgeResults(searchLegalKnowledgeBase(query), query),
      evaluateSufficiency: evaluateLocalSearchSufficiency,
      logSufficiency: logLocalSearchSufficiency,
      buildRagContext
    },
    reasoner: {
      buildProfile: buildLegalReasoningProfile,
      buildContext: buildLegalReasoningContext,
      buildGraph: buildLegalGraphReasoning,
      buildGraphContext: buildLegalGraphContext
    },
    response: {
      buildSystemPrompt: buildLexiaSystemPrompt,
      buildGreetingAnswer,
      buildFollowUpClarificationAnswer,
      buildLocalAnswer: buildMemoryAwareLocalAnswer
    },
    providers: {
      generate: generateWithConfiguredProvider
    },
    config: {
      temperature: () => Number(process.env.OPENAI_TEMPERATURE || 0.35),
      externalProviderRequested: () => externalProviderRequested,
      configuredProvider: () => configuredAiProvider
    }
  });

  return lexiaEngineInstance;
}

async function runLegalIntelligence(options = {}) {
  return getLexiaEngine().runLegalIntelligence(options);
}

// Detector robusto de consultas jurídicas
function isLegalQuery(text) {
  if (!text) return false;
  const keywords = [
    'contrato','compraventa','derecho','juzgado','demanda','abogado','inmueble','despido','despide','despiden','despedido','salario','laboral',
    'tribut','penal','delito','fiscal','familia','alimentos','divorcio','custodia','herencia','testamento',
    'arrendamiento','propiedad','posesión','acción','proceso','litigación','juicio','sentencia','recurso',
    'apelación','casación','habeas corpus','amparo','tutela','mandato','poder','procuración','notario',
    'escritura','registro','hipoteca','embargo','secuestro','incautación','multa','sanción','pena',
    'prisión','indemnización','daño','perjuicio','responsabilidad','culpa','negligencia','fraude','estafa','extorsión','extorsion',
    'robo','hurto','violencia','acoso','difamación','injuria','calumnia','agresión','asalto','homicidio',
    'aborto','adopción','patria potestad','guarda','visita','pensión','renta','cuota','arancel','honorario',
    'empresa','sociedad','quiebra','insolvencia','liquidación','ley','código','articulado','inciso'
    ,'constitución','constitucion','terreno','predio','lindero','linderos','vecino','empleador','trabajador'
  ];
  return keywords.some(k => text.toLowerCase().includes(k));
}

app.post('/api/legal-intent', (req, res) => {
  const query = String(req.body?.query || req.body?.prompt || '').trim();
  if (!query) {
    return res.status(400).json({ error: 'La consulta es obligatoria.' });
  }
  const memoryMessages = Array.isArray(req.body?.conversationMessages) ? req.body.conversationMessages : [];
  const intent = interpretLegalQuery(extractUserQuery(query), memoryMessages);
  const includeGraph = req.body?.includeGraph === true;
  const localResults = includeGraph
    ? getCombinedLegalKnowledgeCorpus()
        .map(record => ({
          ...record,
          relevance: scoreLegalKnowledgeRecord(record, buildInterpretationSearchQuery(query, intent, query), getQueryTerms(query))
        }))
        .filter(item => item.relevance > 0)
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, 8)
    : [];

  return res.json({
    query,
    intent,
    graphReasoning: includeGraph ? buildLegalGraphReasoning(intent, localResults) : undefined
  });
});

app.post('/api/legal-query', async (req, res) => {
  const query = String(req.body?.query || '').trim();
  if (!query) {
    return res.status(400).json({ error: 'La consulta es obligatoria.' });
  }

  await ensureLegalKnowledgeAvailable();
  const results = searchLegalEngine(query);
  const localSearchEvaluation = evaluateLocalSearchSufficiency(query, results);
  logLocalSearchSufficiency('/api/legal-query', query, localSearchEvaluation);
  return res.json({
    query,
    intent: classifyLegalIntent(query),
    results,
    searched: shouldSearchLegalEngine(query),
    localSearchStatus: localSearchEvaluation.localSearchStatus,
    shouldUseExternalSources: localSearchEvaluation.shouldUseExternalSources,
    reason: localSearchEvaluation.reason,
    collections: {
      legal_documents: legalIndex.legal_documents.length,
      legal_articles: legalIndex.legal_articles.length,
      jurisprudence: legalIndex.jurisprudence.length,
      cassations: legalIndex.cassations.length
    }
  });
});

app.get('/api/legal-brain/status', (req, res) => {
  const email = normalizeEmail(req.query.email);
  const configured = getLegalCuratorEmails().length > 0;
  return res.json({
    ok: true,
    configured,
    canSuggest: Boolean(email),
    canCurate: isLegalCuratorEmail(email)
  });
});

app.post('/api/legal-ingest', legalIngestUpload.single('file'), async (req, res) => {
  try {
    const body = req.body || {};
    assertLoggedBrainContributor(body.email);
    const file = req.file || null;
    const originalName = String(file?.originalname || body.fileName || body.filename || 'documento.txt').trim();
    const text = (await extractTextFromLegalUpload(file, body)).replace(/\u0000/g, '').trim();

    if (text.length < 120) {
      return res.status(400).json({ error: 'El documento no tiene texto suficiente para alimentar el motor.' });
    }

    const contentHash = hashContent(text);
    const source = {
      id: `source-${contentHash.slice(0, 16)}`,
      email: normalizeEmail(body.email),
      originalName,
      mimeType: file?.mimetype || body.mimeType || '',
      sizeBytes: file?.size || Buffer.byteLength(text, 'utf8'),
      title: String(body.title || path.parse(originalName).name.replace(/[_-]/g, ' ')).trim().slice(0, 180),
      sourceLabel: String(body.source || body.fuente || path.parse(originalName).name.replace(/[_-]/g, ' ')).trim().slice(0, 180),
      url: String(body.url || '').trim(),
      sourceType: 'file',
      reviewStatus: isLegalCuratorEmail(body.email)
        ? normalizeReviewStatus(body.reviewStatus || body.status, 'pending_review')
        : 'pending_review',
      legalScore: 100,
      legalEvaluation: { isLegal: true, score: 100, reason: 'archivo propuesto por usuario de LEXIA' },
      contentHash,
      text
    };
    const entries = buildIngestedLegalEntries({
      sourceId: source.id,
      fileName: originalName,
      title: source.title,
      text,
      materia: String(body.materia || '').trim(),
      fecha: String(body.fecha || '').trim(),
      fuente: source.sourceLabel,
      url: source.url,
      modulo: String(body.modulo || '').trim()
    });

    if (!entries.length) {
      return res.status(400).json({ error: 'No se pudieron crear entradas jurídicas desde el documento.' });
    }

    let storage = 'local';
    let dbPersisted = false;
    if (accountsPool) {
      try {
        dbPersisted = await persistIngestedLegalKnowledgeToDb({ source, entries });
        storage = dbPersisted ? 'postgres' : 'local';
      } catch (error) {
        console.warn('⚠️ No se pudo persistir ingesta en PostgreSQL, usando fallback local:', error.message);
      }
    }

    let localBackup = null;
    if (source.reviewStatus === 'approved' && (!dbPersisted || process.env.LEGAL_INGEST_WRITE_LOCAL === 'true')) {
      localBackup = persistIngestedLegalKnowledgeLocally({ source, entries });
    }

    if (source.reviewStatus === 'approved') {
      mergeRuntimeLegalKnowledge(entries);
      if (dbPersisted) legalIngestedCorpusLoaded = true;
    }
    console.log(`[LEXIA Ingest] source=${source.id}; storage=${storage}; entries=${entries.length}; file="${originalName}"`);

    return res.json({
      ok: true,
      source: {
        id: source.id,
        title: source.title,
        originalName: source.originalName,
        hash: source.contentHash,
        storage,
        reviewStatus: source.reviewStatus
      },
      entries: entries.map(entry => ({
        id: entry.id,
        titulo: entry.titulo,
        materia: entry.materia,
        modulo: entry.modulo,
        resumen: entry.resumen
      })),
      localBackup,
      modules: getLegalKnowledgeCounts()
    });
  } catch (error) {
    console.error('❌ Error en legal-ingest:', error);
    const message = error.message || 'No se pudo procesar el documento.';
    const status = message.includes('Formato no soportado') || message.includes('Debes enviar') ? 400 : error.statusCode || 500;
    return res.status(status).json({ error: message });
  }
});

async function ingestLegalWebSourceFromUrl(rawUrl, body = {}) {
  const parsedUrl = parseTrustedLegalUrl(rawUrl);
  const fetched = await fetchLegalWebSource(parsedUrl.toString());
  const text = String(fetched.text || '').replace(/\u0000/g, '').trim();

  if (text.length < 350) {
    const error = new Error('La página no tiene texto suficiente para alimentar el motor.');
    error.statusCode = 400;
    throw error;
  }

  const legalEvaluation = evaluateLegalContent(text, fetched.title, parsedUrl.toString());
  if (!legalEvaluation.isLegal) {
    const error = new Error('La página no parece contener información jurídica suficiente.');
    error.statusCode = 422;
    error.evaluation = legalEvaluation;
    throw error;
  }

  const reviewStatus = normalizeReviewStatus(
    isLegalCuratorEmail(body.email)
      ? body.reviewStatus || body.status || (body.autoApprove === true || body.autoApprove === 'true' ? 'approved' : 'pending_review')
      : 'pending_review',
    'pending_review'
  );
  const contentHash = hashContent(`${parsedUrl.toString()}\n${text}`);
  const source = {
    id: `source-${contentHash.slice(0, 16)}`,
    email: normalizeEmail(body.email),
    originalName: parsedUrl.toString(),
    mimeType: fetched.mimeType || 'text/html',
    sizeBytes: Buffer.byteLength(text, 'utf8'),
    title: String(body.title || fetched.title || parsedUrl.hostname).trim().slice(0, 180),
    sourceLabel: String(body.source || body.fuente || fetched.sourceLabel || parsedUrl.hostname).trim().slice(0, 180),
    url: parsedUrl.toString(),
    sourceType: 'web',
    reviewStatus,
    legalScore: legalEvaluation.score,
    legalEvaluation,
    contentHash,
    text
  };
  const entries = buildIngestedLegalEntries({
    sourceId: source.id,
    fileName: parsedUrl.hostname,
    title: source.title,
    text,
    materia: String(body.materia || '').trim(),
    fecha: String(body.fecha || fetched.date || '').trim(),
    fuente: source.sourceLabel,
    url: source.url,
    modulo: String(body.modulo || '').trim()
  });

  if (!entries.length) {
    const error = new Error('No se pudieron crear entradas jurídicas desde la URL.');
    error.statusCode = 400;
    throw error;
  }

  let storage = 'local';
  let dbPersisted = false;
  if (accountsPool) {
    try {
      dbPersisted = await persistIngestedLegalKnowledgeToDb({ source, entries });
      storage = dbPersisted ? 'postgres' : 'local';
    } catch (error) {
      console.warn('⚠️ No se pudo persistir URL en PostgreSQL, usando fallback local:', error.message);
    }
  }

  let localBackup = null;
  if (reviewStatus === 'approved' && (!dbPersisted || process.env.LEGAL_INGEST_WRITE_LOCAL === 'true')) {
    localBackup = persistIngestedLegalKnowledgeLocally({ source, entries });
  }

  if (reviewStatus === 'approved') {
    mergeRuntimeLegalKnowledge(entries);
    if (dbPersisted) legalIngestedCorpusLoaded = true;
  }

  console.log(`[LEXIA Web Ingest] source=${source.id}; status=${reviewStatus}; score=${legalEvaluation.score}; storage=${storage}; url="${parsedUrl.toString()}"`);

  return {
    ok: true,
    source: {
      id: source.id,
      title: source.title,
      url: source.url,
      sourceType: source.sourceType,
      reviewStatus,
      legalScore: source.legalScore,
      storage
    },
    evaluation: legalEvaluation,
    entries: entries.map(entry => ({
      id: entry.id,
      titulo: entry.titulo,
      materia: entry.materia,
      modulo: entry.modulo,
      resumen: entry.resumen
    })),
    usableInChat: reviewStatus === 'approved',
    localBackup,
    modules: getLegalKnowledgeCounts()
  };
}

app.post('/api/legal-ingest-url', async (req, res) => {
  try {
    const body = req.body || {};
    assertLoggedBrainContributor(body.email);
    const rawUrl = String(body.url || '').trim();
    if (!rawUrl) return res.status(400).json({ error: 'La URL es obligatoria.' });

    return res.json(await ingestLegalWebSourceFromUrl(rawUrl, body));
  } catch (error) {
    console.error('❌ Error en legal-ingest-url:', error);
    const message = error.message || 'No se pudo procesar la URL.';
    const status = message.includes('URL inválida')
      || message.includes('Fuente no permitida')
      || message.includes('robots.txt')
      || message.includes('no soportado')
      ? 400
      : error.statusCode || 500;
    return res.status(status).json({ error: message });
  }
});

app.post('/api/legal-engine/discover', async (req, res) => {
  try {
    const body = req.body || {};
    assertLegalCuratorAccess(body.email);
    const query = String(body.query || '').trim();
    const seedUrls = Array.isArray(body.seedUrls) ? body.seedUrls.map(String) : [];
    const limit = Number(body.limit || 12);

    const discovery = await discoverLegalSourceCandidates({ query, seedUrls, limit });
    return res.json({
      ok: true,
      query,
      candidates: discovery.candidates,
      errors: discovery.errors,
      configuredSeeds: getLegalDiscoverySeedUrls().length
    });
  } catch (error) {
    console.error('❌ Error en legal-engine/discover:', error.message);
    return res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : 'No se pudieron descubrir fuentes jurídicas.'
    });
  }
});

app.post('/api/legal-engine/feed', async (req, res) => {
  try {
    const body = req.body || {};
    assertLegalCuratorAccess(body.email);
    const query = String(body.query || '').trim();
    const explicitUrls = Array.isArray(body.urls) ? body.urls.map(String).filter(Boolean) : [];
    const seedUrls = Array.isArray(body.seedUrls) ? body.seedUrls.map(String) : [];
    const limit = Math.max(1, Math.min(Number(body.limit || 5), 10));
    const urls = explicitUrls.length
      ? explicitUrls.slice(0, limit)
      : (await discoverLegalSourceCandidates({ query, seedUrls, limit })).candidates.map(item => item.url);

    if (!urls.length) {
      return res.status(400).json({
        error: 'No se encontraron fuentes para alimentar LEXIA. Configura LEGAL_DISCOVERY_SEED_URLS o envía seedUrls/urls.'
      });
    }

    const ingested = [];
    const failed = [];
    for (const url of urls) {
      try {
        const result = await ingestLegalWebSourceFromUrl(url, {
          ...body,
          autoApprove: body.autoApprove !== false,
          reviewStatus: body.reviewStatus || 'approved',
          source: body.source || 'Lexia Engine Web Discovery'
        });
        ingested.push({
          url,
          source: result.source,
          entries: result.entries.length,
          usableInChat: result.usableInChat
        });
      } catch (error) {
        failed.push({
          url,
          error: error.message,
          evaluation: error.evaluation
        });
      }
    }

    return res.json({
      ok: true,
      query,
      requested: urls.length,
      ingested,
      failed,
      modules: getLegalKnowledgeCounts()
    });
  } catch (error) {
    console.error('❌ Error en legal-engine/feed:', error.message);
    return res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : 'No se pudo alimentar el cerebro de LEXIA.'
    });
  }
});

app.get('/api/legal-ingest', async (req, res) => {
  try {
    assertLoggedBrainContributor(req.query.email);
    const email = normalizeEmail(req.query.email);
    const canCurate = isLegalCuratorEmail(email);
    const ready = await ensureLegalIngestionDatabase();
    if (!ready) {
      return res.json({ ok: true, storage: 'local', sources: [], entries: legalIngestedCorpus.length });
    }

    const result = await accountsPool.query(`
      SELECT id, original_name AS "originalName", title, source_label AS "sourceLabel",
             source_url AS "sourceUrl", source_type AS "sourceType", review_status AS "reviewStatus",
             legal_score AS "legalScore", size_bytes AS "sizeBytes", created_at AS "createdAt"
      FROM legal_ingested_sources
      ${canCurate ? '' : 'WHERE account_email = $1'}
      ORDER BY created_at DESC
      LIMIT 50
    `, canCurate ? [] : [email]);
    return res.json({ ok: true, storage: 'postgres', sources: result.rows, entries: legalIngestedCorpus.length, canCurate });
  } catch (error) {
    console.error('Error listando ingestas:', error.message);
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    return res.json({
      ok: true,
      storage: 'local',
      sources: [],
      entries: legalIngestedCorpus.length,
      warning: 'PostgreSQL no estuvo disponible al listar fuentes.'
    });
  }
});

app.patch('/api/legal-ingest/:id/status', async (req, res) => {
  try {
    assertLegalCuratorAccess(req.body?.email);
    const ready = await ensureLegalIngestionDatabase();
    if (!ready) return res.status(503).json({ error: 'PostgreSQL no está configurado para ingesta jurídica.' });

    const sourceId = String(req.params.id || '').trim();
    const reviewStatus = normalizeReviewStatus(req.body?.reviewStatus || req.body?.status, '');
    if (!sourceId || !reviewStatus) {
      return res.status(400).json({ error: 'ID y estado son obligatorios.' });
    }

    const sourceResult = await accountsPool.query(
      'UPDATE legal_ingested_sources SET review_status = $1 WHERE id = $2 RETURNING id, title, source_url AS "sourceUrl", review_status AS "reviewStatus"',
      [reviewStatus, sourceId]
    );
    if (!sourceResult.rows.length) return res.status(404).json({ error: 'Fuente no encontrada.' });

    await accountsPool.query(
      'UPDATE legal_ingested_entries SET review_status = $1 WHERE source_id = $2',
      [reviewStatus, sourceId]
    );
    await loadLegalIngestedKnowledgeFromDb(true);

    return res.json({ ok: true, source: sourceResult.rows[0], modules: getLegalKnowledgeCounts() });
  } catch (error) {
    console.error('Error actualizando estado de ingesta:', error.message);
    return res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : 'No se pudo actualizar el estado de la fuente.'
    });
  }
});

app.post('/api/legal-search', async (req, res) => {
  const query = String(req.body?.query || '').trim();
  if (!query) {
    return res.status(400).json({ error: 'La consulta es obligatoria.' });
  }

  await ensureLegalKnowledgeAvailable();
  const results = searchLegalKnowledgeBase(query);
  const localSearchEvaluation = evaluateLocalSearchSufficiency(query, results);
  logLocalSearchSufficiency('/api/legal-search', query, localSearchEvaluation);
  return res.json({
    query,
    intent: classifyLegalIntent(query),
    results,
    searched: shouldSearchLegalEngine(query),
    localSearchStatus: localSearchEvaluation.localSearchStatus,
    shouldUseExternalSources: localSearchEvaluation.shouldUseExternalSources,
    reason: localSearchEvaluation.reason,
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
    const conversationMemory = await loadConversationMemory(
      chatEmail,
      chatSessionId,
      Array.isArray(req.body?.conversationMessages) ? req.body.conversationMessages : []
    );
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

    const intelligenceResult = await runLegalIntelligence({
      userQuery,
      prompt,
      conversationMemory
    });
    const persisted = await persistAnswer(intelligenceResult.answer, intelligenceResult.metadata);

    return res.json({
      answer: intelligenceResult.answer,
      intent: intelligenceResult.intent,
      results: intelligenceResult.results,
      ragSources: intelligenceResult.ragSources,
      source: intelligenceResult.source,
      fallback: intelligenceResult.fallback,
      providerError: intelligenceResult.providerError,
      providerCode: intelligenceResult.providerCode,
      model: intelligenceResult.model,
      provider: intelligenceResult.provider,
      retrieval: intelligenceResult.retrieval,
      persisted
    });
  } catch (error) {
    console.error('❌ Error interno:', error);
    const query = extractUserQuery(req.body?.prompt);
    const localResults = query ? searchLegalKnowledgeBase(query) : [];
    const intent = query ? interpretLegalQuery(query, Array.isArray(req.body?.conversationMessages) ? req.body.conversationMessages : []) : null;
    const fallbackMemory = Array.isArray(req.body?.conversationMessages) ? req.body.conversationMessages : [];
    const fallbackReasoningProfile = query && intent ? buildLegalReasoningProfile(query, intent, fallbackMemory, localResults) : null;
    const fallbackGraphReasoning = query && intent ? buildLegalGraphReasoning(intent, localResults) : null;
    res.json({
      answer: query
        ? buildMemoryAwareLocalAnswer(query, intent, localResults, fallbackReasoningProfile, fallbackGraphReasoning, fallbackMemory)
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
  console.log(`💱 Modelo OpenAI: ${process.env.OPENAI_MODEL || 'gpt-4o-mini'}`);
  console.log(`⚡ Grok/xAI: ${xAiKey ? '✅ Conectado' : '❌ No configurado'}`);
  console.log(`🧠 Modelo Grok: ${grokModel}`);
  console.log(`⚡ GroqCloud: ${groqKey ? '✅ Conectado' : '❌ No configurado'}`);
  console.log(`🧠 Modelo GroqCloud: ${groqModel}`);
  console.log(`🧠 Ollama: ${ollamaEnabled ? `✅ ${ollamaBaseUrl}` : '❌ No configurado'}`);
  console.log(`🧩 Modelo Ollama: ${ollamaModel}`);
  console.log(`🎛️ Proveedor preferido: ${forceLocalProvider ? 'local' : (preferGroq ? 'groq' : (preferGrok ? 'grok' : (preferOllama ? 'ollama' : 'openai')))}`);
  console.log('\n' + '='.repeat(60) + '\n');
});
