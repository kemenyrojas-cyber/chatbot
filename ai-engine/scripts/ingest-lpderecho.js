/**
 * LEXIA - LP Derecho ingestion
 *
 * Feeds ai-engine/kb/legal_knowledge_base.json with structured records used by
 * /api/legal-search and the /api/chat local fallback.
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const LPDERECHO_BASE = 'https://lpderecho.pe';
const KB_DIR = path.join(__dirname, '..', 'kb');
const LEGAL_KB_PATH = path.join(KB_DIR, 'legal_knowledge_base.json');
const INDEX_PATH = path.join(KB_DIR, 'lpderecho_index.md');
const CONTENT_PATH = path.join(KB_DIR, 'lpderecho_content.md');
const SEED_PATH = path.join(KB_DIR, 'lpderecho_seed.json');

const MAX_PAGES = Number.parseInt(process.env.LPDERECHO_MAX_PAGES || '2', 10);
const MAX_ARTICLES = Number.parseInt(process.env.LPDERECHO_MAX_ARTICLES || '40', 10);
const REQUEST_DELAY_MS = Number.parseInt(process.env.LPDERECHO_DELAY_MS || '500', 10);

const CATEGORIES = [
  { slug: 'civil', materia: 'Derecho Civil' },
  { slug: 'penal', materia: 'Derecho Penal' },
  { slug: 'laboral', materia: 'Derecho Laboral' },
  { slug: 'constitucional', materia: 'Derecho Constitucional' },
  { slug: 'administrativo', materia: 'Derecho Administrativo' },
  { slug: 'civil/procesal-civil', materia: 'Derecho Procesal Civil' },
  { slug: 'jurisprudencia', materia: 'Jurisprudencia' },
  { slug: 'jurisprudencia/casacion', materia: 'Casaciones' },
  { slug: 'legislacion', materia: 'Legislacion' },
];

const KB_SHAPE = {
  normativa: [],
  jurisprudencia: [],
  casaciones: [],
  sentencias_tc: [],
};

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeForSearch(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isPromotionalArticle(article) {
  const text = normalizeForSearch(`${article.title || ''} ${article.url || ''}`);
  return /(^|\s)(curso|cursos|diplomado|diplomados|profa)(\s|$)/.test(text)
    || /(clase modelo|libros gratis|pago en dos cuotas|llena el formulario|preparacion examen|aspirantes a notarios|preguntas y respuestas|preguntas respuestas|codex laboral|nuevos diplomados)/.test(text);
}

function cleanLpDerechoContent(value) {
  return normalizeText(value)
    .replace(/Matric[uú]late:\s*.*?(?=(La norma|El |Artículo|LEY|Decreto|Resoluci[oó]n|Asimismo|Adem[aá]s|En |$))/gi, '')
    .replace(/Hasta el\s+\d{1,2}\s+[A-ZÁÉÍÓÚ]{3,}\s+libros gratis y pago en dos cuotas/gi, '')
    .replace(/Inscr[ií]bete aqu[ií]\s+M[aá]s informaci[oó]n/gi, '')
    .replace(/Llena el formulario.*?(?=(La norma|El |Artículo|LEY|Decreto|Resoluci[oó]n|Asimismo|Adem[aá]s|En |$))/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(value) {
  return normalizeForSearch(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function absoluteUrl(url) {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  if (url.startsWith('/')) return `${LPDERECHO_BASE}${url}`;
  return `${LPDERECHO_BASE}/${url}`;
}

function matterFromCategory(category, title) {
  if (category.materia && category.materia !== 'Jurisprudencia' && category.materia !== 'Casaciones' && category.materia !== 'Legislacion') {
    return category.materia;
  }

  const source = normalizeForSearch(`${category.slug} ${category.materia} ${title}`);
  if (source.includes('penal')) return 'Derecho Penal';
  if (source.includes('laboral')) return 'Derecho Laboral';
  if (source.includes('constitucional') || source.includes('tribunal constitucional')) return 'Derecho Constitucional';
  if (source.includes('administrativo')) return 'Derecho Administrativo';
  if (source.includes('procesal')) return 'Derecho Procesal';
  if (source.includes('civil')) return 'Derecho Civil';
  return 'Derecho Peruano';
}

function moduleForArticle(article) {
  const source = normalizeForSearch(`${article.categorySlug} ${article.categoryName} ${article.title} ${article.url} ${article.content}`);

  if (source.includes('casacion') || source.includes('casaciones')) return 'casaciones';
  if (
    source.includes('tribunal constitucional') ||
    source.includes('sentencia tc') ||
    source.includes('expediente tc') ||
    source.includes('/tc/')
  ) {
    return 'sentencias_tc';
  }
  if (
    source.includes('jurisprudencia') ||
    source.includes('precedente') ||
    source.includes('sentencia') ||
    source.includes('corte suprema')
  ) {
    return 'jurisprudencia';
  }
  return 'normativa';
}

function loadLegalKb() {
  if (!fs.existsSync(LEGAL_KB_PATH)) return { ...KB_SHAPE };

  const parsed = JSON.parse(fs.readFileSync(LEGAL_KB_PATH, 'utf8'));
  return {
    normativa: Array.isArray(parsed.normativa) ? parsed.normativa : [],
    jurisprudencia: Array.isArray(parsed.jurisprudencia) ? parsed.jurisprudencia : [],
    casaciones: Array.isArray(parsed.casaciones) ? parsed.casaciones : [],
    sentencias_tc: Array.isArray(parsed.sentencias_tc) ? parsed.sentencias_tc : [],
  };
}

function loadSeedArticles() {
  if (!fs.existsSync(SEED_PATH)) return [];

  const parsed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
  if (!Array.isArray(parsed)) return [];

  return parsed.map(article => ({
    title: article.titulo || article.title,
    url: article.url,
    excerpt: article.resumen || article.excerpt || '',
    date: article.fecha || article.date || '',
    content: article.contenido || article.content || article.resumen || article.titulo || '',
    categorySlug: article.categoria_slug || article.categorySlug || 'lpderecho-seed',
    categoryName: article.materia || article.categoryName || 'Derecho Peruano',
  })).filter(article => article.title && article.url);
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'es-PE,es;q=0.9,en;q=0.8',
    },
    timeout: 20000,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  return response.text();
}

function extractArticlesFromList(html, category) {
  const $ = cheerio.load(html);
  const articles = [];

  $('article, .post, .td_module_wrap, .jeg_post, .entry').each((_, element) => {
    const title = normalizeText(
      $(element).find('h1 a, h2 a, h3 a, .entry-title a, .post-title a').first().text()
        || $(element).find('h1, h2, h3, .entry-title, .post-title').first().text()
    );
    const link = absoluteUrl($(element).find('h1 a, h2 a, h3 a, .entry-title a, .post-title a, a').first().attr('href'));
    const excerpt = normalizeText($(element).find('p, .entry-summary, .td-excerpt, .post-excerpt').first().text());
    const date = normalizeText($(element).find('time, .entry-date, .post-date, .td-post-date').first().text());

    if (title && link && link.startsWith(LPDERECHO_BASE)) {
      articles.push({
        title,
        url: link,
        excerpt,
        date,
        categorySlug: category.slug,
        categoryName: category.materia,
      });
    }
  });

  return articles;
}

async function scrapeCategory(category) {
  const articles = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const pagePath = page === 1 ? '' : `page/${page}/`;
    const url = `${LPDERECHO_BASE}/category/${category.slug}/${pagePath}`;
    try {
      console.log(`[LP Derecho] ${category.slug} pagina ${page}`);
      const html = await fetchHtml(url);
      const pageArticles = extractArticlesFromList(html, category);

      if (pageArticles.length === 0) break;
      articles.push(...pageArticles);
      await delay(REQUEST_DELAY_MS);
    } catch (error) {
      console.warn(`[LP Derecho] No se pudo leer ${url}: ${error.message}`);
      break;
    }
  }

  return articles;
}

async function scrapeArticleContent(article) {
  try {
    const html = await fetchHtml(article.url);
    const $ = cheerio.load(html);

    const title = normalizeText($('h1').first().text()) || article.title;
    const date = normalizeText($('time, .entry-date, .post-date, .td-post-date').first().text()) || article.date;
    const selectors = ['article .entry-content', '.entry-content', '.td-post-content', 'article', 'main'];
    let content = '';

    for (const selector of selectors) {
      const element = $(selector).first();
      if (element.length) {
        element.find('script, style, nav, iframe, form, .ads, .advertisement, .sharedaddy, .related-posts').remove();
        content = normalizeText(element.text());
        if (content.length > 300) break;
      }
    }

    return {
      ...article,
      title,
      date,
      content: content.slice(0, 5000),
    };
  } catch (error) {
    console.warn(`[LP Derecho] No se pudo leer articulo ${article.url}: ${error.message}`);
    return {
      ...article,
      content: article.excerpt || '',
    };
  }
}

function buildRecord(article, moduleName) {
  const readableModule = moduleName.replace('_', '-');
  const id = `lpderecho-${readableModule}-${slugify(article.title || article.url)}`;
  const content = cleanLpDerechoContent(article.content || article.excerpt);
  const summary = cleanLpDerechoContent(article.excerpt || content.slice(0, 240));

  return {
    id,
    titulo: article.title,
    materia: matterFromCategory({ slug: article.categorySlug, materia: article.categoryName }, article.title),
    fecha: article.date || '',
    fuente: 'LP Derecho',
    url: article.url,
    contenido: content,
    resumen: summary || article.title,
  };
}

function mergeRecords(legalKb, recordsByModule) {
  const existingUrls = new Set();
  const existingIds = new Set();

  for (const entries of Object.values(legalKb)) {
    for (const entry of entries) {
      if (entry.url) existingUrls.add(entry.url);
      if (entry.id) existingIds.add(entry.id);
    }
  }

  for (const [moduleName, entries] of Object.entries(legalKb)) {
    legalKb[moduleName] = entries
      .filter(entry => !(entry.fuente === 'LP Derecho' && isPromotionalArticle({
        title: entry.titulo,
        url: entry.url
      })))
      .map(entry => {
        if (entry.fuente !== 'LP Derecho') return entry;
        return {
          ...entry,
          contenido: cleanLpDerechoContent(entry.contenido),
          resumen: cleanLpDerechoContent(entry.resumen),
        };
      });
  }

  const added = {
    normativa: 0,
    jurisprudencia: 0,
    casaciones: 0,
    sentencias_tc: 0,
  };

  for (const [moduleName, records] of Object.entries(recordsByModule)) {
    for (const record of records) {
      if (existingUrls.has(record.url) || existingIds.has(record.id)) continue;

      legalKb[moduleName].push(record);
      existingUrls.add(record.url);
      existingIds.add(record.id);
      added[moduleName] += 1;
    }
  }

  return added;
}

function writeMarkdownIndex(articles) {
  const now = new Date().toISOString();
  const lines = [
    '# LP Derecho - Indice de ingestion',
    '',
    `Fecha de ingestion: ${now}`,
    `Articulos procesados: ${articles.length}`,
    '',
  ];

  articles.forEach((article, index) => {
    lines.push(`${index + 1}. [${article.title}](${article.url}) - ${article.categoryName}`);
  });

  fs.writeFileSync(INDEX_PATH, `${lines.join('\n')}\n`, 'utf8');
}

function writeMarkdownContent(articles) {
  const lines = [
    '# LP Derecho - Contenido procesado',
    '',
    'Este archivo es una vista legible de los registros integrados en legal_knowledge_base.json.',
    '',
  ];

  for (const article of articles) {
    lines.push(`## ${article.title}`);
    lines.push('');
    lines.push(`Fuente: ${article.url}`);
    lines.push(`Categoria: ${article.categoryName}`);
    if (article.date) lines.push(`Fecha: ${article.date}`);
    lines.push('');
    lines.push(article.content || article.excerpt || '');
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  fs.writeFileSync(CONTENT_PATH, `${lines.join('\n')}\n`, 'utf8');
}

async function main() {
  fs.mkdirSync(KB_DIR, { recursive: true });

  console.log('LEXIA - Ingestion LP Derecho');
  console.log(`Categorias: ${CATEGORIES.length}`);
  console.log(`Paginas por categoria: ${MAX_PAGES}`);
  console.log(`Maximo de articulos con contenido: ${MAX_ARTICLES}`);

  const discovered = [];
  for (const category of CATEGORIES) {
    const categoryArticles = await scrapeCategory(category);
    discovered.push(...categoryArticles);
  }

  const seedArticles = loadSeedArticles();
  if (seedArticles.length > 0) {
    console.log(`[LP Derecho] semillas locales cargadas: ${seedArticles.length}`);
    discovered.push(...seedArticles);
  }

  const uniqueByUrl = new Map();
  for (const article of discovered) {
    if (!uniqueByUrl.has(article.url)) uniqueByUrl.set(article.url, article);
  }

  const selected = Array.from(uniqueByUrl.values())
    .filter(article => !isPromotionalArticle(article))
    .slice(0, MAX_ARTICLES);
  const enriched = [];

  for (let i = 0; i < selected.length; i += 1) {
    const article = selected[i];
    console.log(`[LP Derecho] articulo ${i + 1}/${selected.length}: ${article.title.slice(0, 70)}`);
    if (article.content) {
      enriched.push(article);
    } else {
      enriched.push(await scrapeArticleContent(article));
    }
    await delay(REQUEST_DELAY_MS);
  }

  const recordsByModule = {
    normativa: [],
    jurisprudencia: [],
    casaciones: [],
    sentencias_tc: [],
  };

  for (const article of enriched) {
    const moduleName = moduleForArticle(article);
    const record = buildRecord(article, moduleName);
    if (record.titulo && record.url && record.contenido) {
      recordsByModule[moduleName].push(record);
    }
  }

  const legalKb = loadLegalKb();
  const added = mergeRecords(legalKb, recordsByModule);

  fs.writeFileSync(LEGAL_KB_PATH, `${JSON.stringify(legalKb, null, 2)}\n`, 'utf8');
  writeMarkdownIndex(enriched);
  writeMarkdownContent(enriched);

  console.log('Ingestion completada.');
  console.log(`Nuevos registros: normativa=${added.normativa}, jurisprudencia=${added.jurisprudencia}, casaciones=${added.casaciones}, sentencias_tc=${added.sentencias_tc}`);
  console.log(`Base actualizada: ${LEGAL_KB_PATH}`);
}

main().catch(error => {
  console.error('Error fatal en ingestion LP Derecho:', error);
  process.exit(1);
});
