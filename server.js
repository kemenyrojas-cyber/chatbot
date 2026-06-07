require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const fetch = global.fetch || require('node-fetch');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;
const openAiKey = process.env.OPENAI_API_KEY;

if (!openAiKey) {
  console.warn('\n⚠️ WARNING: OPENAI_API_KEY no está configurada.');
  console.warn('Crea un archivo .env con: OPENAI_API_KEY=tu_clave_api\n');
}

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname)));

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
    const kbPath = path.join(__dirname, 'kb', file);
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
  const embPath = path.join(__dirname, 'kb', 'embeddings.json');
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
    const systemPrompt = `Eres LEXIA, un asistente jurídico EXPERTO alimentado con información completa de lpderecho.pe.

Especiaña en DERECHO PERUANO:
✓ Derecho Civil: Contratos, obligaciones, bienes, herencias, familia
✓ Derecho Penal: Delitos, penas, procedimiento penal
✓ Derecho Laboral: Trabajo, remuneración, seguridad social, despidos
✓ Derecho Comercial: Empresas, sociedades, quiebra
✓ Derecho Tributario: Impuestos, obligaciones fiscales
✓ Derecho Procesal: Juicios, recursos, medidas cautelares
✓ Derecho Administrativo: Actos, recursos, contratación
✓ Derecho Constitucional: Derechos fundamentales, garantías

INSTRUCCIONES:
✓ Proporciona respuestas basadas en lpderecho.pe y legislación vigente
✓ Cita artículos, jurisprudencia y sentencias cuando sea relevante
✓ Resuelve casos jurídicos con profundidad y precisión
✓ Siempre en español, profesional y técnico
✓ Advierte cuando se requiera consulta con especialista
✓ Nunca hagas valoraciones morales - solo análisis legal`;

    // RECUPERACIÓN DE CONTEXTO (búsqueda por relevancia)
    let retrieved = '';
    const promptLower = prompt.toLowerCase();
    
    // Búsqueda simple pero efectiva
    if (kbContent.length > 0) {
      const sentences = kbContent.split(/[.!?\n]+/);
      const relevant = sentences
        .filter(s => {
          const relevanceScore = (prompt.match(/\w+/g) || []).reduce((score, word) => {
            if (s.toLowerCase().includes(word)) score += 1;
            return score;
          }, 0);
          return relevanceScore > 0;
        })
        .slice(0, 5)
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
      console.error('❌ Error OpenAI:', errorBody);
      return res.status(502).json({ error: 'Error conectando con OpenAI' });
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
