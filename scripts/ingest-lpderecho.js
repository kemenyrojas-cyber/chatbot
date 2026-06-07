/**
 * LEXIA - Chatbot Legal Inteligente
 * Alimentado por lpderecho.pe y OpenAI
 * 
 * Este script extrae TODA la información disponible de lpderecho.pe
 * para proporcionar respuestas jurídicas completas y precisas
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const LPDERECHO_BASE = 'https://lpderecho.pe';
const KB_PATH = path.join(__dirname, '..', 'kb', 'lpderecho_content.md');
const KB_CASES_PATH = path.join(__dirname, '..', 'kb', 'lpderecho_cases.md');
const KB_SENTENCIAS_PATH = path.join(__dirname, '..', 'kb', 'lpderecho_sentencias.md');

// TODAS las categorías de lpderecho.pe para extracción completa
const CATEGORIES = [
  'articulos',
  'revista-lp-derecho',
  'derecho-constitucional',
  'derecho-civil',
  'derecho-penal',
  'derecho-laboral',
  'derecho-administrativo',
  'derecho-comercial',
  'derecho-tributario',
  'derecho-procesal',
  'derecho-mercantil',
  'derecho-ambiental',
  'derecho-notarial',
  'derecho-registral',
  'derecho-aduanal',
  'derecho-migratorio',
  'derecho-internacional',
  'jurisprudencia',
  'legislacion'
];

/**
 * Extrae TODOS los artículos de una categoría (todas las páginas)
 */
async function scrapeAllPages(category, maxPages = 5) {
  const allArticles = [];
  
  for (let page = 1; page <= maxPages; page++) {
    try {
      console.log(`📥 [${category}] Página ${page}...`);
      const url = `${LPDERECHO_BASE}/category/${category}/page/${page}/`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (!response.ok) break; // Si falla, asumimos que no hay más páginas

      const html = await response.text();
      const $ = cheerio.load(html);
      
      const pageArticles = [];
      
      // Extrae TODOS los artículos de la página
      $('article, .post, .entry, .post-item, .article-item').each((index, element) => {
        try {
          // Intenta múltiples selectores para mayor compatibilidad
          let title = '';
          let excerpt = '';
          let url = '';
          let date = '';
          let author = '';

          // Título
          title = $(element).find('h2 a, h3 a, .post-title a, .entry-title a').first().text().trim();
          if (!title) {
            title = $(element).find('h2, h3, .title').first().text().trim();
          }

          // Resumen/Excerpt
          excerpt = $(element).find('p, .excerpt, .post-excerpt').first().text().trim();

          // URL
          url = $(element).find('a').first().attr('href') || '';

          // Fecha
          date = $(element).find('time, .date, .post-date').first().text().trim();

          // Autor
          author = $(element).find('.author, .by-author, .meta-author').first().text().trim();

          if (title && url) {
            pageArticles.push({
              title,
              excerpt: excerpt || 'Sin resumen disponible',
              url,
              date: date || 'Fecha no especificada',
              author: author || 'Autor no especificado',
              category
            });
          }
        } catch (e) {
          console.warn(`⚠️ Error procesando elemento:`, e.message);
        }
      });

      if (pageArticles.length === 0) break; // Si no hay artículos, detener
      
      allArticles.push(...pageArticles);
      console.log(`✅ ${pageArticles.length} artículos encontrados en página ${page}`);
      
      // Pausa para no sobrecargar
      await new Promise(resolve => setTimeout(resolve, 800));
    } catch (error) {
      console.warn(`⚠️ Error en página ${page}:`, error.message);
      break;
    }
  }
  
  return allArticles;
}

/**
 * Extrae contenido COMPLETO de un artículo
 */
async function scrapeArticleContent(url) {
  try {
    if (!url || !url.startsWith('http')) return '';

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 15000
    });

    if (!response.ok) return '';

    const html = await response.text();
    const $ = cheerio.load(html);
    
    // Extrae TODO el contenido
    let content = '';
    const contentSelectors = [
      'article',
      '.post-content',
      '.entry-content',
      '.content-article',
      'main',
      '.article-body'
    ];

    for (const selector of contentSelectors) {
      const el = $(selector).first();
      if (el.length) {
        el.find('script, style, .ads, .advertisement').remove();
        content = el.text();
        break;
      }
    }

    return content.substring(0, 3500).trim(); // Contenido completo hasta 3500 caracteres
  } catch (error) {
    console.warn(`⚠️ Error extrayendo ${url}:`, error.message);
    return '';
  }
}

/**
 * Extrae jurisprudencia y sentencias
 */
async function scrapeCaselaw() {
  console.log('\n📋 Extrayendo jurisprudencia y sentencias...');
  
  try {
    const response = await fetch(`${LPDERECHO_BASE}/category/jurisprudencia/`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) return '';

    const html = await response.text();
    const $ = cheerio.load(html);
    
    let caseslawContent = '# JURISPRUDENCIA Y SENTENCIAS RELEVANTES\n\n';
    
    $('article, .post').each((index, element) => {
      const title = $(element).find('h2 a, h3 a').first().text().trim();
      const excerpt = $(element).find('p').first().text().trim();
      const url = $(element).find('a').first().attr('href');
      
      if (title) {
        caseslawContent += `## ${title}\n\n`;
        if (excerpt) {
          caseslawContent += `${excerpt}\n\n`;
        }
        if (url) {
          caseslawContent += `[Leer más](${url})\n\n`;
        }
        caseslawContent += '---\n\n';
      }
    });

    return caseslawContent;
  } catch (error) {
    console.warn(`⚠️ Error extrayendo jurisprudencia:`, error.message);
    return '';
  }
}

