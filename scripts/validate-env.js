const fs = require('node:fs');
const path = require('node:path');

const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
    process.env[match[1]] = value;
  }
}

const environment = process.env.NODE_ENV || 'development';
const provider = String(process.env.AI_PROVIDER || 'auto').toLowerCase();
const errors = [];
const warnings = [];

if (environment === 'production' && !process.env.SUPABASE_DATABASE_URL && !process.env.DATABASE_URL) {
  errors.push('Production requires SUPABASE_DATABASE_URL or DATABASE_URL.');
}

const providerKeys = {
  openai: 'OPENAI_API_KEY',
  groq: 'GROQ_API_KEY',
  grok: 'XAI_API_KEY'
};
if (providerKeys[provider] && !process.env[providerKeys[provider]]) {
  errors.push(`AI_PROVIDER=${provider} requires ${providerKeys[provider]}.`);
}

if (provider === 'ollama' && !process.env.OLLAMA_BASE_URL) {
  errors.push('AI_PROVIDER=ollama requires OLLAMA_BASE_URL.');
}

if (environment === 'production' && process.env.LEGAL_WEB_SKIP_ROBOTS === 'true') {
  warnings.push('LEGAL_WEB_SKIP_ROBOTS=true should not be used in production.');
}

if (fs.existsSync(path.resolve(__dirname, '..', 'data', 'accounts.json'))) {
  warnings.push('Local accounts.json exists. It must never be committed or used as the production account store.');
}

for (const warning of warnings) console.warn(`Warning: ${warning}`);
if (errors.length) {
  for (const error of errors) console.error(`Error: ${error}`);
  process.exit(1);
}
console.log(`Environment validation passed for ${environment}.`);
