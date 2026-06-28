const express = require('express');
const path = require('path');
const fs = require('fs');
const fetch = global.fetch || require('node-fetch');
const cors = require('cors');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const cheerio = require('cheerio');
const { Pool } = require('pg');
const dotenv = require('dotenv');
const { createLexiaEngine } = require('./lexia-engine/orchestrator');
const { createRateLimiter } = require('./lexia-engine/flow-control');
const { createKnowledgeEngine } = require('./lexia-engine/knowledge');
const { createPythonBrain } = require('./lexia-engine/python-brain');

const projectRoot = path.join(__dirname, '..');
const frontendRoot = path.join(projectRoot, 'frontend');
const viewsRoot = path.join(frontendRoot, 'src', 'views');
const frontendSrcRoot = path.join(frontendRoot, 'src');
const publicRoot = path.join(frontendRoot, 'public');
const aiEngineRoot = path.join(projectRoot, 'ai-engine');

for (const envPath of [path.join(projectRoot, '.env'), path.join(__dirname, '.env')]) {
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
}

function envValue(name, fallback = '') {
  return String(process.env[name] || fallback).trim();
}

const app = express();
const port = process.env.PORT || 3000;
const publicUrl = envValue('RENDER_EXTERNAL_URL') || envValue('PUBLIC_URL');
const openAiKey = envValue('OPENAI_API_KEY');
const rawXAiKey = envValue('XAI_API_KEY');
const rawGroqKey = envValue('GROQ_API_KEY') || envValue('GROCK_API_KEY');
const xAiKey = rawXAiKey && !String(rawXAiKey).startsWith('gsk_') ? rawXAiKey : '';
const groqKey = rawGroqKey || (String(rawXAiKey).startsWith('gsk_') ? rawXAiKey : '');
const openAiBaseUrl = envValue('OPENAI_BASE_URL', 'https://api.openai.com/v1').replace(/\/+$/, '');
const openAiModel = envValue('OPENAI_MODEL', 'gpt-4o-mini');
const xAiBaseUrl = (envValue('XAI_BASE_URL') || envValue('GROK_BASE_URL') || 'https://api.x.ai/v1').replace(/\/+$/, '');
const grokModel = envValue('XAI_MODEL') || envValue('GROK_MODEL') || 'grok-4.3';
const groqBaseUrl = (envValue('GROQ_BASE_URL') || envValue('GROCK_BASE_URL') || 'https://api.groq.com/openai/v1').replace(/\/+$/, '');
const groqModel = envValue('GROQ_MODEL') || envValue('GROCK_MODEL') || 'llama-3.3-70b-versatile';
const ollamaBaseUrl = envValue('OLLAMA_BASE_URL').replace(/\/+$/, '');
const ollamaModel = envValue('OLLAMA_MODEL', 'llama3.1:8b');
const ollamaApiKey = envValue('OLLAMA_API_KEY');
const ollamaEnabled = Boolean(ollamaBaseUrl) && process.env.OLLAMA_ENABLED !== 'false';
const configuredAiProvider = envValue('AI_PROVIDER').toLowerCase();
const providerStrategy = envValue('LEXIA_PROVIDER_STRATEGY', 'fallback').toLowerCase();
const forceLocalProvider = configuredAiProvider === 'local';
const externalProviderRequested = Boolean(configuredAiProvider && configuredAiProvider !== 'local');
const preferGrok = !forceLocalProvider && (['grok', 'xai'].includes(configuredAiProvider) || process.env.GROK_PREFER === 'true' || process.env.XAI_PREFER === 'true');
const preferGroq = !forceLocalProvider && (['groq', 'grock'].includes(configuredAiProvider) || (configuredAiProvider === 'grok' && Boolean(groqKey) && !xAiKey) || process.env.GROQ_PREFER === 'true' || process.env.GROCK_PREFER === 'true');
const preferOllama = !forceLocalProvider && (configuredAiProvider === 'ollama' || process.env.OLLAMA_PREFER === 'true');
const providerTimeoutMs = Number(process.env.AI_PROVIDER_TIMEOUT_MS || 45000);
const pythonBrain = createPythonBrain({
  enabled: process.env.LEXIA_PYTHON_BRAIN_ENABLED !== 'false',
  timeoutMs: Number(process.env.LEXIA_PYTHON_BRAIN_TIMEOUT_MS || 2500)
});
const aiProviderConfig = {
  openai: {
    apiKey: openAiKey,
    baseUrl: openAiBaseUrl,
    model: openAiModel,
    temperature: Number(process.env.OPENAI_TEMPERATURE || 0.35),
    maxTokens: Number(process.env.OPENAI_MAX_TOKENS || 2000)
  },
  grok: {
    apiKey: xAiKey,
    baseUrl: xAiBaseUrl,
    model: grokModel,
    temperature: Number(process.env.GROK_TEMPERATURE || process.env.XAI_TEMPERATURE || process.env.OPENAI_TEMPERATURE || 0.35),
    maxTokens: Number(process.env.GROK_MAX_TOKENS || process.env.XAI_MAX_TOKENS || 2000)
  },
  groq: {
    apiKey: groqKey,
    baseUrl: groqBaseUrl,
    model: groqModel,
    temperature: Number(process.env.GROQ_TEMPERATURE || process.env.GROCK_TEMPERATURE || process.env.OPENAI_TEMPERATURE || 0.35),
    maxTokens: Number(process.env.GROQ_MAX_TOKENS || process.env.GROCK_MAX_TOKENS || 2000)
  },
  ollama: {
    enabled: ollamaEnabled,
    apiKey: ollamaApiKey,
    baseUrl: ollamaBaseUrl,
    model: ollamaModel,
    temperature: Number(process.env.OLLAMA_TEMPERATURE || process.env.OPENAI_TEMPERATURE || 0.35),
    keepAlive: envValue('OLLAMA_KEEP_ALIVE', '5m')
  }
};
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
    `SELECT m.id, m.role, m.content, m.metadata, m.created_at
     FROM chat_messages m
     JOIN chat_sessions s
       ON s.id = m.session_id
      AND s.account_email = m.account_email
      AND s.deleted_at IS NULL
     WHERE m.session_id = $1 AND m.account_email = $2
     ORDER BY m.created_at ASC`,
    [sessionId, normalizeEmail(email)]
  );
  return result.rows.map(serializeChatMessage);
}