/**
 * FUNCIÓN PRINCIPAL: Extrae TODA la información disponible
 */
async function buildCompleteKnowledgeBase() {
  console.log('\n' + '='.repeat(70));
  console.log('🚀 LEXIA - EXTRAYENDO TODA LA INFORMACIÓN DE LPDERECHO.PE');
  console.log('='.repeat(70) + '\n');

  let allArticles = [];
  const startTime = Date.now();
  
  // EXTRAE de TODAS las categorías
  console.log(`📥 Extrayendo de ${CATEGORIES.length} categorías...\n`);
  
  for (const category of CATEGORIES) {
    try {
      console.log(`\n💨 Categoría: ${category.toUpperCase()}`);
      console.log('-'.repeat(40));
      
      const articles = await scrapeAllPages(category, 3); // 3 páginas por categoría
      allArticles = allArticles.concat(articles);
      
      console.log(`✅ ${articles.length} artículos de ${category}`);
    } catch (error) {
      console.error(`❌ Error en categoría ${category}:`, error.message);
    }
  }

  console.log(`\n📊 TOTAL DE ARTÍCULOS RECOLECTADOS: ${allArticles.length}\n`);

  // EXTRAE contenido detallado de artículos
  console.log(`📖 Extrayendo contenido detallado (esto puede tardar unos minutos)...`);
  const articlesWithContent = [];
  
  // Procesa los primeros 50 artículos con mayor relevancia
  for (let i = 0; i < Math.min(allArticles.length, 50); i++) {
    const article = allArticles[i];
    
    if (article.url) {
      process.stdout.write(`\r📖 Procesando: ${i + 1}/50 - ${article.title.substring(0, 45)}...`);
      
      const content = await scrapeArticleContent(article.url);
      
      if (content) {
        articlesWithContent.push({
          ...article,
          content
        });
      }
      
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  
  console.log(`\n✅ ${articlesWithContent.length} artículos con contenido completo\n`);

  // EXTRAE jurisprudencia
  const caselaw = await scrapeCaselaw();

  // GENERA archivo principal
  let markdown = `# 🚀 LEXIA - BASE DE CONOCIMIENTO COMPLETA\n\n`;
  markdown += `> **Información completa extraída de [lpderecho.pe](https://lpderecho.pe)**\n`;
  markdown += `> Portal legal más leído del Perú\n\n`;
  markdown += `⚡ **Fecha de extracción:** ${new Date().toLocaleString('es-PE')}\n`;
  markdown += `📋 **Artículos procesados:** ${articlesWithContent.length}\n`;
  markdown += `📚 **Artículos indexados:** ${allArticles.length}\n`;
  markdown += `⏱️ **Tiempo de procesamiento:** ${((Date.now() - startTime) / 1000).toFixed(1)}s\n\n`;
  markdown += `---\n\n`;

  // Agrupa por categoría
  const byCategory = {};
  articlesWithContent.forEach(article => {
    if (!byCategory[article.category]) {
      byCategory[article.category] = [];
    }
    byCategory[article.category].push(article);
  });

  // Escribe por categoría
  for (const [category, articles] of Object.entries(byCategory)) {
    markdown += `\n## 📋 ${category.replace(/-/g, ' ').toUpperCase()}\n\n`;
    markdown += `**${articles.length} artículos**\n\n`;
    
    articles.forEach(article => {
      markdown += `### ${article.title}\n\n`;
      markdown += `**Autor:** ${article.author} | **Fecha:** ${article.date}\n\n`;
      
      if (article.excerpt && article.excerpt !== 'Sin resumen disponible') {
        markdown += `**Resumen:** ${article.excerpt}\n\n`;
      }
      
      if (article.content) {
        markdown += `**Contenido:**\n\n${article.content}\n\n`;
      }
      
      markdown += `🔗 [Ver artículo completo](${article.url})\n\n`;
      markdown += `---\n\n`;
    });
  }

  // Añade jurisprudencia
  if (caselaw) {
    markdown += `\n${caselaw}`;
  }

  // Guarda archivos
  fs.writeFileSync(KB_PATH, markdown, 'utf8');
  console.log(`\n✅ Base de conocimiento principal guardada: ${KB_PATH}`);
  console.log(`📄 Tamaño: ${(markdown.length / 1024).toFixed(2)} KB`);

  // Índice de TODOS los artículos
  let indexMD = `# 📚 ÍNDICE COMPLETO DE ARTÍCULOS - LPDERECHO.PE\n\n`;
  indexMD += `**Total de artículos indexados:** ${allArticles.length}\n\n`;
  
  allArticles.forEach((article, idx) => {
    indexMD += `${idx + 1}. [${article.title}](${article.url}) - *${article.category}*\n`;
  });

  fs.writeFileSync(
    path.join(__dirname, '..', 'kb', 'lpderecho_index.md'),
    indexMD,
    'utf8'
  );
  console.log(`✅ Índice de artículos guardado: kb/lpderecho_index.md`);

  console.log('\n' + '='.repeat(70));
  console.log('✅ EXTRACCIÓN COMPLETADA EXITOSAMENTE');
  console.log('='.repeat(70) + '\n');
  
  console.log(`📄 Archivos generados:`);
  console.log(`   1. kb/lpderecho_content.md - Contenido completo (${(markdown.length / 1024).toFixed(2)} KB)`);
  console.log(`   2. kb/lpderecho_index.md - Índice de todos los artículos`);
  console.log(`\n🚀 LEXIA está listo para responder consultas jurídicas complejas!\n`);
}

// EJECUTA LA EXTRACCIÓN COMPLETA
buildCompleteKnowledgeBase().catch(err => {
  console.error('\n❌ ERROR FATAL:', err);
  process.exit(1);
});
