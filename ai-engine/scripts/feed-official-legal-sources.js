/**
 * LEXIA - Official legal source batch feeder
 *
 * Usage:
 *   node ai-engine/scripts/feed-official-legal-sources.js
 *
 * Optional env:
 *   LEXIA_API_BASE=http://localhost:3002
 *   LEXIA_FEED_EMAIL=curator@example.com
 *   LEXIA_FEED_FILE=ai-engine/kb/official_legal_sources.json
 *   LEXIA_FEED_LIMIT=10
 */

const fs = require('fs');
const path = require('path');
const fetch = global.fetch || require('node-fetch');

const projectRoot = path.join(__dirname, '..', '..');
const defaultFeedFile = path.join(projectRoot, 'ai-engine', 'kb', 'official_legal_sources.json');
const apiBase = String(process.env.LEXIA_API_BASE || 'http://localhost:3002').replace(/\/+$/, '');
const email = String(process.env.LEXIA_FEED_EMAIL || '').trim();
const feedFile = path.resolve(projectRoot, process.env.LEXIA_FEED_FILE || defaultFeedFile);
const batchLimit = Math.max(1, Math.min(Number(process.env.LEXIA_FEED_LIMIT || 10), 10));

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`No existe el archivo de fuentes: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeSourceList(raw) {
  const sources = Array.isArray(raw) ? raw : raw.sources;
  if (!Array.isArray(sources)) return [];

  return sources
    .map(item => {
      if (typeof item === 'string') return { url: item };
      return item && typeof item === 'object' ? item : null;
    })
    .filter(Boolean)
    .map(item => ({
      url: String(item.url || '').trim(),
      title: String(item.title || item.titulo || '').trim(),
      source: String(item.source || item.fuente || 'Fuente oficial jurídica').trim(),
      materia: String(item.materia || '').trim(),
      modulo: String(item.modulo || 'normativa').trim(),
      reviewStatus: String(item.reviewStatus || 'approved').trim()
    }))
    .filter(item => /^https?:\/\//i.test(item.url));
}

function normalizeSeedUrlList(raw) {
  const seedUrls = Array.isArray(raw?.seedUrls) ? raw.seedUrls : [];
  return seedUrls
    .map(item => {
      if (typeof item === 'string') return item;
      return item?.url || '';
    })
    .map(item => String(item || '').trim())
    .filter(item => /^https?:\/\//i.test(item));
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function postFeed(batch, batchNumber) {
  const response = await fetch(`${apiBase}/api/legal-engine/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      urls: batch.map(item => item.url),
      limit: batch.length,
      autoApprove: true,
      reviewStatus: 'approved',
      source: `Fuentes oficiales juridicas - lote ${batchNumber}`,
      materia: batch[0]?.materia || '',
      modulo: batch[0]?.modulo || 'normativa'
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

async function postSeedFeed(seedUrls) {
  const response = await fetch(`${apiBase}/api/legal-engine/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      query: 'derecho peruano normas legales jurisprudencia juridica',
      seedUrls,
      limit: batchLimit,
      autoApprove: true,
      reviewStatus: 'approved',
      source: 'Fuentes oficiales juridicas - descubrimiento',
      materia: 'Derecho Peruano',
      modulo: 'normativa'
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

async function main() {
  const raw = readJson(feedFile);
  const sources = normalizeSourceList(raw);
  const seedUrls = normalizeSeedUrlList(raw);
  if (!sources.length && !seedUrls.length) {
    throw new Error(`No hay URLs directas ni seedUrls validas en ${feedFile}`);
  }

  console.log(`LEXIA official legal feeder`);
  console.log(`API: ${apiBase}`);
  console.log(`Archivo: ${feedFile}`);
  console.log(`Fuentes directas: ${sources.length}`);
  console.log(`Semillas de descubrimiento: ${seedUrls.length}`);
  console.log(`Lote maximo: ${batchLimit}`);

  const batches = chunk(sources, batchLimit);
  let totalIngested = 0;
  let totalFailed = 0;

  if (seedUrls.length) {
    console.log(`\nDescubriendo fuentes desde semillas...`);
    const result = await postSeedFeed(seedUrls);
    const ingested = Array.isArray(result.ingested) ? result.ingested.length : 0;
    const failed = Array.isArray(result.failed) ? result.failed.length : 0;
    totalIngested += ingested;
    totalFailed += failed;
    console.log(`  Ingeridas por descubrimiento: ${ingested}`);
    console.log(`  Fallidas por descubrimiento: ${failed}`);
    if (failed) {
      result.failed.forEach(item => console.warn(`  - ${item.url}: ${item.error}`));
    }
  }

  for (let index = 0; index < batches.length; index += 1) {
    const batchNumber = index + 1;
    const batch = batches[index];
    console.log(`\nLote ${batchNumber}/${batches.length}: ${batch.length} URLs`);
    const result = await postFeed(batch, batchNumber);
    const ingested = Array.isArray(result.ingested) ? result.ingested.length : 0;
    const failed = Array.isArray(result.failed) ? result.failed.length : 0;
    totalIngested += ingested;
    totalFailed += failed;
    console.log(`  Ingeridas: ${ingested}`);
    console.log(`  Fallidas: ${failed}`);
    if (failed) {
      result.failed.forEach(item => console.warn(`  - ${item.url}: ${item.error}`));
    }
  }

  console.log(`\nIngesta terminada. OK=${totalIngested}; fallidas=${totalFailed}`);
}

main().catch(error => {
  console.error(`Error alimentando LEXIA: ${error.message}`);
  process.exit(1);
});