async function getRecentChatMessages(sessionId, email, limit = 12) {
  const ready = await ensureChatsDatabase();
  if (!ready) throw new Error('PostgreSQL no está configurado para chats.');

  const result = await accountsPool.query(
    `SELECT m.id, m.role, m.content, m.metadata, m.created_at
     FROM chat_messages m
     JOIN chat_sessions s
       ON s.id = m.session_id
      AND s.account_email = m.account_email
      AND s.deleted_at IS NULL
     WHERE m.session_id = $1 AND m.account_email = $2
     ORDER BY m.created_at DESC
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

async function clearNotifications(email, role = '') {
  const ready = await ensureNotificationsDatabase();
  if (!ready) throw new Error('PostgreSQL no está configurado para notificaciones.');

  const values = [normalizeEmail(email)];
  const roleClause = role ? 'AND role = $2' : '';
  if (role) values.push(String(role));

  await accountsPool.query(
    `DELETE FROM notifications
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

    await clearNotifications(email, role);
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
    'munlima.gob.pe',
    'www.munlima.gob.pe',
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

function getEnabledWebSearchProviders() {
  const configured = String(process.env.LEGAL_WEB_SEARCH_PROVIDERS || '')
    .split(/[;,]/)
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
  const providers = configured.length ? configured : ['brave', 'bing', 'google', 'serpapi'];
  return [...new Set(providers)].filter(provider => ['brave', 'bing', 'google', 'serpapi'].includes(provider));
}

function buildLegalSearchQuery(query = '') {
  const allowedHosts = getAllowedLegalSourceHosts()
    .filter(host => !host.startsWith('www.'))
    .slice(0, 8);
  const siteFilter = allowedHosts.length
    ? `(${allowedHosts.map(host => `site:${host}`).join(' OR ')})`
    : '';
  return [String(query || '').trim(), 'Perú derecho ley jurisprudencia', siteFilter]
    .filter(Boolean)
    .join(' ')
    .trim();
}

function normalizeSearchCandidateUrl(rawUrl) {
  try {
    const parsed = parseTrustedLegalUrl(rawUrl);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function normalizeSearchCandidates(items = [], provider = 'web') {
  const candidates = [];
  const seen = new Set();
  for (const item of items) {
    const rawUrl = item?.url || item?.link || item?.href;
    const url = normalizeSearchCandidateUrl(rawUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const parsed = new URL(url);
    candidates.push({
      url,
      title: String(item?.title || item?.name || parsed.pathname.split('/').filter(Boolean).pop() || parsed.hostname).replace(/\s+/g, ' ').trim().slice(0, 220),
      snippet: String(item?.snippet || item?.description || item?.body || '').replace(/\s+/g, ' ').trim().slice(0, 360),
      host: parsed.hostname,
      relevance: Number(item?.relevance || 1),
      provider
    });
  }
  return candidates;
}

async function searchBraveLegalWeb(query, limit) {
  const apiKey = envValue('BRAVE_SEARCH_API_KEY');
  if (!apiKey) return { provider: 'brave', candidates: [], skipped: true };
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', buildLegalSearchQuery(query));
  url.searchParams.set('count', String(Math.min(limit, 20)));
  url.searchParams.set('country', 'PE');
  url.searchParams.set('search_lang', 'es');
  const response = await fetchWithTimeout(url.toString(), {
    headers: {
      accept: 'application/json',
      'X-Subscription-Token': apiKey
    }
  });
  if (!response.ok) throw new Error(`Brave Search respondió ${response.status}.`);
  const data = await response.json();
  return {
    provider: 'brave',
    candidates: normalizeSearchCandidates(data?.web?.results || [], 'brave')
  };
}

async function searchBingLegalWeb(query, limit) {
  const apiKey = envValue('BING_SEARCH_API_KEY');
  if (!apiKey) return { provider: 'bing', candidates: [], skipped: true };
  const endpoint = envValue('BING_SEARCH_ENDPOINT', 'https://api.bing.microsoft.com/v7.0/search');
  const url = new URL(endpoint);
  url.searchParams.set('q', buildLegalSearchQuery(query));
  url.searchParams.set('count', String(Math.min(limit, 20)));
  url.searchParams.set('mkt', 'es-PE');
  url.searchParams.set('responseFilter', 'Webpages');
  const response = await fetchWithTimeout(url.toString(), {
    headers: {
      accept: 'application/json',
      'Ocp-Apim-Subscription-Key': apiKey
    }
  });
  if (!response.ok) throw new Error(`Bing Search respondió ${response.status}.`);
  const data = await response.json();
  return {
    provider: 'bing',
    candidates: normalizeSearchCandidates(data?.webPages?.value || [], 'bing')
  };
}

async function searchGoogleLegalWeb(query, limit) {
  const apiKey = envValue('GOOGLE_SEARCH_API_KEY');
  const cx = envValue('GOOGLE_SEARCH_CX');
  if (!apiKey || !cx) return { provider: 'google', candidates: [], skipped: true };
  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('cx', cx);
  url.searchParams.set('q', buildLegalSearchQuery(query));
  url.searchParams.set('num', String(Math.min(limit, 10)));
  url.searchParams.set('lr', 'lang_es');
  url.searchParams.set('gl', 'pe');
  const response = await fetchWithTimeout(url.toString(), {
    headers: { accept: 'application/json' }
  });
  if (!response.ok) throw new Error(`Google Custom Search respondió ${response.status}.`);
  const data = await response.json();
  return {
    provider: 'google',
    candidates: normalizeSearchCandidates(data?.items || [], 'google')
  };
}

async function searchSerpApiLegalWeb(query, limit) {
  const apiKey = envValue('SERPAPI_API_KEY');
  if (!apiKey) return { provider: 'serpapi', candidates: [], skipped: true };
  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('q', buildLegalSearchQuery(query));
  url.searchParams.set('num', String(Math.min(limit, 10)));
  url.searchParams.set('hl', 'es');
  url.searchParams.set('gl', 'pe');
  const response = await fetchWithTimeout(url.toString(), {
    headers: { accept: 'application/json' }
  });
  if (!response.ok) throw new Error(`SerpAPI respondió ${response.status}.`);
  const data = await response.json();
  return {
    provider: 'serpapi',
    candidates: normalizeSearchCandidates(data?.organic_results || [], 'serpapi')
  };
}

async function discoverLegalSourceCandidatesFromSearch(query = '', limit = 12) {
  if (!String(query || '').trim() || process.env.LEGAL_WEB_SEARCH_ENABLED === 'false') {
    return { candidates: [], errors: [], providers: [] };
  }

  const providerMap = {
    brave: searchBraveLegalWeb,
    bing: searchBingLegalWeb,
    google: searchGoogleLegalWeb,
    serpapi: searchSerpApiLegalWeb
  };
  const candidates = [];
  const errors = [];
  const providers = [];
  const seen = new Set();

  for (const provider of getEnabledWebSearchProviders()) {
    try {
      const result = await providerMap[provider](query, Math.max(limit, 10));
      providers.push({
        provider,
        skipped: Boolean(result.skipped),
        results: result.candidates?.length || 0
      });
      for (const candidate of result.candidates || []) {
        if (!candidate.url || seen.has(candidate.url)) continue;
        seen.add(candidate.url);
        candidates.push(candidate);
        if (candidates.length >= limit) break;
      }
      if (candidates.length >= limit) break;
    } catch (error) {
      errors.push({ provider, error: error.message });
    }
  }

  return { candidates: candidates.slice(0, limit), errors, providers };
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
  const providers = [];
  const seen = new Set();

  const searchDiscovery = await discoverLegalSourceCandidatesFromSearch(query, maxLimit);
  providers.push(...searchDiscovery.providers);
  errors.push(...searchDiscovery.errors);
  for (const candidate of searchDiscovery.candidates) {
    if (seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    candidates.push(candidate);
    if (candidates.length >= maxLimit) break;
  }

  for (const seedUrl of seeds.slice(0, 8)) {
    if (candidates.length >= maxLimit) break;
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

  return { candidates: candidates.slice(0, maxLimit), errors, providers };
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

const knowledgeEngine = createKnowledgeEngine({
  aiEngineRoot,
  accountsPool,
  shouldSearchLegalEngine,
  normalizeReviewStatus
});

const {
  normalizeText,
  getQueryTerms,
  hashContent,
  extractTextFromLegalUpload,
  buildIngestedLegalEntries,
  getCombinedLegalKnowledgeCorpus,
  scoreLegalKnowledgeRecord,
  searchLegalKnowledgeBase,
  evaluateLocalSearchSufficiency,
  logLocalSearchSufficiency,
  getLegalKnowledgeCounts,
  mergeRuntimeLegalKnowledge,
  ensureLegalIngestionDatabase,
  loadLegalIngestedKnowledgeFromDb,
  ensureLegalKnowledgeAvailable,
  persistIngestedLegalKnowledgeToDb,
  persistIngestedLegalKnowledgeLocally,
  buildSourceSummary,
  legalIndex,
  searchLegalEngine,
  truncateForRag,
  buildRagContext,
  setLegalIngestedCorpusLoaded,
  getLegalIngestedEntryCount,
  getKnowledgeStats
} = knowledgeEngine;

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
      'busca el articulo', 'busca el artículo', 'que dice el articulo', 'qué dice el artículo',
      'cual es la ley', 'cuál es la ley', 'que ley', 'qué ley', 'que norma', 'qué norma',
      'fundamento legal', 'base legal', 'sustento legal', 'derecho a', 'derecho al',
      'derecho de', 'derecho del'
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
      'tribunal constitucional', 'tc', 'articulo constitucional', 'artículo constitucional',
      'debido proceso', 'tutela jurisdiccional', 'derecho de defensa', 'derecho a la defensa',
      'garantias procesales', 'garantías procesales', 'defensa en juicio'
    ],
    topics: [
      { id: 'constitucion', label: 'Constitución', keywords: ['constitucion', 'constitución', 'constituci', 'derechos fundamentales'] },
      { id: 'debido_proceso_defensa', label: 'Debido proceso y derecho de defensa', keywords: ['debido proceso', 'tutela jurisdiccional', 'derecho de defensa', 'derecho a la defensa', 'garantias procesales', 'garantías procesales', 'defensa en juicio'] },
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
      'lesiones', 'agresion', 'agresión', 'agredio', 'agredió', 'golpe', 'golpes', 'amenaza', 'amenazas', 'violencia', 'coaccion', 'coacción',
      'pareja', 'conviviente', 'ex pareja', 'expareja', 'esposo', 'esposa', 'enamorado', 'enamorada',
      'abuso', 'abusado', 'abusada', 'abuso sexual', 'violacion sexual', 'violación sexual',
      'menor abusado', 'menor de edad abusado', 'niño abusado', 'niña abusada',
      'menor de edad', 'menores de edad', 'niño', 'niña', 'adolescente',
      'tocamientos', 'actos libidinosos',
      'secuestro', 'difamacion', 'difamación', 'injuria', 'calumnia'
    ],
    topics: [
      { id: 'extorsion', label: 'Extorsión', keywords: ['extorsion', 'extorsión', 'chantaje', 'amenaza para pagar', 'cobro de cupos'] },
      { id: 'homicidio', label: 'Homicidio o asesinato', keywords: ['homicidio', 'asesinato', 'asesinaron', 'mataron', 'mato', 'mató', 'matar', 'muerte violenta', 'sicariato'] },
      { id: 'violencia_pareja', label: 'Agresión o violencia de pareja', keywords: ['agresion de pareja', 'agresión de pareja', 'mi pareja me agredio', 'mi pareja me agredió', 'pareja', 'conviviente', 'ex pareja', 'expareja', 'esposo', 'esposa', 'enamorado', 'enamorada', 'violencia familiar', 'violencia contra la mujer', 'lesiones', 'agresion', 'agresión', 'golpe', 'golpes', 'amenaza', 'amenazas'] },
      { id: 'abuso_sexual_menor', label: 'Abuso sexual contra menores', keywords: ['abuso', 'abusado', 'abusada', 'abuso sexual', 'violacion sexual', 'violación sexual', 'menor abusado', 'menor de edad abusado', 'niño abusado', 'niña abusada', 'menor de edad', 'menores de edad', 'niño', 'niña', 'adolescente', 'tocamientos', 'actos libidinosos'] },
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
    id: 'derecho_consumidor',
    label: 'Derecho del Consumidor',
    keywords: [
      'consumidor', 'consumo', 'indecopi', 'proveedor', 'reclamo', 'libro de reclamaciones',
      'servicio', 'servicio educativo', 'universidad', 'instituto', 'colegio', 'educacion',
      'educación', 'matricula', 'matrícula', 'pension', 'pensión', 'mensualidad',
      'cobro', 'cobran', 'cobrando', 'cobro excesivo', 'cobran demasiado', 'cobrando demasiado',
      'aumento', 'tarifa', 'cuota'
    ],
    topics: [
      {
        id: 'servicios_educativos',
        label: 'Servicios educativos y cobros',
        keywords: [
          'universidad', 'instituto', 'colegio', 'servicio educativo', 'educacion', 'educación',
          'matricula', 'matrícula', 'pension', 'pensión', 'mensualidad', 'cobro', 'aumento',
          'tarifa', 'cuota', 'cobran demasiado', 'cobrando demasiado'
        ]
      },
      {
        id: 'reclamo_consumidor',
        label: 'Reclamo de consumidor',
        keywords: ['indecopi', 'libro de reclamaciones', 'reclamo', 'queja', 'proveedor', 'idoneidad', 'informacion al consumidor', 'información al consumidor']
      }
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
    { id: 'ubicar_norma', label: 'Ubicar norma o artículo', patterns: ['dame', 'busca', 'articulo', 'artículo', 'art culo', 'inciso', 'ley', 'codigo', 'código', 'constitucion', 'constitución', 'constituci', 'que dice', 'qué dice', 'donde dice', 'dónde dice', 'de donde sacas', 'de dónde sacas', 'en que norma', 'en qué norma', 'que ley', 'qué ley', 'cual es la ley', 'cuál es la ley', 'fundamento legal', 'base legal', 'sustento legal', 'derecho a', 'derecho al', 'derecho de', 'derecho del'] },
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

function isConfusionText(text = '') {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  return /\b(no entiendo|no estoy entendiendo|no entendi|no entendí|no comprendo|no estoy comprendiendo|no te entiendo|no logro entender|no logro seguir|no me queda claro|no se entiende|me confunde|me perdi|me perdí|me enrede|me enredé|explicame|explícame|explicamelo|explícamelo|mas simple|más simple|mas claro|más claro|en simple|en sencillo|como asi|cómo así|que quieres decir|qué quieres decir)\b/.test(normalized);
}

function classifyConversationMode(query, memoryMessages = []) {
  const normalized = normalizeText(query);
  const memory = normalizeMemoryMessages(memoryMessages);
  const hasMemory = memory.length > 0;
  const userTerms = getQueryTerms(query);
  const normativeReference = extractNormativeReference(query);
  const exactArticleRequest = /\b(?:que|qué|como|cómo|dime|dame|lee|leeme|léeme|muestrame|muéstrame|transcribe|texto)\b.*\bart(?:iculo|ículo|\.?)?\s*\d+[a-z]?\b/.test(normalized)
    || /\b(?:me referia|me refería|era|quise decir|hablo|habló|hablaba)\b.*\bart(?:iculo|ículo|\.?)?\s*\d+[a-z]?\b/.test(normalized)
    || /\bart(?:iculo|ículo|\.?)?\s*\d+[a-z]?\b.*\b(?:dice|establece|señala|senala|escrita|escrito|texto|leer|leera|léela|leela|habla|trata|regula)\b/.test(normalized);
  const clauseExplanationRequest = /\b(?:explica|explicame|explícame|que significa|qué significa|que quiere decir|qué quiere decir|en simple|en sencillo)\b.*\b(?:inciso|numeral|apartado)\s*\d+[a-z]?\b/.test(normalized)
    || /\b(?:inciso|numeral|apartado)\s*\d+[a-z]?\b.*\b(?:explica|explicame|explícame|significa|quiere decir|simple|sencillo)\b/.test(normalized);

  const sourceRequest = /\b(donde dice|dónde dice|de donde sacas|de dónde sacas|sustento|fundamento|base legal|fuente|cita|en que norma|en qué norma|que articulo|qué articulo|que artículo|qué artículo|que ley|qué ley|cual es la ley|cuál es la ley)\b/.test(normalized);
  const verificationRequest = /\b(como sabes|cómo sabes|como sabes si|cómo sabes si|por que dices|por qué dices|porque dices|de donde sale que|de dónde sale que|como concluyes|cómo concluyes|como determinas|cómo determinas|en que te basas para decir|en qué te basas para decir|verifica|verificalo|verifícalo|revisa|revisalo|revísalo)\b/.test(normalized);
  const normRequest = /\b(dame|dime|busca|muestrame|muéstrame|necesito)\b.*\b(ley|leyes|articulo|artículo|articulos|artículos|norma|codigo|código)\b/.test(normalized)
    || /\b(leyes aplicables|articulos aplicables|artículos aplicables|normas aplicables)\b/.test(normalized)
    || clauseExplanationRequest
    || exactArticleRequest;
  const definitionRequest = /\b(que es|qué es|que significa|qué significa|que quiere decir|qué quiere decir|a que se refiere|a qué se refiere|defineme|defíneme|explicame que es|explícame qué es)\b/.test(normalized);
  const confusion = isConfusionText(query);
  const correction = /\b(no fue asi|no fue así|eso no es|eso no fue|te equivocas|estas mal|estás mal|incorrecto|no dije eso|yo no dije|no corresponde|corrige|mal entendido|malinterpretaste|te vengo diciendo|te estoy diciendo|te digo que|no estas tomando en cuenta|no estás tomando en cuenta|parece que no estas|parece que no estás|en internet dice|segun internet|según internet|la pagina dice|la página dice|la fuente dice|he visto que|dice que fue|fue promulgada|promulgada el|publicada el)\b/.test(normalized);
  const professionalRoleConflict = /\b(patrocinada|patrocinado|patrocinante|mi cliente|cliente|defendida|defendido)\b/.test(normalized)
    && /\b(denunciar|denuncio|denuncia|condena|condenaron|pena|penal|defender|defensa|proceso)\b/.test(normalized);
  const denouncedStatus = /\b(si ya denuncie|sí ya denuncié|ya denuncie|ya denuncié|ya hice denuncia|hice denuncia|puse denuncia|ya puse denuncia|ya denuncio|ya denunció|ya fui a la policia|ya fui a la policía|ya fui a fiscalia|ya fui a fiscalía|ya esta denunciado|ya está denunciado)\b/.test(normalized);
  const evaluatingStatus = /\b(estoy evaluando denunciar|evaluando denunciar|todavia estoy evaluando|todavía estoy evaluando|aun estoy evaluando|aún estoy evaluando|todavia no denuncie|todavía no denuncié|aun no denuncie|aún no denuncié|no denuncie|no denuncié|no he denunciado|todavia no|todavía no|aun no|aún no)\b/.test(normalized);
  const statusAnswer = denouncedStatus || evaluatingStatus;
  const actionRequest = /\b(que hago|qué hago|que puedo hacer|qué puedo hacer|como procedo|cómo procedo|que sigue|qué sigue|siguiente paso|pasos|denuncio|demando|respondo)\b/.test(normalized);
  const topicShift = /\b(otro caso|otra consulta|cambiando de tema|ahora quiero saber sobre|nuevo caso)\b/.test(normalized);
  const asksQuestion = /[?¿]/.test(String(query || '')) || /\b(que|qué|como|cómo|cuando|cuándo|donde|dónde|cual|cuál|por que|por qué)\b/.test(normalized);
  const hasLegalSignal = isLegalQuery(query) || userTerms.length >= 4;
  const looksLikeCaseFact = /\b(\d+|edad|años|ano|año|menor|niño|niña|adolescente|ayer|hoy|amenaza|mensaje|audio|captura|denuncia|policia|policía|fiscalia|fiscalía|contrato|carta|despido|deuda|pago)\b/.test(normalized);
  const newFact = hasMemory
    && !normativeReference
    && !sourceRequest
    && !normRequest
    && !definitionRequest
    && !confusion
    && !correction
    && !professionalRoleConflict
    && !verificationRequest
    && !statusAnswer
    && !actionRequest
    && !topicShift
    && (hasLegalSignal || looksLikeCaseFact || (!asksQuestion && userTerms.length >= 2));

  let id = 'case_start';
  if (exactArticleRequest || clauseExplanationRequest) id = 'norm_request';
  else if (normativeReference?.onlyReference) id = 'norm_request';
  else if (topicShift) id = 'topic_shift';
  else if (sourceRequest) id = 'source_request';
  else if (verificationRequest) id = 'verification_request';
  else if (normRequest) id = 'norm_request';
  else if (definitionRequest) id = 'definition_request';
  else if (confusion) id = 'confusion';
  else if (professionalRoleConflict) id = 'professional_role_conflict';
  else if (correction) id = 'correction';
  else if (statusAnswer) id = 'status_answer';
  else if (actionRequest) id = 'action_request';
  else if (newFact) id = 'new_fact';
  else if (hasMemory && isConversationalFollowUp(query)) id = 'follow_up';
  else if (hasMemory && userTerms.length <= 3) id = 'follow_up';

  const deterministic = ['source_request', 'verification_request', 'norm_request', 'definition_request', 'confusion', 'professional_role_conflict', 'correction', 'status_answer', 'action_request', 'new_fact'].includes(id);
  return {
    id,
    label: {
      case_start: 'Nuevo caso o consulta',
      topic_shift: 'Cambio de tema',
      source_request: 'Pedido de fuente o base legal',
      verification_request: 'Pedido de verificación de inferencia',
      norm_request: 'Pedido de norma o artículo',
      definition_request: 'Pregunta de definición o explicación',
      confusion: 'Usuario confundido',
      professional_role_conflict: 'Conflicto de rol profesional o patrocinio',
      correction: 'Corrección del usuario',
      status_answer: 'Respuesta sobre estado del trámite',
      action_request: 'Pedido de próximos pasos',
      new_fact: 'Dato nuevo del caso',
      follow_up: 'Seguimiento conversacional'
    }[id] || 'Mensaje conversacional',
    hasMemory,
    status: denouncedStatus ? 'denounced' : (evaluatingStatus ? 'evaluating' : null),
    deterministic
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

const legalCaseScopeRules = [
  { id: 'minor_abuse', label: 'abuso o violencia contra menores', pattern: /\b(menor|menores|nino|nina|adolescente|abuso sexual|violacion sexual|tocamientos|actos libidinosos|revictimizacion|ley 30403|176 a|articulo 173)\b/ },
  { id: 'partner_violence', label: 'agresión o violencia de pareja', pattern: /\b(pareja|conviviente|ex pareja|expareja|esposo|esposa|enamorado|enamorada|violencia familiar|violencia contra la mujer|agresion|agredio|golpe|golpes|lesiones|amenaza|amenazas)\b/ },
  { id: 'homicide', label: 'homicidio o asesinato', pattern: /\b(homicidio|asesinato|asesinad[oa]s?|asesinaron|mataron|mato|matar|muerte violenta|sicariato)\b/ },
  { id: 'extortion', label: 'extorsión', pattern: /\b(extorsion|extorsionad[oa]s?|extorsionando|chantaje|chantajeando|cobro de cupos|amenaza para pagar|exigen dinero|me estan cobrando cupo)\b/ },
  { id: 'robbery_theft', label: 'robo o hurto', pattern: /\b(robo|robaron|asalto|asaltaron|hurto|sustraccion|me quitaron|me arrebataron)\b/ },
  { id: 'fraud', label: 'estafa o fraude', pattern: /\b(estafa|estafaron|fraude|engano|enganaron|fraudulento)\b/ },
  { id: 'defamation', label: 'difamación, injuria o calumnia', pattern: /\b(difamacion|injuria|calumnia|me difaman|publicaron mentiras)\b/ },
  { id: 'labor_dismissal', label: 'despido laboral', pattern: /\b(despido|despedido|despedida|despidieron|carta de despido|me botaron del trabajo)\b/ },
  { id: 'labor_benefits', label: 'beneficios sociales laborales', pattern: /\b(beneficios sociales|cts|gratificacion|vacaciones|liquidacion|sueldo|salario|remuneracion)\b/ },
  { id: 'consumer_education', label: 'consumidor o servicio educativo', pattern: /\b(consumidor|indecopi|universidad|instituto|colegio|servicio educativo|matricula|pension|cobro|proveedor|libro de reclamaciones)\b/ },
  { id: 'property', label: 'propiedad o posesión', pattern: /\b(terreno|predio|inmueble|posesion|propiedad|vecino|lindero|partida registral|titulo de propiedad)\b/ },
  { id: 'family_alimony', label: 'alimentos', pattern: /\b(alimentos|pension alimenticia|pension de alimentos|demanda de alimentos)\b/ },
  { id: 'family_divorce', label: 'divorcio o separación', pattern: /\b(divorcio|separacion|separarme|divorciarme)\b/ },
  { id: 'custody', label: 'tenencia o visitas', pattern: /\b(tenencia|custodia|visitas|regimen de visitas|patria potestad)\b/ },
  { id: 'contract', label: 'contrato o incumplimiento contractual', pattern: /\b(contrato|incumplimiento|clausula|compraventa|arrendamiento|alquiler|obligacion contractual)\b/ },
  { id: 'constitutional', label: 'garantía constitucional', pattern: /\b(amparo|habeas corpus|habeas data|constitucion|derecho fundamental|debido proceso|derecho de defensa)\b/ }
];

function detectLegalCaseScopes(text = '') {
  const normalized = normalizeText(text);
  return legalCaseScopeRules
    .filter(rule => rule.pattern.test(normalized))
    .map(rule => rule.id);
}

function areLegalCaseScopesCompatible(currentScopes = [], previousScopes = []) {
  if (!currentScopes.length || !previousScopes.length) return true;
  return currentScopes.some(scope => previousScopes.includes(scope));
}

function shouldIgnoreMemoryForCurrentQuery(query, memoryMessages = []) {
  if (extractNormativeReference(query)?.onlyReference) return true;
  const normalizedQuery = normalizeText(query);
  const explicitCurrentNormativeSource = detectNormativeSourceInText(query);
  if (explicitCurrentNormativeSource) {
    const memorySource = detectNormativeSourceContext('', memoryMessages);
    if (memorySource && memorySource.id !== explicitCurrentNormativeSource.id) return true;
  }
  const explicitNewCase = /\b(otro caso|otra consulta|nuevo caso|cambiando de tema|ahora quiero saber sobre)\b/.test(normalizedQuery);
  if (explicitNewCase) return true;

  const currentScopes = detectLegalCaseScopes(query);
  const memoryText = normalizeMemoryMessages(memoryMessages)
    .filter(message => message.role === 'user')
    .map(message => message.content)
    .join(' ');
  const previousScopes = detectLegalCaseScopes(memoryText);
  if (!currentScopes.length || !previousScopes.length) return false;
  return !areLegalCaseScopesCompatible(currentScopes, previousScopes);
}

function interpretLegalQuery(query, memoryMessages = []) {
  const ignoreMemory = shouldIgnoreMemoryForCurrentQuery(query, memoryMessages);
  const effectiveMemoryMessages = ignoreMemory ? [] : memoryMessages;
  const memoryText = normalizeMemoryMessages(effectiveMemoryMessages)
    .filter(message => message.role === 'user')
    .slice(-4)
    .map(message => message.content)
    .join(' ');
  const fullText = [memoryText, query].filter(Boolean).join(' ');
  const currentNormalized = normalizeText(query);
  const normalized = normalizeText(fullText);
  const normativeReference = extractNormativeReference(query);
  const knownLaw = getKnownPeruvianLaw(normativeReference);
  const conversationMode = classifyConversationMode(query, effectiveMemoryMessages);
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
    ...(matchedTopic?.keywords || []),
    ...terms
  ].map(item => normalizeText(item)).filter(Boolean);
  const uniqueConcepts = [...new Set(concepts)].slice(0, 12);
  const typeId = normativeReference ? 'consulta_normativa' : (matchedType?.id || (objective.id === 'ubicar_norma' ? 'consulta_normativa' : 'consulta_general'));
  const typeLabel = normativeReference ? 'Consulta normativa' : (matchedType?.label || (objective.id === 'ubicar_norma' ? 'Consulta normativa' : 'Consulta general'));
  const areaId = matchedArea?.id || 'area_no_determinada';
  const topicId = knownLaw
    ? `ley_${knownLaw.number}`
    : (normativeReference ? `referencia_${normativeReference.number}` : (matchedTopic?.id || (fallbackTopic ? fallbackTopic.replace(/\s+/g, '_') : 'tema_no_determinado')));

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
      label: knownLaw?.title || (normativeReference ? `Ley o referencia N.° ${normativeReference.number}` : (matchedTopic?.label || fallbackTopic || 'Tema no determinado')),
      confidence: knownLaw ? 'alta' : (normativeReference ? 'media' : (matchedTopic ? topicConfidence : (fallbackTopic ? 'media' : 'baja')))
    },
    objective: normativeReference
      ? { id: 'ubicar_norma', label: 'Ubicar norma o artículo', confidence: knownLaw ? 'alta' : 'media' }
      : objective,
    conversationMode,
    concepts: normativeReference
      ? [...new Set([`ley ${normativeReference.number}`, knownLaw?.label, knownLaw?.title, knownLaw?.matter, ...uniqueConcepts].filter(Boolean))].slice(0, 12)
      : uniqueConcepts,
    complexity: inferComplexity(normalized, query, areaConfidence, topicConfidence),
    missingInfo: buildMissingInfoForInterpretation(normalized, typeId, areaId, topicId),
    interpretation: {
      areaScore: matchedArea?.score || 0,
      topicScore: matchedTopic?.score || 0,
      typeScore: matchedType?.score || 0,
      conversationMode: conversationMode.id,
      usedMemory: Boolean(memoryText),
      currentAreaScore: currentAreaScores[0]?.score || 0,
      currentAreaId: currentAreaScores[0]?.score > 0 ? currentAreaScores[0].id : '',
      currentTopicScore: topicScores[0]?.score || 0,
      ignoredMemory: ignoreMemory,
      caseScopes: detectLegalCaseScopes(query),
      normativeReference,
      knownLaw: knownLaw ? { number: knownLaw.number, title: knownLaw.title, label: knownLaw.label } : null
    },
    originalQuery: String(query || '').trim(),
    needsMoreFacts: typeId !== 'consulta_normativa' && (!matchedArea || !matchedTopic)
  };
}

async function interpretLegalQueryWithPython(query, memoryMessages = []) {
  const baseline = interpretLegalQuery(query, memoryMessages);
  const analysis = await pythonBrain.analyze({
    query: String(query || ''),
    memoryMessages: normalizeMemoryMessages(memoryMessages),
    baseline
  });
  if (!analysis.available || !analysis.ok || !analysis.intent) {
    return {
      ...baseline,
      interpretation: {
        ...(baseline.interpretation || {}),
        pythonBrain: {
          status: 'fallback',
          reason: analysis.reason || 'Python Brain no devolvió un análisis válido.'
        }
      }
    };
  }
  return analysis.intent;
}

function mergeConversationIntent(currentIntent, memoryIntent) {
  const currentIsFollowUp = isConversationalFollowUp(currentIntent?.originalQuery || '');
  const currentHasLegalSignal = !currentIsFollowUp && ((currentIntent?.interpretation?.currentAreaScore || 0) > 0
    || (currentIntent?.interpretation?.currentTopicScore || 0) > 0);
  const areaConflict = currentIntent?.area?.id
    && memoryIntent?.area?.id
    && currentIntent.area.id !== 'area_no_determinada'
    && memoryIntent.area.id !== 'area_no_determinada'
    && currentIntent.area.id !== memoryIntent.area.id;
  const topicConflict = currentIntent?.topic?.id
    && memoryIntent?.topic?.id
    && (currentIntent?.interpretation?.currentTopicScore || 0) > 0
    && (memoryIntent?.interpretation?.currentTopicScore || memoryIntent?.interpretation?.topicScore || 0) > 0
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
    conversationMode: currentIntent?.conversationMode || memoryIntent?.conversationMode || { id: 'case_start', label: 'Nuevo caso o consulta', deterministic: false },
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
      conversationMode: currentIntent?.conversationMode?.id || memoryIntent?.conversationMode?.id,
      topicShift
    },
    originalQuery: currentIntent?.originalQuery || '',
    needsMoreFacts: currentIntent?.type?.id !== 'consulta_normativa' && (area?.confidence !== 'alta' || topic?.confidence !== 'alta')
  };
}

function buildInterpretationSearchQuery(userQuery, intent, memorySearchQuery) {
  const lawReferenceQuery = buildLawReferenceSearchQuery(userQuery);
  if (intent?.type?.id === 'consulta_normativa') {
    const memoryAwareNormativeQuery = [
      lawReferenceQuery,
      intent?.area?.label,
      intent?.topic?.label,
      intent?.objective?.label,
      ...(intent?.concepts || []).slice(0, 8),
      memorySearchQuery && memorySearchQuery !== userQuery ? memorySearchQuery : ''
    ].filter(Boolean).join(' ');
    return truncateForRag(memoryAwareNormativeQuery || userQuery, 1600);
  }

  const enriched = [
    lawReferenceQuery,
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
  if (isConfusionText(text)) return true;
  const followUpPattern = /^(asi|así|como asi|cómo así|explica|explicame|explícame|explicamelo|explícamelo|hazlo|dilo|ponlo|resumelo|resúmelo|resume|continua|continúa|sigue|no entendi|no entendí|no entiendo|no estoy entendiendo|no comprendo|no estoy comprendiendo|mas claro|más claro|en simple|en sencillo|ok|vale|gracias)(\s.*)?$/;
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
  const dialogue = intent?.interpretation?.dialogue || {};
  lines.push('Lee esto como una conversación viva. Los mensajes del usuario son declaraciones del caso, no hechos probados. Las respuestas anteriores de LEXIA solo muestran el hilo: no son hechos y pueden contener interpretaciones equivocadas.');
  if (dialogue.supersedesPriorInterpretation) {
    lines.push(`La última intervención reemplaza el enfoque anterior. Foco vigente: ${dialogue.currentFocus || intent?.topic?.label || 'última precisión del usuario'}.`);
  }
  if (dialogue.answeredPreviousQuestion) {
    lines.push('La última intervención responde a una pregunta previa. Incorpora esa respuesta y avanza; no vuelvas a preguntar lo mismo.');
  }

  normalized.slice(-6).forEach((message, index) => {
    const speaker = message.role === 'assistant' ? 'LEXIA' : 'Usuario';
    lines.push(`${index + 1}. ${speaker}: ${truncateForRag(message.content, 320)}`);
  });

  return lines.join('\n');
}

function buildConversationMemoryState(messages = []) {
  const normalized = normalizeMemoryMessages(messages);
  const userFacts = normalized
    .filter(message => message.role === 'user')
    .map(message => message.content)
    .filter(content => !isConversationalFollowUp(content));
  const assistantReplies = normalized
    .filter(message => message.role === 'assistant')
    .map(message => message.content);
  const lastUserFact = userFacts[userFacts.length - 1] || '';

  return {
    userFacts,
    assistantReplies,
    lastUserFact,
    userFactText: userFacts.slice(-5).join(' '),
    hasUserFacts: userFacts.length > 0
  };
}

function buildMemorySearchQuery(userQuery, messages = []) {
  const normalized = normalizeMemoryMessages(messages);
  if (!normalized.length) return userQuery;

  const recentUserFacts = normalized
    .filter(message => message.role === 'user')
    .slice(-4)
    .map(message => message.content)
    .join(' ');

  return truncateForRag(
    [
      recentUserFacts ? `Hechos y tema previos: ${recentUserFacts}` : '',
      `Pregunta actual: ${userQuery}`
    ].filter(Boolean).join('\n'),
    1400
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
  if (extractNormativeReference(query)) return true;
  const terms = getQueryTerms(query);
  return isLegalQuery(query) || terms.length >= 2;
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

function buildSingleLegalQuestion(intent, reasoningProfile, query = '') {
  const topicId = intent?.topic?.id || '';
  const missing = Array.isArray(reasoningProfile?.missingInfo) ? reasoningProfile.missingInfo : [];
  const normalizedQuery = normalizeText(query);

  if (/\b(patrocinada|patrocinado|mi cliente|cliente|defendida|defendido)\b/.test(normalizedQuery)) {
    return '¿Tu patrocinada es víctima, investigada o ya fue condenada?';
  }

  if (topicId === 'despido') return '¿Te entregaron una carta de despido o solo te lo dijeron verbalmente?';
  if (topicId === 'beneficios_sociales') return '¿Sigues trabajando ahí o ya terminó la relación laboral?';
  if (topicId === 'alimentos') return '¿Ya existe una sentencia o acta de conciliación sobre alimentos?';
  if (topicId === 'servicios_educativos') return '¿Ese cobro aparece en el contrato, tarifario o comunicado oficial de la universidad?';
  if (topicId === 'propiedad_inmueble' || topicId === 'posesion') return '¿Tienes título, contrato o partida registral del inmueble?';
  if (topicId === 'extorsion') return '¿La amenaza sigue activa ahora o solo tienes los mensajes guardados?';
  if (topicId === 'violencia_pareja') return '¿La persona está a salvo ahora mismo o hay riesgo de una nueva agresión?';
  if (topicId === 'homicidio') return '¿Estás consultando como familiar de la víctima, investigado o abogado de una parte?';
  if (intent?.area?.id === 'derecho_penal') {
    if (/\b(denunciado|investigado|condenado|sentenciado|imputado|acusado)\b/.test(normalizedQuery)) {
      return '¿Estás del lado de la defensa o estás evaluando una acción contra esa persona?';
    }
    return '¿Buscas denunciar, defender a alguien o entender el estado del proceso?';
  }
  if (missing.some(item => normalizeText(item).includes('fecha'))) return '¿Cuándo ocurrió el hecho principal?';
  if (missing.some(item => normalizeText(item).includes('document'))) return '¿Qué documento o prueba tienes ahora mismo?';
  return '¿Qué resultado buscas concretamente con esta consulta?';
}

function isConversationContinuation(query, memoryMessages = []) {
  const normalized = normalizeText(query);
  const hasMemory = normalizeMemoryMessages(memoryMessages).length > 0;
  if (!hasMemory || !normalized) return false;

  const continuationPatterns = [
    /^(ya|ahora|entonces|pero|tambien|también|ademas|además)\b/,
    /\b(ya le|ya me|ya nos|le han|me han|nos han|le dijeron|me dijeron|nos dijeron)\b/,
    /\b(fecha|sentencia|audiencia|notificacion|notificación|citacion|citación|resolucion|resolución|plazo|miercoles|miércoles|lunes|martes|jueves|viernes)\b/
  ];
  const asksNewTopic = /\b(otro caso|otra consulta|cambiando de tema|ahora quiero saber sobre)\b/.test(normalized);
  return !asksNewTopic && continuationPatterns.some(pattern => pattern.test(normalized));
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

function getResultTitle(item) {
  return item?.titulo || item?.title || 'Referencia jurídica';
}

function getResultSource(item) {
  return item?.fuente || item?.source || 'Base jurídica local LEXIA';
}

function getResultText(item) {
  return String(item?.resumen || item?.excerpt || item?.contenido || item?.content || '').replace(/\s+/g, ' ').trim();
}

function getFullResultText(item) {
  return String(item?.contenido || item?.content || item?.resumen || item?.excerpt || '').replace(/\s+/g, ' ').trim();
}

function collectLegalCitationBadges(results = [], limit = 3) {
  const badges = [];
  const seen = new Set();
  const addBadge = value => {
    const clean = String(value || '').replace(/\s+/g, ' ').trim();
    let key = normalizeText(clean)
      .replace(/\bperuano\b/g, '')
      .replace(/\barticulo\b/g, 'art')
      .replace(/\s+/g, ' ')
      .trim();
    if (!clean || seen.has(key)) return;
    seen.add(key);
    badges.push(clean);
  };

  for (const item of Array.isArray(results) ? results : []) {
    const text = [
      getResultTitle(item),
      getResultSource(item),
      item?.materia,
      item?.matter,
      getFullResultText(item)
    ].filter(Boolean).join(' ');

    const normalized = normalizeText(text);
    if (normalized.includes('codigo penal') && normalized.includes('articulo 200')) {
      addBadge('Código Penal, art. 200');
    }
    if (normalized.includes('codigo penal') && normalized.includes('articulo 173')) {
      addBadge('Código Penal, art. 173');
    }
    if (normalized.includes('codigo penal') && (normalized.includes('articulo 176 a') || normalized.includes('articulo 176a'))) {
      addBadge('Código Penal, art. 176-A');
    }
    if (normalized.includes('constitucion politica') && normalized.includes('articulo 65')) {
      addBadge('Constitución Política del Perú, art. 65');
    }
    if (normalized.includes('ley 30403')) {
      addBadge('Ley 30403');
    }
    if (normalized.includes('codigo de los ninos y adolescentes') && normalized.includes('articulo 3 a')) {
      addBadge('Código de los Niños y Adolescentes, art. 3-A');
    }
    if (normalized.includes('ley 29571') || normalized.includes('codigo de proteccion y defensa del consumidor')) {
      addBadge('Ley 29571, Código de Protección y Defensa del Consumidor');
    }

    const genericMatches = text.matchAll(/\b(Decreto(?:\s+Legislativo|\s+Supremo)?\s+(?:N[.°º]\s*)?\d+[A-Z-]*|Ley\s+(?:N[.°º]\s*)?\d+[A-Z-]*|C[oó]digo\s+[A-ZÁÉÍÓÚÑa-záéíóúñ ]+,\s*art(?:\.|[ií]culo)?\s*\d+[A-Z]?)\b/g);
    for (const match of genericMatches) {
      addBadge(match[1]);
      if (badges.length >= limit) break;
    }
    if (badges.length >= limit) break;
  }

  return badges.slice(0, limit);
}

function isUsefulNormativeResult(item) {
  const text = normalizeText([
    getResultTitle(item),
    getResultSource(item),
    item?.module,
    item?.modulo,
    item?.matter,
    item?.materia,
    getResultText(item)
  ].join(' '));

  return !(
    text.includes('plataforma del estado peruano')
    || text.includes('que es gob pe')
    || text.includes('directorio nacional de redes sociales')
    || text.includes('lexia engine web discovery')
    || (text.includes('constitucion politica del peru') && text.includes('constitucion politica peru 2025 md'))
    || text.includes('legal faqs')
  );
}

function buildNormativeLegalAnswer(query, intent, results = []) {
  const lawReferenceAnswer = buildKnownLawReferenceAnswer(query, results);
  if (lawReferenceAnswer) return lawReferenceAnswer;

  const usefulResults = (Array.isArray(results) ? results : [])
    .filter(isUsefulNormativeResult)
    .sort((a, b) => {
      const aStructured = String(a?.id || '').startsWith('kb:') ? 1 : 0;
      const bStructured = String(b?.id || '').startsWith('kb:') ? 1 : 0;
      const aNormative = (a?.module || a?.modulo) === 'normativa' ? 1 : 0;
      const bNormative = (b?.module || b?.modulo) === 'normativa' ? 1 : 0;
      return (bStructured - aStructured)
        || (bNormative - aNormative)
        || Number(b.relevance || 0) - Number(a.relevance || 0);
    });
  const primary = usefulResults[0] || results[0];

  if (!primary) {
    return [
      'Claro, estás consultando una norma.',
      '',
      'No encontré una fuente específica en mi base local para explicarla con seguridad. Para no inventar, conviene verificar el texto vigente en **El Peruano, SPIJ o la entidad competente**.',
      '',
      'Si me escribes el nombre completo de la ley o pegas un fragmento, te digo en sencillo qué significa y para qué sirve.'
    ].join('\n');
  }

  const title = getResultTitle(primary);
  const source = getResultSource(primary);
  const text = getFullResultText(primary);
  const excerpt = truncateForRag(text, 520);
  const legalBadges = collectLegalCitationBadges(usefulResults.length ? usefulResults : results);
  const articleResult = usefulResults.find(item => (
    normalizeText(item?.module || item?.modulo).includes('legal article')
    && normalizeText(getResultTitle(item)).includes('articulo')
  ));
  const sourceSummary = buildSourceSummary(usefulResults.length ? usefulResults : results, intent, 3);
  const lines = [
    `Para esa parte, la referencia que mejor encaja es **${title}**.`,
    '',
    excerpt
      ? `Lo central es esto: **${excerpt}**`
      : 'Esa fuente aparece como la referencia más cercana para ubicar el fundamento legal aplicable.',
  ];

  if (articleResult) {
    lines.push('', `También aparece una referencia más concreta: **${getResultTitle(articleResult)}** (${getResultSource(articleResult)}).`);
  }

  if (legalBadges.length) {
    lines.push('', `El fundamento normativo visible sería ${legalBadges.map(item => `[${item}]`).join(' ')}.`);
  }

  lines.push(
    '',
    'Para usarlo bien en tu caso, hay que mirar el acto concreto, la notificación, el plazo y si realmente se permitió presentar descargos, pruebas o recurso.',
    '',
    `Fuente principal: **${source}**.`
  );

  if (sourceSummary && !sourceSummary.includes('No encontré una fuente específica')) {
    lines.push('', sourceSummary);
  }

  return lines.join('\n');
}

function selectBestLegalResult(results = [], intent = null) {
  const list = Array.isArray(results) ? results : [];
  if (!list.length) return null;
  const topicTerms = getQueryTerms(`${intent?.topic?.label || ''} ${intent?.topic?.id || ''}`).filter(term => term.length >= 4);

  return [...list].sort((a, b) => {
    const aText = normalizeText([getResultTitle(a), getResultSource(a), a?.materia, a?.matter, getFullResultText(a)].join(' '));
    const bText = normalizeText([getResultTitle(b), getResultSource(b), b?.materia, b?.matter, getFullResultText(b)].join(' '));
    const aCitations = collectLegalCitationBadges([a]).length;
    const bCitations = collectLegalCitationBadges([b]).length;
    const aTopic = topicTerms.filter(term => aText.includes(term)).length;
    const bTopic = topicTerms.filter(term => bText.includes(term)).length;
    const aNorm = normalizeText(a?.modulo || a?.module).includes('normativa') ? 1 : 0;
    const bNorm = normalizeText(b?.modulo || b?.module).includes('normativa') ? 1 : 0;
    return (bTopic - aTopic)
      || (bCitations - aCitations)
      || (bNorm - aNorm)
      || Number(b.relevance || 0) - Number(a.relevance || 0);
  })[0];
}

function detectLegalCaseScopesFromResult(item) {
  return detectLegalCaseScopes([
    getResultTitle(item),
    getResultSource(item),
    item?.materia,
    item?.matter,
    item?.resumen,
    item?.excerpt
  ].filter(Boolean).join(' '));
}

function resultLooksLikeArea(item, areaId = '') {
  const text = normalizeText([
    getResultTitle(item),
    getResultSource(item),
    item?.materia,
    item?.matter,
    item?.resumen,
    item?.excerpt
  ].filter(Boolean).join(' '));
  if (areaId === 'derecho_penal') return /\b(derecho penal|codigo penal|código penal|delito|denuncia penal|fiscalia|fiscalía|ministerio publico|ministerio público|pena|prision|prisión)\b/.test(text);
  if (areaId === 'derecho_laboral') return /\b(derecho laboral|trabajador|empleador|despido|beneficios sociales|cts|gratificacion|vacaciones|remuneracion)\b/.test(text);
  if (areaId === 'derecho_consumidor') return /\b(consumidor|indecopi|proveedor|servicio educativo|universidad|matricula|pension|libro de reclamaciones)\b/.test(text);
  if (areaId === 'derecho_civil') return /\b(derecho civil|contrato|compraventa|propiedad|posesion|inmueble|obligacion|arrendamiento)\b/.test(text);
  if (areaId === 'derecho_familia') return /\b(derecho de familia|alimentos|divorcio|tenencia|custodia|visitas|patria potestad)\b/.test(text);
  if (areaId === 'derecho_constitucional') return /\b(constitucion|constitución|constitucional|amparo|habeas corpus|habeas data|derecho fundamental|debido proceso)\b/.test(text);
  return false;
}

function filterResultsForCurrentIntent(query, intent, results = []) {
  const currentScopes = detectLegalCaseScopes([
    query,
    intent?.topic?.label,
    intent?.topic?.id,
    intent?.area?.label
  ].filter(Boolean).join(' '));
  let filtered = Array.isArray(results) ? results : [];
  if (currentScopes.length) {
    filtered = filtered.filter(item => {
    const resultScopes = detectLegalCaseScopesFromResult(item);
    if (!resultScopes.length) return true;
    return areLegalCaseScopesCompatible(currentScopes, resultScopes);
  });
  }

  const areaId = intent?.area?.confidence === 'alta' ? intent.area.id : '';
  if (areaId) {
    const areaFiltered = filtered.filter(item => resultLooksLikeArea(item, areaId) || !legalAreas.some(area => area.id !== areaId && resultLooksLikeArea(item, area.id)));
    if (areaFiltered.length) filtered = areaFiltered;
  }

  return filtered;
}

const knownConstitutionArticles = {
  '139': {
    label: 'Constitución Política del Perú, art. 139',
    title: 'Principios y derechos de la función jurisdiccional',
    source: 'Constitución Política del Perú, artículo 139, base normativa local de LEXIA',
    clauses: {
      '1': 'Este inciso significa que, como regla general, la justicia ordinaria la ejerce el Poder Judicial de forma única y exclusiva. No se pueden crear tribunales especiales o jurisdicciones paralelas para un caso concreto, salvo las excepciones reconocidas por la propia Constitución: la jurisdicción militar y la arbitral.',
      '2': 'Este inciso protege la independencia judicial. Ninguna autoridad puede meterse en un proceso pendiente, anular resoluciones firmes, cortar trámites, modificar sentencias ni retrasar su ejecución.',
      '3': 'Este inciso reconoce el debido proceso y la tutela jurisdiccional: toda persona debe ser juzgada por el juez competente, con reglas previas, defensa y un proceso válido.',
      '4': 'Este inciso establece que los procesos judiciales son públicos como regla, salvo que la ley disponga reserva por una razón válida.',
      '5': 'Este inciso exige que las resoluciones judiciales estén motivadas por escrito, explicando la ley aplicada y los hechos que sostienen la decisión.',
      '6': 'Este inciso reconoce la pluralidad de instancia: normalmente una decisión judicial puede ser revisada por un órgano superior.',
      '14': 'Este inciso protege el derecho de defensa en todo estado del proceso: la persona debe poder conocer la imputación o razón de la actuación y contar con defensa.'
    },
    text: [
      'Artículo 139.- Son principios y derechos de la función jurisdiccional:',
      '1. La unidad y exclusividad de la función jurisdiccional. No existe ni puede establecerse jurisdicción alguna independiente, con excepción de la militar y la arbitral. No hay proceso judicial por comisión o delegación.',
      '2. La independencia en el ejercicio de la función jurisdiccional. Ninguna autoridad puede avocarse a causas pendientes ante el órgano jurisdiccional ni interferir en el ejercicio de sus funciones. Tampoco puede dejar sin efecto resoluciones que han pasado en autoridad de cosa juzgada, ni cortar procedimientos en trámite, ni modificar sentencias ni retardar su ejecución.',
      '3. La observancia del debido proceso y la tutela jurisdiccional.',
      '4. La publicidad en los procesos, salvo disposición contraria de la ley.',
      '5. La motivación escrita de las resoluciones judiciales en todas las instancias, excepto los decretos de mero trámite, con mención expresa de la ley aplicable y de los fundamentos de hecho en que se sustentan.',
      '6. La pluralidad de la instancia.',
      '7. La indemnización, en la forma que determine la ley, por los errores judiciales en los procesos penales y por las detenciones arbitrarias, sin perjuicio de la responsabilidad a que hubiere lugar.',
      '8. El principio de no dejar de administrar justicia por vacío o deficiencia de la ley.',
      '9. El principio de inaplicabilidad por analogía de la ley penal y de las normas que restrinjan derechos.',
      '10. El principio de no ser penado sin proceso judicial.',
      '11. La aplicación de la ley más favorable al procesado en caso de duda o de conflicto entre leyes penales.',
      '12. El principio de no ser condenado en ausencia.',
      '13. La prohibición de revivir procesos fenecidos con resolución ejecutoriada. La amnistía, el indulto, el sobreseimiento definitivo y la prescripción producen los efectos de cosa juzgada.',
      '14. El principio de no ser privado del derecho de defensa en ningún estado del proceso.',
      '15. El principio de que toda persona debe ser informada, inmediatamente y por escrito, de las causas o razones de su detención.',
      '16. El principio de la gratuidad de la administración de justicia y de la defensa gratuita para las personas de escasos recursos; y, para todos, en los casos que la ley señala.',
      '17. La participación popular en el nombramiento y en la revocación de magistrados, conforme a ley.',
      '18. La obligación del Poder Ejecutivo de prestar la colaboración que en los procesos le sea requerida.',
      '19. La prohibición de ejercer función judicial por quien no ha sido nombrado en la forma prevista por la Constitución o la ley.',
      '20. El principio del derecho de toda persona de formular análisis y críticas de las resoluciones y sentencias judiciales, con las limitaciones de ley.',
      '21. El derecho de los reclusos y sentenciados de ocupar establecimientos adecuados.',
      '22. El principio de que el régimen penitenciario tiene por objeto la reeducación, rehabilitación y reincorporación del penado a la sociedad.'
    ].join('\n')
  }
};

function extractRequestedArticleNumber(query = '') {
  const match = normalizeText(query).match(/\bart(?:iculo|ículo|\.?)?\s*(\d+[a-z]?)\b/);
  return match?.[1] || '';
}

function extractRequestedClauseNumber(query = '') {
  const match = normalizeText(query).match(/\b(?:inciso|numeral|apartado)\s*(\d+[a-z]?)\b/);
  return match?.[1] || '';
}

function extractArticleNumberFromMemory(memoryMessages = []) {
  const recentMemory = normalizeMemoryMessages(memoryMessages).slice(-8).reverse();
  for (const message of recentMemory) {
    const text = String(message.content || '');
    const citationMatch = text.match(/\bart\.?\s*(\d+[a-z]?)/i);
    if (citationMatch?.[1]) return citationMatch[1].toLowerCase();
    const articleMatch = normalizeText(text).match(/\bart(?:iculo|ículo|\.?)?\s*(\d+[a-z]?)\b/);
    if (articleMatch?.[1]) return articleMatch[1];
  }
  return '';
}

function extractClauseTextFromArticle(articleText = '', clauseNumber = '') {
  if (!articleText || !clauseNumber) return '';
  const escaped = String(clauseNumber).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?:^|\\n)${escaped}\\.\\s*([\\s\\S]*?)(?=\\n\\d+[a-z]?\\.\\s|$)`, 'i');
  const match = String(articleText).match(pattern);
  return match?.[1]?.replace(/\s+/g, ' ').trim() || '';
}

function detectNormativeSourceInText(text = '') {
  const normalized = normalizeText(text);
  if (!normalized) return null;

  const numberedPatterns = [
    { type: 'ley', label: 'Ley', pattern: /\bley\s*(?:n|no|nro|numero|número|n\.|n°|º)?\s*(\d{1,6}[a-z-]*)\b/ },
    { type: 'decreto_legislativo', label: 'Decreto Legislativo', pattern: /\bdecreto legislativo\s*(?:n|no|nro|numero|número|n\.|n°|º)?\s*(\d{1,6}[a-z-]*)\b/ },
    { type: 'decreto_supremo', label: 'Decreto Supremo', pattern: /\bdecreto supremo\s*(?:n|no|nro|numero|número|n\.|n°|º)?\s*(\d{1,6}[a-z-]*)\b/ },
    { type: 'decreto_urgencia', label: 'Decreto de Urgencia', pattern: /\bdecreto de urgencia\s*(?:n|no|nro|numero|número|n\.|n°|º)?\s*(\d{1,6}[a-z-]*)\b/ },
    { type: 'decreto_ley', label: 'Decreto Ley', pattern: /\bdecreto ley\s*(?:n|no|nro|numero|número|n\.|n°|º)?\s*(\d{1,6}[a-z-]*)\b/ },
    { type: 'resolucion', label: 'Resolución', pattern: /\bresolucion\s*(?:n|no|nro|numero|número|n\.|n°|º)?\s*(\d{1,8}[a-z-]*)\b/ },
    { type: 'ordenanza', label: 'Ordenanza', pattern: /\bordenanza\s*(?:n|no|nro|numero|número|n\.|n°|º)?\s*(\d{1,8}[a-z-]*)\b/ }
  ];
  for (const item of numberedPatterns) {
    const match = normalized.match(item.pattern);
    if (match?.[1]) {
      return {
        id: `${item.type}_${match[1]}`,
        type: item.type,
        label: `${item.label} N.° ${match[1]}`,
        number: match[1]
      };
    }
  }

  const namedPatterns = [
    { id: 'constitucion', type: 'constitucion', label: 'Constitución Política del Perú', pattern: /\b(constitucion|constitución|constitucional)\b/ },
    { id: 'codigo_penal', type: 'codigo', label: 'Código Penal', pattern: /\b(codigo penal|código penal)\b/ },
    { id: 'codigo_civil', type: 'codigo', label: 'Código Civil', pattern: /\b(codigo civil|código civil)\b/ },
    { id: 'codigo_procesal_civil', type: 'codigo', label: 'Código Procesal Civil', pattern: /\b(codigo procesal civil|código procesal civil|procesal civil|cpc)\b/ },
    { id: 'codigo_procesal_penal', type: 'codigo', label: 'Código Procesal Penal', pattern: /\b(codigo procesal penal|código procesal penal|procesal penal|cpp)\b/ },
    { id: 'codigo_ninos_adolescentes', type: 'codigo', label: 'Código de los Niños y Adolescentes', pattern: /\b(codigo de los ninos y adolescentes|código de los niños y adolescentes|ninos y adolescentes|niños y adolescentes)\b/ },
    { id: 'codigo_tributario', type: 'codigo', label: 'Código Tributario', pattern: /\b(codigo tributario|código tributario)\b/ },
    { id: 'codigo_consumidor', type: 'codigo', label: 'Código de Protección y Defensa del Consumidor', pattern: /\b(codigo de proteccion y defensa del consumidor|código de protección y defensa del consumidor|codigo del consumidor|código del consumidor)\b/ },
    { id: 'convencion_americana', type: 'convencion', label: 'Convención Americana sobre Derechos Humanos', pattern: /\b(convencion americana|convención americana|pacto de san jose|pacto de san josé|cadh)\b/ },
    { id: 'convencion_nino', type: 'convencion', label: 'Convención sobre los Derechos del Niño', pattern: /\b(convencion sobre los derechos del nino|convención sobre los derechos del niño|derechos del nino|derechos del niño)\b/ },
    { id: 'tratado', type: 'tratado', label: 'tratado o convención mencionado en la conversación', pattern: /\b(tratado|convencion|convención|pacto|convenio internacional)\b/ },
    { id: 'reglamento', type: 'reglamento', label: 'reglamento mencionado en la conversación', pattern: /\b(reglamento|reglamento de la ley)\b/ },
    { id: 'decreto', type: 'decreto', label: 'decreto mencionado en la conversación', pattern: /\b(decreto legislativo|decreto supremo|decreto de urgencia|decreto ley|decreto)\b/ },
    { id: 'ley', type: 'ley', label: 'ley mencionada en la conversación', pattern: /\bley\b/ }
  ];
  return namedPatterns.find(item => item.pattern.test(normalized)) || null;
}

function detectNormativeSourceContext(query = '', memoryMessages = []) {
  const querySource = detectNormativeSourceInText(query);
  if (querySource) return { ...querySource, origin: 'query' };

  const recentMemory = normalizeMemoryMessages(memoryMessages).slice(-6).reverse();
  for (const message of recentMemory) {
    const source = detectNormativeSourceInText(message.content);
    if (source) return { ...source, origin: 'memory' };
  }
  return null;
}

function detectNormativeSourceFromIntent(intent = null) {
  const text = [
    intent?.area?.label,
    intent?.topic?.label,
    ...(Array.isArray(intent?.concepts) ? intent.concepts : [])
  ].filter(Boolean).join(' ');
  const source = detectNormativeSourceInText(text);
  return source ? { ...source, origin: 'intent' } : null;
}

function articleSourcePhrase(articleNumber, sourceContext) {
  const label = sourceContext?.label || 'norma indicada';
  const feminineTypes = new Set(['ley', 'resolucion', 'ordenanza', 'constitucion', 'convencion']);
  const connector = feminineTypes.has(sourceContext?.type) || /^(ley|resoluci[oó]n|ordenanza|constituci[oó]n|convenci[oó]n)\b/i.test(label)
    ? 'de la'
    : 'del';
  return `artículo ${articleNumber} ${connector} ${label}`;
}

function clauseSourcePhrase(clauseNumber, articleNumber, sourceContext) {
  return `inciso ${clauseNumber} del ${articleSourcePhrase(articleNumber, sourceContext)}`;
}

function buildClauseExplanationAnswer(query, intent, results = [], memoryMessages = []) {
  const clauseNumber = extractRequestedClauseNumber(query);
  if (!clauseNumber) return '';

  const sourceContext = detectNormativeSourceContext(query, memoryMessages) || detectNormativeSourceFromIntent(intent);
  const articleNumber = extractRequestedArticleNumber(query) || extractArticleNumberFromMemory(memoryMessages);

  if (!sourceContext) {
    return [
      `¿De qué norma y artículo quieres que explique el **inciso ${clauseNumber}**?`,
      '',
      'Por ejemplo: Constitución, Código Penal, Código Civil, una ley o un decreto. Con eso te explico el inciso exacto sin inventar.'
    ].join('\n');
  }

  if (!articleNumber) {
    return [
      `Por el hilo, entiendo que hablas del **${sourceContext.label}**, pero necesito saber de qué artículo es el **inciso ${clauseNumber}**.`,
      '',
      'Dime el artículo y te explico ese inciso en sencillo.'
    ].join('\n');
  }

  if (sourceContext.id === 'constitucion' && knownConstitutionArticles[articleNumber]) {
    const article = knownConstitutionArticles[articleNumber];
    const clauseText = extractClauseTextFromArticle(article.text, clauseNumber);
    const explanation = article.clauses?.[clauseNumber];
    if (!clauseText) {
      return [
        `Por el hilo, asumo que te refieres al **inciso ${clauseNumber} del artículo ${articleNumber} de la Constitución Política del Perú**.`,
        '',
        'No encuentro ese inciso dentro del texto verificado que tengo para ese artículo. Confírmame el número del inciso y lo reviso de nuevo.'
      ].join('\n');
    }
    return [
      `Por el hilo, asumo que te refieres al **inciso ${clauseNumber} del [${article.label}]**.`,
      '',
      `El inciso dice: **${clauseText}**`,
      '',
      explanation || 'En simple, ese inciso fija una regla constitucional que debe leerse dentro del artículo completo y aplicarse al caso concreto.',
      '',
      `Fuente usada por LEXIA: **${article.source}**.`
    ].join('\n');
  }

  const primary = selectBestLegalResult(results, intent);
  const primaryText = primary ? getFullResultText(primary) : '';
  if (!primaryText) {
    return [
      `Por el hilo, entiendo que preguntas por el **${clauseSourcePhrase(clauseNumber, articleNumber, sourceContext)}**.`,
      '',
      'No tengo el texto exacto de ese inciso en una fuente disponible ahora mismo, y no voy a inventarlo. Pásame el texto o la norma y lo explico.'
    ].join('\n');
  }

  const articlePattern = new RegExp(`art[ií]culo\\s+${articleNumber}\\b[\\s\\S]{0,1800}`, 'i');
  const articleMatch = primaryText.match(articlePattern);
  const clauseText = articleMatch ? extractClauseTextFromArticle(articleMatch[0], clauseNumber) : '';
  if (!clauseText) {
    return [
      `Por el hilo, entiendo que preguntas por el **${clauseSourcePhrase(clauseNumber, articleNumber, sourceContext)}**.`,
      '',
      'No encontré ese inciso en el texto recuperado. Confírmame la norma exacta o pega el artículo para explicarlo con precisión.'
    ].join('\n');
  }

  return [
    `Por el hilo, asumo que te refieres al **${clauseSourcePhrase(clauseNumber, articleNumber, sourceContext)}**.`,
    '',
    `El inciso dice: **${clauseText}**`,
    '',
    'En simple: ese inciso establece una regla específica dentro del artículo. Para aplicarlo bien hay que leerlo junto con el encabezado del artículo y los demás incisos relacionados.',
    '',
    `Fuente usada por LEXIA: **${getResultTitle(primary)}** | ${getResultSource(primary)}.`
  ].join('\n');
}

function buildExactArticleTextAnswer(query, intent, results = [], memoryMessages = []) {
  const articleNumber = extractRequestedArticleNumber(query);
  if (!articleNumber) return '';
  const sourceContext = detectNormativeSourceContext(query, memoryMessages);

  if (!sourceContext) {
    return [
      `¿A qué norma te refieres con el **artículo ${articleNumber}**?`,
      '',
      'Puede ser de la Constitución, Código Penal, Código Civil, Código Procesal, una ley, decreto u otra norma. Dime el cuerpo normativo y te muestro cómo está escrito.'
    ].join('\n');
  }

  if (sourceContext.id === 'constitucion' && knownConstitutionArticles[articleNumber]) {
    const article = knownConstitutionArticles[articleNumber];
    const contextLine = sourceContext.origin === 'memory'
      ? `Por el hilo, asumo que te refieres al **artículo ${articleNumber} de la Constitución Política del Perú**.`
      : `Te refieres al **artículo ${articleNumber} de la Constitución Política del Perú**.`;
    return [
      contextLine,
      '',
      `Esto es lo que dice el **[${article.label}]**:`,
      '',
      article.text,
      '',
      `Fuente usada por LEXIA: **${article.source}**.`
    ].join('\n');
  }

  const primary = selectBestLegalResult(results, intent);
  const primaryText = primary ? getFullResultText(primary) : '';
  if (!primary || !primaryText) {
    return [
      sourceContext.origin === 'query'
        ? `Entiendo: estás hablando del **${articleSourcePhrase(articleNumber, sourceContext)}**, no de la Constitución.`
        : `Por el hilo, entiendo que preguntas por el **${articleSourcePhrase(articleNumber, sourceContext)}**.`,
      '',
      'No encuentro el texto exacto de ese artículo en la fuente normativa disponible ahora mismo, y no voy a mezclarlo con otro código o con la Constitución.',
      '',
      'Pásame el texto o confirma la fuente del código vigente, y lo explico sobre esa base.'
    ].join('\n');
  }

  const pattern = new RegExp(`art[ií]culo\\s+${articleNumber}\\b[\\s\\S]{0,1200}`, 'i');
  const match = primaryText.match(pattern);
  if (!match) {
    const assumedLine = sourceContext.origin === 'memory'
      ? `Por el hilo, entiendo que preguntas por el **${articleSourcePhrase(articleNumber, sourceContext)}**.`
      : `Entiendo que preguntas por el **${articleSourcePhrase(articleNumber, sourceContext)}**.`;
    return [
      assumedLine,
      '',
      'No encuentro el texto exacto de ese artículo en la fuente normativa disponible ahora mismo, y no voy a mezclarlo con otro código o con la Constitución.',
      '',
      'Confírmame el cuerpo normativo exacto o pásame la norma/documento, y te transcribo cómo está escrito.'
    ].join('\n');
  }

  const contextLine = sourceContext.origin === 'memory'
    ? `Por el hilo, asumo que te refieres al **${articleSourcePhrase(articleNumber, sourceContext)}**.`
    : `Te refieres al **${articleSourcePhrase(articleNumber, sourceContext)}**.`;
  return [
    contextLine,
    '',
    'Lo ubico en la fuente disponible y te lo dejo para lectura:',
    '',
    truncateForRag(match[0].replace(/\s+/g, ' ').trim(), 1000),
    '',
    `Fuente usada por LEXIA: **${getResultTitle(primary)}** | ${getResultSource(primary)}.`
  ].join('\n');
}

function buildSourceOrNormAnswer(query, intent, results = [], modeId = 'source_request') {
  const lawReferenceAnswer = buildKnownLawReferenceAnswer(query, results);
  if (lawReferenceAnswer) return lawReferenceAnswer;

  const primary = selectBestLegalResult(results, intent);
  let legalBadges = collectLegalCitationBadges(primary ? [primary] : [], 4);
  if (!legalBadges.length) legalBadges = collectLegalCitationBadges(results, 4);
  const topicLabel = intent?.topic?.label && intent.topic.label !== 'Tema no determinado'
    ? intent.topic.label
    : 'ese punto';

  if (!primary || !legalBadges.length) {
    return [
      modeId === 'norm_request'
        ? `Para darte artículos sobre **${topicLabel}**, necesito una fuente normativa exacta.`
        : `Tienes razón en pedir la base. En este momento no tengo un artículo exacto verificado en la base local para **${topicLabel}**.`,
      '',
      'No voy a inventar el número de artículo. Conviene verificarlo en El Peruano, SPIJ o la fuente oficial correspondiente, o cargar esa norma al cerebro de LEXIA.',
      '',
      '¿Quieres que lo tratemos como búsqueda de norma exacta y me indiques si tienes el código, ley o documento a revisar?'
    ].join('\n');
  }

  const fullText = getFullResultText(primary);
  const excerpt = truncateForRag(fullText, modeId === 'norm_request' ? 520 : 360);
  const lines = [
    modeId === 'norm_request'
      ? `La base legal verificada que encuentro para **${topicLabel}** es ${legalBadges.map(item => `[${item}]`).join(' ')}.`
      : `Lo saco de esta base legal verificada: ${legalBadges.map(item => `[${item}]`).join(' ')}.`,
    ''
  ];

  if (excerpt) {
    lines.push(`En simple: **${excerpt}**`);
    lines.push('');
  }

  lines.push(`Fuente usada por LEXIA: **${getResultTitle(primary)}** | ${getResultSource(primary)}.`);
  return lines.join('\n');
}

function buildConfusionAnswer(query, intent, results = [], reasoningProfile = null, memoryMessages = []) {
  const memoryState = buildConversationMemoryState(memoryMessages);
  const lastAssistantReply = memoryState.assistantReplies[memoryState.assistantReplies.length - 1] || '';
  const primary = selectBestLegalResult(results, intent);
  const rules = collectIntelligenceItems(primary ? [primary] : results, 'reglas_practicas', 1);
  const topicId = intent?.topic?.id || '';
  const topicLabel = intent?.topic?.label || 'este punto';
  const lastReplyNormative = /\b(art[ií]culo|inciso|numeral|ley|c[oó]digo|constituci[oó]n|decreto|ordenanza)\b/i.test(lastAssistantReply);
  const lines = ['Claro. Lo digo más simple.'];

  if (topicId === 'extorsion') {
    lines.push('');
    lines.push('Para hablar de **extorsión**, no basta que exista una deuda o una discusión. Tiene que haber **amenaza, violencia o presión indebida** para obligar a alguien a entregar dinero, hacer algo o dejar de hacer algo.');
  } else if (topicId === 'abuso_sexual_menor') {
    lines.push('');
    lines.push('En simple: si la víctima es menor de edad, primero hay que **protegerla** y luego precisar qué pasó: edad, fecha, quién intervino y qué prueba existe.');
  } else if (lastReplyNormative) {
    lines.push('');
    lines.push('Si te mostré una norma o un artículo, la idea es esta: puedo leer el texto, pero después hay que traducirlo a palabras simples para saber qué exige, qué permite o qué prohíbe.');
  } else {
    lines.push('');
    lines.push(`Sobre **${topicLabel}**, la idea es: ${rules[0] || reasoningProfile?.legalIssue || 'primero entendemos el hecho concreto y luego vemos qué norma o camino legal corresponde'}.`);
  }

  lines.push('');
  lines.push('Dicho en una frase: **primero aclaramos qué pasó; luego vemos qué ley encaja; después decidimos qué hacer**.');
  lines.push('');
  lines.push('Dime cuál prefieres: te lo explico como resumen, palabra por palabra, o aplicado a tu caso.');
  return lines.join('\n');
}

function extractDefinitionTerm(query) {
  const normalized = normalizeText(query);
  const patterns = [
    /\b(?:que es|qué es|que significa|qué significa|que quiere decir|qué quiere decir|a que se refiere|a qué se refiere|defineme|defíneme|explicame que es|explícame qué es)\s+(.+)$/i
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(normalized);
    if (match?.[1]) {
      return match[1]
        .replace(/\b(el|la|los|las|un|una|unos|unas)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
  }
  return normalized;
}

function buildDefinitionAnswer(query, intent, results = [], reasoningProfile = null) {
  const term = extractDefinitionTerm(query);
  const primary = selectBestLegalResult(results, intent);
  const legalBadges = collectLegalCitationBadges(primary ? [primary] : results, 2);
  const normalizedTerm = normalizeText(term);
  const definitions = [
    {
      match: ['revictimizacion', 'revictimización'],
      answer: 'Revictimización significa **hacer que la víctima vuelva a sufrir por la forma en que se maneja el caso**. Por ejemplo: hacerle repetir muchas veces lo ocurrido, exponerla, culparla, tratarla con dureza o no protegerla del agresor.'
    },
    {
      match: ['prueba digital', 'evidencia digital'],
      answer: 'Prueba digital es **todo rastro electrónico que puede ayudar a demostrar lo ocurrido**: capturas, audios, videos, mensajes, correos, números telefónicos, perfiles, cuentas o registros.'
    },
    {
      match: ['medida de proteccion', 'medidas de proteccion', 'medida de protección', 'medidas de protección'],
      answer: 'Una medida de protección es **una orden para reducir el riesgo inmediato**. Puede servir para alejar al agresor, impedir contacto o activar apoyo de autoridades según el caso.'
    },
    {
      match: ['denuncia'],
      answer: 'Una denuncia es **poner en conocimiento de la autoridad hechos que podrían ser delito**. No basta decir el nombre del delito; hay que contar qué pasó, cuándo, dónde, quién participó y qué pruebas existen.'
    },
    {
      match: ['prescripcion', 'prescripción'],
      answer: 'La prescripción es **el vencimiento del tiempo legal para perseguir o reclamar algo**. Depende del tipo de caso, la fecha de los hechos y las reglas aplicables.'
    }
  ];
  const found = definitions.find(item => item.match.some(pattern => normalizedTerm.includes(normalizeText(pattern))));
  const lines = [];

  if (found) {
    lines.push(found.answer);
  } else {
    const rules = collectIntelligenceItems(primary ? [primary] : results, 'reglas_practicas', 1);
    lines.push(`En simple, **${term || 'ese concepto'}** debe entenderse dentro del caso como una idea práctica, no como una frase aislada.`);
    if (rules.length) lines.push(`La idea relacionada es: **${rules[0]}**.`);
  }

  if (legalBadges.length) {
    lines.push('');
    lines.push(`Base relacionada: ${legalBadges.map(item => `[${item}]`).join(' ')}.`);
  }

  lines.push('');
  lines.push('Para tu caso, lo importante es no quedarse en la palabra, sino ver **qué hecho concreto prueba ese riesgo o concepto**.');
  return lines.join('\n');
}

function findKnownLawInText(text = '') {
  const reference = extractNormativeReference(text);
  return getKnownPeruvianLaw(reference);
}

function findKnownLawForCorrection(query = '', intent = null, memoryMessages = []) {
  const directLaw = findKnownLawInText(query);
  if (directLaw) return directLaw;

  const intentLawNumber = intent?.interpretation?.knownLaw?.number
    || String(intent?.topic?.id || '').match(/\bley_(\d{3,6})\b/)?.[1];
  if (intentLawNumber && knownPeruvianLawsByNumber[intentLawNumber]) {
    return knownPeruvianLawsByNumber[intentLawNumber];
  }

  const memoryText = normalizeMemoryMessages(memoryMessages)
    .slice(-8)
    .map(message => message.content)
    .join(' ');
  return findKnownLawInText(memoryText);
}

function normalizeDateClaim(text = '') {
  const months = {
    enero: '01',
    febrero: '02',
    marzo: '03',
    abril: '04',
    mayo: '05',
    junio: '06',
    julio: '07',
    agosto: '08',
    septiembre: '09',
    setiembre: '09',
    octubre: '10',
    noviembre: '11',
    diciembre: '12'
  };
  const normalized = normalizeText(text);
  const numeric = normalized.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/);
  if (numeric) {
    const year = numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3];
    return `${year}-${numeric[2].padStart(2, '0')}-${numeric[1].padStart(2, '0')}`;
  }
  const monthPattern = Object.keys(months).join('|');
  const longDate = normalized.match(new RegExp(`\\b(\\d{1,2})\\s*(?:de\\s*)?(${monthPattern})\\s*(?:de|del)?\\s*(\\d{4})\\b`));
  if (longDate) {
    return `${longDate[3]}-${months[longDate[2]]}-${longDate[1].padStart(2, '0')}`;
  }
  return '';
}

function inferClaimedDateKind(query = '') {
  const normalized = normalizeText(query);
  if (/\b(publicada|publicacion|publicación)\b/.test(normalized)) return 'publicationDate';
  if (/\b(vigente|vigencia|entro en vigencia|entró en vigencia|aplicarse|aplica)\b/.test(normalized)) return 'effectiveDate';
  if (/\b(promulgada|promulgacion|promulgación)\b/.test(normalized)) return 'promulgationDate';
  if (/\b(emitida|aprobada)\b/.test(normalized)) return 'promulgationDate';
  return '';
}

function describeLawDateKind(kind) {
  return {
    promulgationDate: 'promulgación',
    publicationDate: 'publicación',
    effectiveDate: 'vigencia'
  }[kind] || 'fecha';
}

function buildKnownLawDateCorrectionAnswer(query = '', law = null) {
  if (!law) return '';
  const claimedDate = normalizeDateClaim(query);
  const claimedKind = inferClaimedDateKind(query);
  if (!claimedDate || !claimedKind || !law[claimedKind]) return '';

  const knownDates = [
    ['promulgationDate', law.promulgationDate],
    ['publicationDate', law.publicationDate],
    ['effectiveDate', law.effectiveDate]
  ].filter(([, value]) => value);
  const expectedDate = normalizeDateClaim(law[claimedKind]);
  const matchingDifferentKind = knownDates.find(([kind, value]) => kind !== claimedKind && normalizeDateClaim(value) === claimedDate);
  const legalBadges = `[${law.label}]`;
  const source = law.officialSource || law.verification || 'fuente oficial normativa';

  if (expectedDate === claimedDate) {
    return [
      'Tienes razón: esa corrección coincide con la fuente que tengo verificada.',
      '',
      `Para la **${law.title}** ${legalBadges}, la fecha de **${describeLawDateKind(claimedKind)}** es **${law[claimedKind]}**.`,
      '',
      `Fuente usada por LEXIA: **${source}**.`
    ].join('\n');
  }

  const lines = [
    'Entiendo la corrección, pero al verificarla hay una diferencia importante.',
    '',
    `Según la fuente que usa LEXIA, la **${law.title}** ${legalBadges} tiene como fecha de **${describeLawDateKind(claimedKind)}** el **${law[claimedKind]}**.`
  ];

  if (matchingDifferentKind) {
    lines.push(
      '',
      `El **${law[matchingDifferentKind[0]]}** sí corresponde a la **${describeLawDateKind(matchingDifferentKind[0])}**, no a la **${describeLawDateKind(claimedKind)}**.`
    );
  }

  lines.push(
    '',
    `Fuente usada por LEXIA: **${source}**.`,
    '',
    'Por eso, dicho con cuidado: tu dato apunta a una fecha real, pero no corresponde al concepto indicado. Si quieres, seguimos usando la distinción correcta entre promulgación, publicación y vigencia.'
  );
  return lines.join('\n');
}

function buildCorrectionAnswer(query, intent, results = [], memoryMessages = []) {
  const normalizedQuery = normalizeText(query);
  const correctionFactMatch = String(query || '').match(/\b(?:en internet dice que|seg[uú]n internet|la p[aá]gina dice que|la fuente dice que|he visto que)?\s*(?:fue\s+)?(?:promulgada|publicada|emitida|aprobada)\s+(?:el\s+)?(.{6,80})/i);
  if (correctionFactMatch || /\b(en internet dice|segun internet|según internet|la pagina dice|la página dice|la fuente dice|fue promulgada|promulgada el|publicada el)\b/.test(normalizedQuery)) {
    const lawDateCorrection = buildKnownLawDateCorrectionAnswer(
      query,
      findKnownLawForCorrection(query, intent, memoryMessages)
    );
    if (lawDateCorrection) return lawDateCorrection;

    const correctedFact = correctionFactMatch?.[1]
      ? `que fue ${String(query).toLowerCase().includes('publicada') ? 'publicada' : 'promulgada'} el ${correctionFactMatch[1].replace(/[.。]+$/, '').trim()}`
      : String(query || '').replace(/\s+/g, ' ').trim();
    const legalBadges = collectLegalCitationBadges(results, 2);
    const sourceSummary = buildSourceSummary(results, intent, 2);
    const lines = [
      'Entiendo la corrección. No debo tomar ese dato como cierto solo porque aparece en internet o porque me lo indicas; primero tengo que verificarlo.',
      '',
      correctedFact
        ? `Tomo tu precisión como dato a revisar: **${correctedFact}**.`
        : 'Tomo tu precisión como dato a revisar.',
      '',
      'Cuando un dato es de fecha, promulgación o publicación de una ley, lo correcto es contrastarlo con una fuente oficial, no asumirlo por memoria.'
    ];

    if (legalBadges.length) {
      lines.push('', `La referencia normativa que debo revisar es ${legalBadges.map(item => `[${item}]`).join(' ')}.`);
    }
    if (sourceSummary && !sourceSummary.includes('No encontré una fuente específica')) {
      lines.push('', sourceSummary);
    } else {
      lines.push('', 'Para darte la fecha correcta con seguridad, necesito contrastarla en **El Peruano, SPIJ o la ficha oficial de la norma**.');
    }

    lines.push('', 'Si me pasas el enlace donde viste esa fecha, lo tomo como fuente y corrijo la respuesta con base en ese texto.');
    return lines.join('\n');
  }
  if (/\b(condenen|condena|condenaron|sentencia|pise el penal|ingrese al penal|carcel|cárcel|prision|prisión)\b/.test(normalizedQuery)) {
    return [
      'Entiendo la precisión. Revisando lo que indicas, el punto ya no debe tratarse como una ruta de denuncia.',
      '',
      'Si lo que te preocupa es que **la condenen o termine ingresando al penal**, entonces el enfoque es defensa y estrategia procesal: revisar en qué etapa está el caso, qué resolución existe, qué plazo corre y qué medio de defensa o recurso todavía es posible.',
      '',
      'No debo insistir con denuncia si tú estás hablando de una persona defendida o patrocinada.',
      '',
      '¿Ya hay sentencia condenatoria o todavía están antes de sentencia?'
    ].join('\n');
  }
  const dialogue = intent?.interpretation?.dialogue || {};
  const correctedFocus = String(dialogue.currentFocus || query || '').replace(/\s+/g, ' ').trim();
  const lines = [
    `Entendido. **Corrijo el enfoque**: ${correctedFocus || 'tomo como válida tu última precisión'}.`,
    '',
    'Dejo de lado mi interpretación anterior y continúo desde este dato, sin mezclarlo con el tema previo.'
  ];
  lines.push('', 'Para continuar desde ahí, ¿qué ocurrió concretamente en ese caso?');
  return lines.join('\n');
}

function buildProfessionalRoleConflictAnswer(query, intent, results = [], reasoningProfile = null) {
  const lines = [
    'Entiendo la precisión: si hablas de **tu patrocinada**, no debo tratarte automáticamente como si fueras la víctima que va a denunciar.',
    '',
    'Ahí el enfoque cambia. Primero hay que separar si tú estás actuando como defensa, si quieres dejar constancia de un hecho, si existe un conflicto ético o si estás evaluando apartarte del patrocinio. No es automático decir “denúnciala”.'
  ];

  lines.push('');
  lines.push('En concreto, yo revisaría **tu rol, el estado del proceso y qué deber profesional está en juego** antes de sugerir un paso.');
  lines.push('');
  lines.push('¿Tu patrocinada ya fue condenada, está investigada o tú quieres apartarte del caso?');
  return lines.join('\n');
}

function buildVerificationAnswer(query, intent, results = [], memoryMessages = []) {
  const memoryState = buildConversationMemoryState(memoryMessages);
  const lastFact = memoryState.lastUserFact || memoryState.userFacts[memoryState.userFacts.length - 1] || '';
  const legalBadges = collectLegalCitationBadges(results, 2);
  const lines = [
    'Gracias por marcarlo. Disculpa: si di ese dato como seguro, debí verificarlo mejor antes de afirmarlo.',
    '',
    'LEXIA debe trabajar con dos bases: **lo que tú indicas** y **fuentes verificables**. Si una frase mía no está sostenida por una fuente clara, la corrijo y la trato como dato pendiente de verificación.'
  ];

  if (lastFact) {
    lines.push('');
    lines.push(`Hecho del usuario que tengo como base: **${truncateForRag(lastFact, 220)}**.`);
  }

  if (legalBadges.length) {
    lines.push('');
    lines.push(`Base normativa relacionada, no prueba del hecho: ${legalBadges.map(item => `[${item}]`).join(' ')}.`);
  }

  lines.push('');
  lines.push('Pásame el enlace o el dato correcto, y rehago la respuesta con esa fuente como referencia.');
  return lines.join('\n');
}

function buildStatusAnswer(query, intent, results = [], reasoningProfile = null, memoryMessages = []) {
  const status = intent?.conversationMode?.status;
  const memoryState = buildConversationMemoryState(memoryMessages);
  const rawMemoryText = normalizeMemoryMessages(memoryMessages)
    .map(message => message.content)
    .join(' ');
  const memoryText = normalizeText([memoryState.userFactText, rawMemoryText, query, intent?.topic?.label].filter(Boolean).join(' '));
  const hasMinorContext = /\b(menor|niño|nino|niña|nina|adolescente|abuso sexual|violacion sexual|violación sexual|revictimizacion|revictimización)\b/.test(memoryText);
  let scopedResults = Array.isArray(results) ? results : [];

  if (hasMinorContext && typeof searchLegalKnowledgeBase === 'function') {
    const contextResults = searchLegalKnowledgeBase('abuso sexual menor codigo penal articulo 173 176-A ley 30403 denuncia fiscalia menor') || [];
    scopedResults = [...contextResults, ...scopedResults].filter(item => {
      const text = normalizeText([
        getResultTitle(item),
        getResultSource(item),
        item?.module,
        item?.modulo,
        item?.matter,
        item?.materia,
        getFullResultText(item)
      ].join(' '));
      return /\b(menor|niño|nino|niña|nina|adolescente|codigo penal|código penal|articulo 173|artículo 173|176-a|ley 30403|abuso sexual|violacion sexual|violación sexual)\b/.test(text);
    });
  }

  const primary = selectBestLegalResult(scopedResults, intent);
  scopedResults = primary ? [primary, ...scopedResults.filter(item => item !== primary)] : scopedResults;
  let legalBadges = collectLegalCitationBadges(scopedResults, 2);
  if (!legalBadges.length && !hasMinorContext) legalBadges = collectLegalCitationBadges(results, 2);
  const includeSources = intent?.interpretation?.dialogue?.responsePlan?.includeSources === true;
  const documents = collectIntelligenceItems(scopedResults, 'documentos', 4);
  const risks = collectIntelligenceItems(scopedResults, 'riesgos', 1);

  if (status === 'denounced') {
    const lines = [
      'Perfecto, entonces ya no estamos en “si denuncias o no”.',
      '',
      'Ahora el foco es **seguimiento, protección y pruebas**: conservar la constancia o número de denuncia, no manipular evidencias, ampliar información si aparecen nuevos datos y pedir medidas de protección si hay riesgo actual.'
    ];
    if (includeSources && legalBadges.length) {
      lines.push('');
      lines.push(`Base legal relacionada: ${legalBadges.map(item => `[${item}]`).join(' ')}.`);
    }
    if (documents.length) {
      lines.push('');
      lines.push(`Ten a la mano: **${documents.slice(0, 4).join(', ')}**.`);
    }
    if (risks.length) {
      lines.push('');
      lines.push(`Cuidado principal: **${risks[0]}**.`);
    }
    lines.push('');
    lines.push('¿Tienes constancia o número de denuncia, y ante qué entidad la presentaste?');
    return lines.join('\n');
  }

  const lines = [
    'Entiendo: todavía estás evaluando denunciar.',
    '',
    'Entonces no repito la pregunta anterior. Primero hay que ordenar **hechos, fechas, personas involucradas y pruebas**; si hay riesgo actual para alguien, la prioridad práctica es protección inmediata y autoridad competente.'
  ];
  if (includeSources && legalBadges.length) {
    lines.push('');
    lines.push(`Base legal relacionada: ${legalBadges.map(item => `[${item}]`).join(' ')}.`);
  }
  if (documents.length) {
    lines.push('');
    lines.push(`Para decidir mejor, revisa qué tienes: **${documents.slice(0, 4).join(', ')}**.`);
  }
  if (risks.length) {
    lines.push('');
    lines.push(`Cuidado principal: **${risks[0]}**.`);
  }
  lines.push('');
  lines.push('¿Qué prueba o dato concreto tienes ahora mismo: mensaje, audio, testigo, fecha o identificación de la persona?');
  return lines.join('\n');
}

function buildNewFactAnswer(query, intent, results = [], reasoningProfile = null) {
  const dialogue = intent?.interpretation?.dialogue || {};
  const focus = String(dialogue.currentFocus || query || '').replace(/\s+/g, ' ').trim();
  const lastQuestion = normalizeText(dialogue.lastAssistantQuestion || '');
  let nextQuestion = /\b(publicaron|difundieron|compartieron|enviaron)\b/.test(normalizeText(query))
    ? '¿En qué medio se difundió y en qué fecha aproximada?'
    : buildSingleLegalQuestion(intent, reasoningProfile, query);
  if (lastQuestion && normalizeText(nextQuestion) === lastQuestion) {
    nextQuestion = '¿Qué dato puedes precisar ahora para avanzar: la fecha, la persona involucrada o lo que ocurrió después?';
  }
  const lines = [
    `Entiendo. Incorporo este dato al caso: **${focus}**.`
  ];
  if (nextQuestion) lines.push('', nextQuestion);
  return lines.join('\n');
}

function buildAnsweredQuestionResponse(query, intent, reasoningProfile = null) {
  const dialogue = intent?.interpretation?.dialogue || {};
  const goal = dialogue.userGoal?.label;
  const answer = String(query || '').replace(/\s+/g, ' ').trim();
  const avoidedQuestion = normalizeText(dialogue.responsePlan?.avoidQuestion || '');
  let nextQuestion = goal === 'defender a una persona'
    ? '¿Esa persona ya recibió una denuncia, citación o notificación, o todavía es una consulta preventiva?'
    : buildSingleLegalQuestion(intent, reasoningProfile, query);
  if (avoidedQuestion && normalizeText(nextQuestion) === avoidedQuestion) {
    nextQuestion = '¿Qué ocurrió después y en qué etapa se encuentra ahora?';
  }
  const lines = [
    goal
      ? `Entendido: tu objetivo es **${goal}**.`
      : `Entendido: **${answer}**.`
  ];
  if (nextQuestion) lines.push('', nextQuestion);
  return lines.join('\n');
}

function buildActionAnswer(query, intent, results = [], reasoningProfile = null) {
  const primary = selectBestLegalResult(results, intent);
  const scopedResults = primary ? [primary] : results;
  const steps = collectIntelligenceItems(scopedResults, 'pasos', 4);
  const documents = collectIntelligenceItems(scopedResults, 'documentos', 4);
  let legalBadges = collectLegalCitationBadges(scopedResults, 2);
  if (!legalBadges.length) legalBadges = collectLegalCitationBadges(results, 2);
  const includeSources = intent?.interpretation?.dialogue?.responsePlan?.includeSources === true;
  const nextSteps = steps.length ? steps : (reasoningProfile?.nextSteps || []).slice(0, 3);
  const lines = ['Lo aterrizo sin vueltas.'];

  const actionSentence = nextSteps.slice(0, 3).map(step => step.charAt(0).toLowerCase() + step.slice(1)).join(', ');
  if (actionSentence) {
    lines.push('');
    lines.push(`Yo empezaría por **${actionSentence}**.`);
  }

  if (documents.length) {
    lines.push('');
    lines.push(`Ten a la mano: **${documents.slice(0, 4).join(', ')}**.`);
  }
  if (includeSources && legalBadges.length) {
    lines.push('');
    lines.push(`Base legal visible: ${legalBadges.map(item => `[${item}]`).join(' ')}.`);
  }
  if ((intent?.interpretation?.dialogue?.responsePlan?.maxQuestions ?? 1) > 0) {
    lines.push('');
    lines.push(buildSingleLegalQuestion(intent, reasoningProfile, query));
  }
  return lines.join('\n');
}

function buildModeAwareAnswer(query, intent, results = [], reasoningProfile = null, graphReasoning = null, memoryMessages = []) {
  const modeId = intent?.conversationMode?.id || 'case_start';
  const dialogue = intent?.interpretation?.dialogue || {};
  const scopedResults = filterResultsForCurrentIntent(query, intent, results);
  if (dialogue.answeredPreviousQuestion) {
    return buildAnsweredQuestionResponse(query, intent, reasoningProfile);
  }
  if (dialogue.speechAct === 'correction' || dialogue.speechAct === 'topic_shift') {
    return buildCorrectionAnswer(query, intent, scopedResults, memoryMessages);
  }
  if (dialogue.speechAct === 'new_fact') {
    return buildNewFactAnswer(query, intent, scopedResults, reasoningProfile);
  }
  if (modeId === 'source_request' || modeId === 'norm_request') {
    const clauseAnswer = buildClauseExplanationAnswer(query, intent, scopedResults, memoryMessages);
    if (clauseAnswer) return clauseAnswer;
    const exactArticleAnswer = buildExactArticleTextAnswer(query, intent, scopedResults, memoryMessages);
    if (exactArticleAnswer) return exactArticleAnswer;
    return buildSourceOrNormAnswer(query, intent, scopedResults, modeId);
  }
  if (modeId === 'confusion') {
    const clauseAnswer = buildClauseExplanationAnswer(query, intent, scopedResults, memoryMessages);
    if (clauseAnswer) return clauseAnswer;
  }
  if (modeId === 'definition_request') {
    return buildDefinitionAnswer(query, intent, scopedResults, reasoningProfile);
  }
  if (modeId === 'confusion') {
    return buildConfusionAnswer(query, intent, scopedResults, reasoningProfile, memoryMessages);
  }
  if (modeId === 'professional_role_conflict') {
    return buildProfessionalRoleConflictAnswer(query, intent, scopedResults, reasoningProfile);
  }
  if (modeId === 'correction') return buildCorrectionAnswer(query, intent, scopedResults, memoryMessages);
  if (modeId === 'verification_request') {
    return buildVerificationAnswer(query, intent, scopedResults, memoryMessages);
  }
  if (modeId === 'status_answer') {
    return buildStatusAnswer(query, intent, scopedResults, reasoningProfile, memoryMessages);
  }
  if (modeId === 'new_fact') {
    return buildNewFactAnswer(query, intent, scopedResults, reasoningProfile);
  }
  if (modeId === 'action_request') {
    return buildActionAnswer(query, intent, scopedResults, reasoningProfile);
  }
  return '';
}

function buildConversationalLegalAnswer(query, intent, results, reasoningProfile = null, graphReasoning = null, memoryMessages = []) {
  results = filterResultsForCurrentIntent(query, intent, results);
  const lines = [];
  const shortInput = isShortUserInput(query);
  const normalizedQuery = normalizeText(query);
  const modeAnswer = buildModeAwareAnswer(query, intent, results, reasoningProfile, graphReasoning, memoryMessages);
  if (modeAnswer) return modeAnswer;
  const forcedBenefitsGuidance = normalizedQuery.includes('beneficios sociales')
    ? [
        'Si tu empleador no te paga beneficios sociales, el punto no es solo reclamar: primero hay que identificar qué concepto falta y desde cuándo.',
        'En laboral, CTS, gratificaciones, vacaciones, remuneraciones pendientes y liquidación se revisan por separado para no mezclar montos.'
      ]
    : null;
  const guidance = forcedBenefitsGuidance || buildProgressiveGuidance(intent, reasoningProfile, graphReasoning);
  const rules = collectIntelligenceItems(results, 'reglas_practicas', 2);
  const risks = collectIntelligenceItems(results, 'riesgos', 2);
  const steps = collectIntelligenceItems(results, 'pasos', 3);
  const documents = collectIntelligenceItems(results, 'documentos', 4);
  const legalBadges = collectLegalCitationBadges(results);
  const includeSources = intent?.interpretation?.dialogue?.responsePlan?.includeSources === true
    || intent?.type?.id === 'consulta_normativa';

  if (intent?.needsMoreFacts || intent?.area?.id === 'area_no_determinada') {
    const focus = String(intent?.interpretation?.dialogue?.currentFocus || query || '').replace(/\s+/g, ' ').trim();
    return [
      `Entiendo que necesitas ayuda con **${focus || 'una situación jurídica'}**.`,
      '',
      'Para no asumir algo distinto de lo que quieres decir, ¿qué ocurrió concretamente y qué necesitas lograr?'
    ].join('\n');
  }

  if (shortInput && !memoryMessages.length) {
    return [
      `Entiendo: **${String(query || '').replace(/\s+/g, ' ').trim()}**.`,
      '',
      buildSingleLegalQuestion(intent, reasoningProfile, query)
    ].filter(Boolean).join('\n');
  }

  if (intent?.type?.id === 'consulta_normativa') {
    return buildNormativeLegalAnswer(query, intent, results);
  } else {
    if (guidance.length) {
      lines.push(guidance.slice(0, shortInput ? 1 : 2).join(' '));
    } else {
      lines.push(`Veo que esto cae en ${intent?.area?.label || 'un tema jurídico'}, pero necesito un dato más para aterrizarlo bien.`);
    }

    if (includeSources && legalBadges.length) {
      lines.push('');
      lines.push(`Esto se fundamenta en ${legalBadges.map(item => `[${item}]`).join(' ')}.`);
    }

    if (!shortInput && (rules.length || risks.length)) {
      const analysis = [];
      if (rules.length) analysis.push(`Lo principal es **${rules[0]}**`);
      if (risks.length) analysis.push(`el cuidado más importante es **${risks[0]}**`);
      lines.push('');
      lines.push(`${analysis.join('; ')}.`);
    }

    if (!shortInput && (steps.length || documents.length)) {
      const practical = [];
      if (steps.length) practical.push(`Como siguiente paso, conviene ${steps.slice(0, 3).join(', ')}`);
      if (documents.length) practical.push(`ten a la mano ${documents.slice(0, 4).join(', ')}`);
      lines.push('');
      lines.push(`${practical.join('. ')}.`);
    }

    if ((intent?.interpretation?.dialogue?.responsePlan?.maxQuestions ?? 1) > 0) {
      lines.push('');
      lines.push(normalizedQuery.includes('beneficios sociales')
        ? '¿Sigues trabajando ahí o ya terminó la relación laboral?'
        : buildSingleLegalQuestion(intent, reasoningProfile, query));
    }
  }

  const sourceSummary = includeSources ? buildSourceSummary(results, intent) : '';
  if (includeSources && !shortInput && results.length && !sourceSummary.includes('No encontré una fuente específica')) {
    lines.push('');
    lines.push(sourceSummary);
  }

  return lines.join('\n');
}

function buildMemoryAwareLocalAnswer(query, intent, results, reasoningProfile, graphReasoning, memoryMessages = []) {
  results = filterResultsForCurrentIntent(query, intent, results);
  const normalizedMemory = normalizeMemoryMessages(memoryMessages);
  const recentUserMessages = normalizedMemory.filter(message => message.role === 'user').slice(-3);
  const modeAnswer = buildModeAwareAnswer(query, intent, results, reasoningProfile, graphReasoning, normalizedMemory);
  if (modeAnswer) return modeAnswer;
  const followUp = isConversationalFollowUp(query)
    || (normalizedMemory.length > 0 && getQueryTerms(query).length <= 3)
    || isConversationContinuation(query, normalizedMemory);

  if (!followUp) {
    return buildConversationalLegalAnswer(query, intent, results, reasoningProfile, graphReasoning, normalizedMemory);
  }

  const lines = [];
  const previousFacts = recentUserMessages
    .map(message => message.content)
    .filter(content => !isConversationalFollowUp(content));
  const lastUserFact = previousFacts.length
    ? previousFacts[previousFacts.length - 1]
    : (reasoningProfile?.facts || []).find(fact => !isConversationalFollowUp(fact)) || query;

  lines.push(`En tu caso, sigo tomando como punto de partida esto: **${truncateForRag(lastUserFact, 220)}**.`);

  const legalBadges = collectLegalCitationBadges(results);
  const includeSources = intent?.interpretation?.dialogue?.responsePlan?.includeSources === true
    || intent?.type?.id === 'consulta_normativa';
  if (includeSources && legalBadges.length) {
    lines.push('');
    lines.push(`La base que sostiene esta orientación es ${legalBadges.map(item => `[${item}]`).join(' ')}.`);
  }

  if (intent?.type?.id === 'consulta_normativa') {
    const normativeResults = (Array.isArray(results) ? results : []).filter(isUsefulNormativeResult);
    const primaryNormative = normativeResults[0] || results?.[0];
    if (primaryNormative) {
      lines.push('');
      lines.push(`La base legal que más se relaciona es **${getResultTitle(primaryNormative)}**.`);
      const normativeText = String(primaryNormative?.contenido || primaryNormative?.content || getResultText(primaryNormative)).replace(/\s+/g, ' ').trim();
      if (normativeText) {
        lines.push(`En simple: **${truncateForRag(normativeText, 320)}**`);
      }
    }
  }

  const intelligence = (results || [])
    .map(item => item.intelligence || item.inteligencia)
    .find(item => item && typeof item === 'object');
  const normalizedQuery = normalizeText(query);
  const isSentenceStage = /\b(sentencia|lectura de sentencia|fecha para sentencia|audiencia de sentencia)\b/.test(normalizedQuery);
  const steps = isSentenceStage
    ? ['confirmar hora, modalidad y juzgado de la audiencia', 'coordinar con su abogado la estrategia antes de la lectura', 'prepararse para revisar si corresponde apelación']
    : (Array.isArray(intelligence?.pasos) ? intelligence.pasos : reasoningProfile?.nextSteps || []);
  const documents = isSentenceStage
    ? ['notificación o resolución que fija fecha', 'expediente o número de caso', 'DNI', 'datos del abogado', 'pruebas y escritos presentados']
    : (Array.isArray(intelligence?.documentos) ? intelligence.documentos : []);
  const risks = isSentenceStage
    ? ['dejar vencer el plazo para impugnar si la sentencia es desfavorable']
    : (Array.isArray(intelligence?.riesgos) ? intelligence.riesgos : reasoningProfile?.risks || []);

  const nextSteps = steps.length ? steps : [
    'ordenar los hechos en una línea de tiempo',
    'separar documentos, pagos y comunicaciones',
    'definir si buscas reclamar, denunciar, negociar o calcular un monto'
  ];
  lines.push('');
  lines.push(`Yo haría esto ahora: **${nextSteps.slice(0, 3).join(', ')}**.`);

  if (documents.length) {
    lines.push('');
    lines.push(`Ten a la mano **${documents.slice(0, 5).join(', ')}**.`);
  }

  if (risks.length) {
    lines.push('');
    lines.push(`El cuidado principal es **${risks[0]}**.`);
  }

  if ((intent?.interpretation?.dialogue?.responsePlan?.maxQuestions ?? 1) > 0) {
    lines.push('');
    lines.push(isSentenceStage
      ? '¿La fecha del miércoles es para **lectura de sentencia** y ya tiene abogado asignado o particular?'
      : buildSingleLegalQuestion(intent, reasoningProfile, query));
  }

  const sourceSummary = buildSourceSummary(results, intent, 2);
  const userAskedForSources = intent?.type?.id === 'consulta_normativa' || /\b(ley|leyes|articulo|artículo|norma|base legal|fuente|fundamento)\b/i.test(query);
  if (userAskedForSources && results.length && !sourceSummary.includes('No encontré una fuente específica')) {
    lines.push('');
    lines.push(sourceSummary);
  }
  return lines.join('\n');
}


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
  const providerConfig = options.providerConfig?.openai || aiProviderConfig.openai;
  const apiKey = String(providerConfig?.apiKey || '').trim();
  if (!apiKey) {
    throw {
      provider: 'openai',
      code: 'not_configured',
      error: 'OpenAI no está configurado.'
    };
  }

  const baseUrl = String(providerConfig?.baseUrl || openAiBaseUrl).replace(/\/+$/, '');
  const model = options.model || providerConfig?.model || openAiModel;
  const temperature = Number.isFinite(options.temperature) ? options.temperature : Number(providerConfig?.temperature ?? 0.35);
  const maxTokens = Number(providerConfig?.maxTokens || 2000);
  const { controller, timeout } = createProviderTimeout();

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
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
  const providerConfig = options.providerConfig?.grok || aiProviderConfig.grok;
  const apiKey = String(providerConfig?.apiKey || '').trim();
  if (!apiKey) {
    throw {
      provider: 'grok',
      code: 'not_configured',
      error: 'Grok/xAI no está configurado.'
    };
  }

  const baseUrl = String(providerConfig?.baseUrl || xAiBaseUrl).replace(/\/+$/, '');
  const model = options.model || providerConfig?.model || grokModel;
  const temperature = Number.isFinite(options.temperature) ? options.temperature : Number(providerConfig?.temperature ?? 0.35);
  const maxTokens = Number(providerConfig?.maxTokens || 2000);
  const { controller, timeout } = createProviderTimeout();

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
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
  const providerConfig = options.providerConfig?.groq || aiProviderConfig.groq;
  const apiKey = String(providerConfig?.apiKey || '').trim();
  if (!apiKey) {
    throw {
      provider: 'groq',
      code: 'not_configured',
      error: 'GroqCloud no está configurado.'
    };
  }

  const baseUrl = String(providerConfig?.baseUrl || groqBaseUrl).replace(/\/+$/, '');
  const model = options.model || providerConfig?.model || groqModel;
  const temperature = Number.isFinite(options.temperature) ? options.temperature : Number(providerConfig?.temperature ?? 0.35);
  const maxTokens = Number(providerConfig?.maxTokens || 2000);
  const { controller, timeout } = createProviderTimeout();

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
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
  const providerConfig = options.providerConfig?.ollama || aiProviderConfig.ollama;
  const enabled = Boolean(providerConfig?.enabled && providerConfig?.baseUrl);
  if (!enabled) {
    throw {
      provider: 'ollama',
      code: 'not_configured',
      error: 'Ollama no está configurado.'
    };
  }

  const baseUrl = String(providerConfig?.baseUrl || ollamaBaseUrl).replace(/\/+$/, '');
  const model = options.model || providerConfig?.model || ollamaModel;
  const temperature = Number.isFinite(options.temperature) ? options.temperature : Number(providerConfig?.temperature ?? 0.35);
  const { controller, timeout } = createProviderTimeout();
  const headers = { 'Content-Type': 'application/json' };
  if (providerConfig?.apiKey) {
    headers.Authorization = `Bearer ${providerConfig.apiKey}`;
  }

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      signal: controller.signal,
      headers,
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        keep_alive: providerConfig?.keepAlive || '5m',
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
  const providerConfig = options.providerConfig || aiProviderConfig;
  const canRunProvider = provider => (
    (provider === 'groq' && providerConfig.groq?.apiKey)
    || (provider === 'grok' && providerConfig.grok?.apiKey)
    || (provider === 'openai' && providerConfig.openai?.apiKey)
    || (provider === 'ollama' && providerConfig.ollama?.enabled)
  );
  const runProvider = provider => {
    if (provider === 'groq') return callGroqChat(messages, { ...options, providerConfig });
    if (provider === 'grok') return callGrokChat(messages, { ...options, providerConfig });
    if (provider === 'openai') return callOpenAiChat(messages, { ...options, providerConfig });
    if (provider === 'ollama') return callOllamaChat(messages, { ...options, providerConfig });
    throw { provider, code: 'unsupported_provider', error: `Proveedor no soportado: ${provider}` };
  };

  if (providerStrategy === 'ensemble') {
    const runnableProviders = providers.filter(canRunProvider);
    const settled = await Promise.allSettled(runnableProviders.map(async provider => ({
      provider,
      result: await runProvider(provider)
    })));
    const successes = [];

    for (const item of settled) {
      if (item.status === 'fulfilled') {
        successes.push(item.value.result);
      } else {
        const error = item.reason || {};
        errors.push({
          provider: error.provider || 'unknown',
          code: error.code || null,
          error: error.error || error.message || 'Error del proveedor generativo.'
        });
      }
    }

    if (successes.length) {
      const primary = successes[0];
      return {
        ...primary,
        providerErrors: errors,
        providerStrategy: 'ensemble',
        providerChecks: successes.map(item => ({
          provider: item.provider,
          model: item.model,
          source: item.source,
          answerLength: String(item.answer || '').length
        }))
      };
    }

    return { answer: '', provider: 'local', model: 'local-rag-engine', source: 'LEXIA RAG Local', providerErrors: errors, providerStrategy: 'ensemble' };
  }

  for (const provider of providers) {
    try {
      if (canRunProvider(provider)) {
        return { ...(await runProvider(provider)), providerErrors: errors, providerStrategy: 'fallback' };
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
- Si el usuario hace una pregunta dependiente del hilo ("dame las leyes", "qué hago", "y ahora", "explícame eso"), interpreta el mensaje usando el caso anterior antes de responder.
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
- Sé precisa sin sonar rígida: responde como chat humano, con párrafos cortos y una idea por párrafo.
- Resalta en **negrita** solo frases dentro de la conversación: derecho aplicable, riesgo, plazo, documento clave o siguiente paso. No conviertas cada frase en subtítulo.
- Puedes usar "te recomiendo", "conviene revisar" y "lo primero sería", dejando claro que es orientación general y no patrocinio legal.
- No empieces con listas largas si el usuario hizo una pregunta simple. Primero responde en una frase clara y luego amplía si hace falta.
- Mantente dentro del mundo jurídico. No respondas como consejero general, psicólogo, vendedor ni bot administrativo.

CAPACIDADES QUE DEBES EJECUTAR EN CADA RESPUESTA:
- Razonamiento jurídico: antes de responder, analiza internamente hechos, problema jurídico, regla aplicable, riesgos, prueba disponible, datos faltantes y conclusión probable. No muestres cadena de pensamiento; muestra solo un resumen claro del criterio y las razones principales.
- Chat con IA jurídica: responde la pregunta concreta antes de ampliar.
- Conversación antes que fuente: si el usuario está aclarando o siguiendo el hilo, responde a esa aclaración. No abras secciones de fuentes salvo que cites una norma, entidad o referencia concreta que cambie la respuesta.
- Consulta de leyes: identifica normas, códigos, artículos, requisitos, plazos y autoridades competentes cuando aplique.
- Jurisprudencia: cita sentencias, precedentes, criterios o jurisprudencia solo si aparecen en la base de conocimiento o si el usuario los proporciona. No inventes números de expediente, fechas, salas ni citas.
- Fidelidad de fuentes: no cites números de artículos, leyes, expedientes, casaciones, sentencias ni entidades si no aparecen expresamente en el RAG, en la síntesis interna de LEXIA o en el mensaje del usuario. Si no hay artículo exacto, di "la base local ubica la garantía, pero no tengo artículo exacto verificado en este contexto".
- Fundamento visible: cuando afirmes que algo está prohibido, protegido, sancionado, permitido o que un delito es grave, añade la norma en corchetes, por ejemplo [Código Penal, art. 200] o [Ley 29571]. Usa esos corchetes solo si la norma aparece en el RAG, en la síntesis interna o fue dada por el usuario.
- Citas resaltables: escribe toda norma sustantiva en formato exacto de corchetes para que la interfaz la marque como base legal: [Código Penal, art. 173], [Código Penal, art. 176-A], [Ley 30403], [Constitución Política del Perú, art. 2]. No uses ese formato si la norma no está verificada por el RAG, la síntesis interna o el usuario.
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
No uses un formato rígido si la consulta es simple. La respuesta debe sentirse como conversación de chat con una abogada:
1. Primero reacciona al dato del usuario y responde directo.
2. Explica en lenguaje simple, con frases naturales y no como informe.
3. Usa **negrita** dentro de las frases para marcar lo importante, no como encabezado repetitivo.
4. Usa lista corta solo si ayuda a leer, máximo 3 puntos.
5. Cierra con una sola pregunta concreta si falta información. Usa "Fuentes y verificación" solo cuando el usuario pida leyes, artículos, normas o cuando cites una fuente específica.

REGLAS:
- Siempre responde en español, con tono profesional, cercano y claro.
- Prioriza Derecho peruano salvo que el usuario indique otra jurisdicción.
- Si el usuario escribe solo una ley, por ejemplo "Ley 29973", o solo una secuencia numérica, por ejemplo "29973", interpreta primero si puede ser una referencia normativa peruana. Identifica la ley si hay coincidencia, explica en lenguaje simple qué quiere decir y pregunta qué aspecto desea revisar. Si no hay coincidencia segura, no inventes: indica que debe verificarse en El Peruano, SPIJ o fuente oficial.
- Si el usuario corrige el tema, su objetivo, su rol o lo que quiso decir, acepta esa precisión como estado actual de la conversación, reconoce el error brevemente y abandona la interpretación anterior. No le pidas una fuente para explicar qué quiso decir.
- Si la corrección afirma un dato externo verificable —por ejemplo contenido, fecha o vigencia de una norma—, distingue esa afirmación de la corrección conversacional y contrástala con el RAG, el catálogo conocido o la fuente aportada antes de presentarla como verdadera.
- En fechas normativas distingue siempre entre promulgación, publicación y vigencia. Si el usuario confunde una fecha de publicación con una de promulgación, aclara esa diferencia con la fuente.
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
      interpret: interpretLegalQueryWithPython,
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
      search: searchLegalKnowledgeBase,
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
      providerConfig: () => aiProviderConfig,
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
  if (extractNormativeReference(text)) return true;
  const keywords = [
    'contrato','compraventa','derecho','juzgado','demanda','abogado','inmueble','despido','despide','despiden','despedido','salario','laboral',
    'tribut','penal','delito','fiscal','familia','alimentos','divorcio','custodia','herencia','testamento',
    'arrendamiento','propiedad','posesión','acción','proceso','litigación','juicio','sentencia','recurso',
    'apelación','casación','habeas corpus','amparo','tutela','mandato','poder','procuración','notario',
    'escritura','registro','hipoteca','embargo','secuestro','incautación','multa','sanción','pena',
    'prisión','indemnización','daño','perjuicio','responsabilidad','culpa','negligencia','fraude','estafa','extorsión','extorsion',
    'robo','hurto','violencia','acoso','difamación','injuria','calumnia','agresión','asalto','homicidio',
    'aborto','adopción','patria potestad','guarda','visita','pensión','renta','cuota','arancel','honorario',
    'empresa','sociedad','quiebra','insolvencia','liquidación','ley','código','articulado','inciso',
    'consumidor','consumo','indecopi','proveedor','servicio educativo','universidad','instituto',
    'pensión','pension','matrícula','matricula','cobro excesivo','cobran demasiado','cobrando demasiado'
    ,'constitución','constitucion','terreno','predio','lindero','linderos','vecino','empleador','trabajador'
  ];
  return keywords.some(k => text.toLowerCase().includes(k));
}

const knownPeruvianLawsByNumber = {
  '29973': {
    number: '29973',
    label: 'Ley N.° 29973',
    title: 'Ley General de la Persona con Discapacidad',
    matter: 'Derechos de las personas con discapacidad',
    plainMeaning: 'reconoce derechos, medidas de accesibilidad, ajustes razonables, inclusión, no discriminación y obligaciones del Estado y de privados frente a las personas con discapacidad.',
    practicalUse: 'Sirve para sustentar pedidos de accesibilidad, trato igualitario, ajustes razonables, atención preferente, inclusión educativa, laboral o administrativa, y eliminación de barreras.',
    promulgationDate: '13 de diciembre de 2012',
    publicationDate: '24 de diciembre de 2012',
    effectiveDate: '25 de diciembre de 2012',
    officialSource: 'Diario Oficial El Peruano, Ley N.° 29973, publicada el 24 de diciembre de 2012',
    verification: 'Verifica siempre el texto vigente y su reglamento en El Peruano, SPIJ, CONADIS o la entidad competente.'
  },
  '30403': {
    number: '30403',
    label: 'Ley N.° 30403',
    title: 'Ley que prohíbe el uso del castigo físico y humillante contra los niños, niñas y adolescentes',
    matter: 'Protección de niños, niñas y adolescentes',
    plainMeaning: 'prohíbe formas de corrección basadas en castigo físico o trato humillante y refuerza el deber de protección frente a violencia contra menores.',
    practicalUse: 'Sirve para sustentar protección de menores, medidas preventivas, intervención familiar, educativa o administrativa y análisis de violencia contra niños, niñas y adolescentes.',
    verification: 'Verifica el texto vigente en El Peruano, SPIJ, MIMP o la entidad competente.'
  },
  '29733': {
    number: '29733',
    label: 'Ley N.° 29733',
    title: 'Ley de Protección de Datos Personales',
    matter: 'Protección de datos personales',
    plainMeaning: 'regula el tratamiento de datos personales y exige consentimiento, finalidad legítima, seguridad y respeto de los derechos del titular de los datos.',
    practicalUse: 'Sirve para evaluar uso indebido de datos, consentimientos, bancos de datos, derechos ARCO, reclamos ante la autoridad y obligaciones de empresas o entidades.',
    verification: 'Verifica el texto vigente y su reglamento en El Peruano, SPIJ o la Autoridad Nacional de Protección de Datos Personales.'
  },
  '27444': {
    number: '27444',
    label: 'Ley N.° 27444',
    title: 'Ley del Procedimiento Administrativo General',
    matter: 'Derecho administrativo',
    plainMeaning: 'ordena cómo deben actuar las entidades públicas en procedimientos administrativos, incluyendo derechos del administrado, notificación, plazos, recursos y validez de actos administrativos.',
    practicalUse: 'Sirve para revisar multas, trámites, recursos administrativos, nulidades, descargos, silencio administrativo y debido procedimiento ante entidades públicas.',
    verification: 'Verifica el TUO vigente de la Ley 27444 en El Peruano, SPIJ o la entidad pública competente.'
  },
  '30364': {
    number: '30364',
    label: 'Ley N.° 30364',
    title: 'Ley para prevenir, sancionar y erradicar la violencia contra las mujeres y los integrantes del grupo familiar',
    matter: 'Violencia familiar y protección',
    plainMeaning: 'establece medidas de protección, rutas de atención y obligaciones estatales frente a violencia contra mujeres e integrantes del grupo familiar.',
    practicalUse: 'Sirve para sustentar denuncias, medidas de protección, evaluación de riesgo, atención fiscal, policial o judicial y protección urgente de víctimas.',
    verification: 'Verifica el texto vigente en El Peruano, SPIJ, MIMP, Ministerio Público o Poder Judicial.'
  },
  '30220': {
    number: '30220',
    label: 'Ley N.° 30220',
    title: 'Ley Universitaria',
    matter: 'Educación universitaria',
    plainMeaning: 'regula el sistema universitario peruano, licenciamiento, calidad educativa, organización universitaria, derechos y deberes en el ámbito universitario.',
    practicalUse: 'Sirve para analizar asuntos universitarios, deberes de universidades, derechos estudiantiles, procedimientos internos y supervisión por SUNEDU.',
    verification: 'Verifica el texto vigente en El Peruano, SPIJ o SUNEDU.'
  },
  '30057': {
    number: '30057',
    label: 'Ley N.° 30057',
    title: 'Ley del Servicio Civil',
    matter: 'Empleo público',
    plainMeaning: 'regula el régimen del servicio civil y busca ordenar la gestión de servidores públicos, derechos, obligaciones, evaluación y régimen disciplinario.',
    practicalUse: 'Sirve para revisar situaciones de empleo público, procedimientos disciplinarios, derechos laborales públicos y gestión de personal estatal.',
    verification: 'Verifica el texto vigente en El Peruano, SPIJ o SERVIR.'
  }
};

function extractNormativeReference(query = '') {
  const raw = String(query || '').trim();
  const normalized = normalizeText(raw);
  if (!normalized) return null;

  const lawMatch = normalized.match(/\b(?:ley|leyes|ley n|ley no|ley nro|ley numero|ley número)\s*(\d{3,6})\b/);
  const shortLawMatch = normalized.match(/\b(?:ley|leyes|ley n|ley no|ley nro|ley numero|ley número)\s*(\d{1,6})\b/);
  if (lawMatch) {
    return {
      kind: 'law',
      number: lawMatch[1],
      explicitLaw: true,
      onlyReference: /^(?:ley|leyes|ley n|ley no|ley nro|ley numero|ley número)?\s*\d{3,6}$/.test(normalized)
    };
  }
  if (shortLawMatch) {
    return {
      kind: 'law',
      number: shortLawMatch[1],
      explicitLaw: true,
      onlyReference: /^(?:ley|leyes|ley n|ley no|ley nro|ley numero|ley número)?\s*\d{1,6}$/.test(normalized)
    };
  }

  const numberOnlyMatch = normalized.match(/^\d{3,6}$/);
  if (numberOnlyMatch) {
    return {
      kind: 'number',
      number: numberOnlyMatch[0],
      explicitLaw: false,
      onlyReference: true
    };
  }

  return null;
}

function getKnownPeruvianLaw(referenceOrQuery) {
  const reference = typeof referenceOrQuery === 'string'
    ? extractNormativeReference(referenceOrQuery)
    : referenceOrQuery;
  if (!reference?.number) return null;
  return knownPeruvianLawsByNumber[reference.number] || null;
}

function buildLawReferenceSearchQuery(query) {
  const reference = extractNormativeReference(query);
  if (!reference) return query;
  const law = getKnownPeruvianLaw(reference);
  if (!law) {
    return `Ley ${reference.number} norma peruana texto vigente significado alcance ${query}`;
  }
  return [
    law.label,
    law.title,
    law.matter,
    law.plainMeaning,
    query
  ].join(' ');
}

function buildKnownLawReferenceAnswer(query, results = []) {
  const reference = extractNormativeReference(query);
  if (!reference?.onlyReference) return '';

  const law = getKnownPeruvianLaw(reference);
  if (!law) {
    return [
      reference.explicitLaw
        ? `Te entiendo: estás preguntando por la **Ley N.° ${reference.number}**.`
        : `Ese número, **${reference.number}**, parece que podría ser una referencia legal.`,
      '',
      'No tengo una coincidencia segura en mi catálogo local para decirte, sin riesgo de inventar, cuál es su nombre completo o qué regula exactamente.',
      '',
      'Lo más responsable es verificarla en **El Peruano, SPIJ o la entidad que emitió la norma**. Si me das el nombre completo, una captura o el tema al que pertenece, te la explico en sencillo.'
    ].join('\n');
  }

  const usefulResults = (Array.isArray(results) ? results : []).filter(isUsefulNormativeResult);
  const sourceSummary = usefulResults.length ? buildSourceSummary(usefulResults, {
    topic: { label: law.title },
    area: { label: law.matter }
  }, 2) : '';
  const lines = [
    `Claro. La **${law.label}** es la **${law.title}**.`,
    '',
    `En sencillo: esta ley **${law.plainMeaning}**`,
    '',
    `¿Para qué sirve en la práctica? **${law.practicalUse}**`
  ];

  if (reference.kind === 'number' && !reference.explicitLaw) {
    lines.unshift(`Creo que el número **${reference.number}** se refiere a la **${law.label}**.`);
    lines.splice(1, 0, '');
  }

  lines.push('', law.verification);

  if (sourceSummary && !sourceSummary.includes('No encontré una fuente específica')) {
    lines.push('', sourceSummary);
  }

  lines.push('', '¿Quieres que te explique los puntos principales de esa ley o prefieres que la aterrice a una situación concreta?');
  return lines.join('\n');
}

app.post('/api/legal-intent', async (req, res) => {
  const query = String(req.body?.query || req.body?.prompt || '').trim();
  if (!query) {
    return res.status(400).json({ error: 'La consulta es obligatoria.' });
  }
  const memoryMessages = Array.isArray(req.body?.conversationMessages) ? req.body.conversationMessages : [];
  const intent = await interpretLegalQueryWithPython(extractUserQuery(query), memoryMessages);
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
  const intent = await interpretLegalQueryWithPython(query, []);
  const localSearchEvaluation = evaluateLocalSearchSufficiency(query, results);
  logLocalSearchSufficiency('/api/legal-query', query, localSearchEvaluation);
  return res.json({
    query,
    intent,
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
      if (dbPersisted) setLegalIngestedCorpusLoaded(true);
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
    if (dbPersisted) setLegalIngestedCorpusLoaded(true);
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
      providers: discovery.providers,
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
      return res.json({ ok: true, storage: 'local', sources: [], entries: getLegalIngestedEntryCount() });
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
    return res.json({ ok: true, storage: 'postgres', sources: result.rows, entries: getLegalIngestedEntryCount(), canCurate });
  } catch (error) {
    console.error('Error listando ingestas:', error.message);
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    return res.json({
      ok: true,
      storage: 'local',
      sources: [],
      entries: getLegalIngestedEntryCount(),
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
  const intent = await interpretLegalQueryWithPython(query, []);
  const localSearchEvaluation = evaluateLocalSearchSufficiency(query, results);
  logLocalSearchSufficiency('/api/legal-search', query, localSearchEvaluation);
  return res.json({
    query,
    intent,
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
      conversationMemory,
      role: chatRole,
      sessionId: chatSessionId,
      caseFile: req.body?.caseFile,
      providerConfig: aiProviderConfig
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
      caseFile: intelligenceResult.metadata?.caseFile || null,
      quality: intelligenceResult.metadata?.lexiaScore || null,
      diagnostics: {
        providerStrategy: intelligenceResult.metadata?.providerStrategy || 'fallback',
        providerChecks: intelligenceResult.metadata?.providerChecks || [],
        providerErrors: intelligenceResult.metadata?.providerErrors || [],
        ragSources: intelligenceResult.ragSources || [],
        memoryMessages: intelligenceResult.metadata?.memoryMessages || 0,
        localSearchEvaluation: intelligenceResult.metadata?.localSearchEvaluation || null,
        conversationMode: intelligenceResult.metadata?.conversationMode || intelligenceResult.intent?.conversationMode || null,
        dualAnalysis: intelligenceResult.metadata?.dualAnalysis || null,
        candidateSelection: intelligenceResult.metadata?.candidateSelection || null,
        engineStage: intelligenceResult.metadata?.engineStage || null
      },
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
  console.log(`📚 Base de conocimiento: ${getKnowledgeStats().totalKB} KB`);
  console.log(`🔑 OpenAI: ${openAiKey ? '✅ Conectado' : '❌ No configurado'}`);
  console.log(`💱 Modelo OpenAI: ${process.env.OPENAI_MODEL || 'gpt-4o-mini'}`);
  console.log(`⚡ Grok/xAI: ${xAiKey ? '✅ Conectado' : '❌ No configurado'}`);
  console.log(`🧠 Modelo Grok: ${grokModel}`);
  console.log(`⚡ GroqCloud: ${groqKey ? '✅ Conectado' : '❌ No configurado'}`);
  console.log(`🧠 Modelo GroqCloud: ${groqModel}`);
  console.log(`🧠 Ollama: ${ollamaEnabled ? `✅ ${ollamaBaseUrl}` : '❌ No configurado'}`);
  console.log(`🧩 Modelo Ollama: ${ollamaModel}`);
  console.log(`🎛️ Proveedor preferido: ${forceLocalProvider ? 'local' : (preferGroq ? 'groq' : (preferGrok ? 'grok' : (preferOllama ? 'ollama' : 'openai')))}`);
  console.log(`🧪 Estrategia IA: ${providerStrategy === 'ensemble' ? 'ensemble (consulta proveedores configurados)' : 'fallback (primer proveedor disponible)'}`);
  console.log('\n' + '='.repeat(60) + '\n');
});
