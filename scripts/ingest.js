const fs = require('fs');
const path = require('path');
const fetch = global.fetch || require('node-fetch');

const KB_DIR = path.join(__dirname, '..', 'kb');
const OUT_FILE = path.join(KB_DIR, 'embeddings.json');
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';

if (!OPENAI_KEY) {
  console.error('OPENAI_API_KEY is required in environment to run ingest.');
  process.exit(1);
}

function chunkText(text, maxChars = 1000) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const slice = text.slice(start, start + maxChars);
    chunks.push(slice.trim());
    start += maxChars;
  }
  return chunks;
}

async function getEmbedding(text) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_KEY}`
    },
    body: JSON.stringify({ model: MODEL, input: text })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Embedding request failed: ${body}`);
  }
  const data = await res.json();
  return data.data[0].embedding;
}

(async () => {
  if (!fs.existsSync(KB_DIR)) {
    console.error('KB directory not found:', KB_DIR);
    process.exit(1);
  }

  const files = fs.readdirSync(KB_DIR).filter(f => f.endsWith('.md'));
  const out = [];

  for (const file of files) {
    const filePath = path.join(KB_DIR, file);
    const raw = fs.readFileSync(filePath, 'utf8');
    const chunks = chunkText(raw, 1000);
    console.log(`Ingestando ${file} -> ${chunks.length} chunks`);

    for (let i = 0; i < chunks.length; i++) {
      const text = chunks[i];
      try {
        const embedding = await getEmbedding(text);
        out.push({ id: `${file}::${i}`, file, text, embedding });
        console.log(`  Chunk ${i} embedding OK`);
      } catch (e) {
        console.error('  Error embedding chunk', i, e.message);
      }
    }
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), 'utf8');
  console.log('Embeddings saved to', OUT_FILE);
})();
