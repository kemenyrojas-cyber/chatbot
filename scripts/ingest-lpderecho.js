/**
 * Script para extraer contenido de lpderecho.pe
 * y alimentar la base de conocimiento de LexIA
 * 
 * Uso: node scripts/ingest-lpderecho.js
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const LPDERECHO_BASE = 'https://lpderecho.pe';
const KB_PATH = path.join(__dirname, '..', 'kb', 'lpderecho_content.md');

// Categorías principales de lpderecho.pe
const CATEGORIES = [
  'articulos',
  'revista-lp-derecho',
  'derecho-constitucional',
  'derecho-civil',
  'derecho-penal',
  'derecho-laboral',
  'derecho-administrativo',
  'derecho-comercial'
];

/**
 * Extrae artículos de una categoría de lpderecho.pe
 */
async function scrapeCategory(category) {
  try {
    console.log(`📥 Extrayendo artículos de: ${category}`);
    const url = `${LPDERECHO_BASE}/category/${category}/`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      console.warn(`⚠️ No se pudo acceder a ${category}: ${response.status}`);
      return [];
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    
    const articles = [];
    
    // Extrae títulos y URLs de artículos
    $('article, .post, .entry').each((index, element) => {
      const titleEl = $(element).find('h2, h3, .title').first();
      const excerptEl = $(element).find('p, .excerpt').first();
      const linkEl = $(element).find('a').first();
      
      if (titleEl.length && linkEl.length) {
        articles.push({
          title: titleEl.text().trim(),
          excerpt: excerptEl.text().trim(),
          url: linkEl.attr('href') || '',
          category: category
        });
      }
    });

    console.log(`✅ ${articles.length} artículos extraídos de ${category}`);
    return articles;
  } catch (error) {
    console.error(`❌ Error extrayendo ${category}:`, error.message);
    return [];
  }
}

/**
 * Extrae contenido detallado de un artículo
 */
async function scrapeArticle(url) {
  try {
    if (!url || !url.startsWith('http')) return '';

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });

    if (!response.ok) return '';

    const html = await response.text();
    const $ = cheerio.load(html);
    
    // Extrae contenido principal
    let content = '';
    const contentEl = $('article, .post-content, .entry-content, main').first();
    
    if (contentEl.length) {
      // Limpia scripts y estilos
      contentEl.find('script, style').remove();
      
      // Extrae párrafos
      const paragraphs = contentEl.find('p').map((i, el) => $(el).text()).get();
      content = paragraphs.join('\n\n');
    }

    return content.substring(0, 2000); // Limita a 2000 caracteres
  } catch (error) {
    console.warn(`⚠️ Error extrayendo artículo ${url}:`, error.message);
    return '';
  }
}

/**
 * Procesa todos los artículos y crea base de conocimiento
 */
async function buildKnowledgeBase() {
  console.log('🚀 Iniciando extracción de lpderecho.pe...\n');

  let allArticles = [];
  
  // Extrae artículos de cada categoría
  for (const category of CATEGORIES) {
    const articles = await scrapeCategory(category);
    allArticles = allArticles.concat(articles);
    
    // Pausa para no sobrecargar el servidor
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`\n📊 Total de artículos encontrados: ${allArticles.length}`);

  // Extrae contenido detallado (solo los primeros 20 para no tardar)
  console.log('\n📖 Extrayendo contenido detallado de artículos...');
  const detailedArticles = [];
  
  for (let i = 0; i < Math.min(allArticles.length, 20); i++) {
    const article = allArticles[i];
    if (article.url) {
      console.log(`${i + 1}/20: ${article.title.substring(0, 50)}...`);
      const content = await scrapeArticle(article.url);
      
      if (content) {
        detailedArticles.push({
          ...article,
          content: content
        });
      }
    }
    
    // Pausa entre solicitudes
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Genera markdown con el contenido
  let markdown = `# Base de Conocimiento - LP Derecho (lpderecho.pe)\n\n`;
  markdown += `> Contenido extraído de [lpderecho.pe](https://lpderecho.pe) - Portal legal más leído del Perú\n\n`;
  markdown += `**Fecha de extracción:** ${new Date().toLocaleString('es-PE')}\n\n`;
  markdown += `**Total de artículos procesados:** ${detailedArticles.length}\n\n`;

  // Agrupa por categoría
  const byCategory = {};\n  
  detailedArticles.forEach(article => {
    if (!byCategory[article.category]) {
      byCategory[article.category] = [];\n    }
    byCategory[article.category].push(article);
  });

  // Escribe contenido por categoría
  for (const [category, articles] of Object.entries(byCategory)) {
    markdown += `## ${category.replace(/-/g, ' ').toUpperCase()}\n\n`;
    
    articles.forEach(article => {
      markdown += `### ${article.title}\n\n`;
      if (article.excerpt) {
        markdown += `**Resumen:** ${article.excerpt}\n\n`;
      }
      if (article.content) {
        markdown += `**Contenido:**\n${article.content}\n\n`;
      }
      if (article.url) {
        markdown += `[Ver artículo completo](${article.url})\n\n`;
      }
      markdown += `---\n\n`;
    });
  }

  // Guarda archivo
  fs.writeFileSync(KB_PATH, markdown, 'utf8');
  console.log(`\n✅ Base de conocimiento guardada en: ${KB_PATH}`);
  console.log(`📄 Tamaño: ${(markdown.length / 1024).toFixed(2)} KB`);
}

// Ejecuta
buildKnowledgeBase().catch(err => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
