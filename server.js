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
  console.warn('WARNING: OPENAI_API_KEY no está configurada. Crea un archivo .env con tu clave.');
}

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname)));

// Cargar KB plano
let kbContent = '';
try {
  const kbPath = path.join(__dirname, 'kb', 'legal_faqs.md');
  if (fs.existsSync(kbPath)) {
    const raw = fs.readFileSync(kbPath, 'utf8');
    kbContent = raw.replace(/\s+/g, ' ').trim().slice(0, 3000);
    console.log('LexIA: KB cargada,', kbContent.length, 'caracteres');
  }
} catch (e) {
  console.warn('LexIA: no se pudo cargar KB', e.message);
}

// Cargar embeddings precalculados si existen
let kbEmbeddings = null;
try {
  const embPath = path.join(__dirname, 'kb', 'embeddings.json');
  if (fs.existsSync(embPath)) {
    kbEmbeddings = JSON.parse(fs.readFileSync(embPath, 'utf8'));
    console.log('LexIA: embeddings cargados,', kbEmbeddings.length, 'items');
  }
} catch (e) {
  console.warn('LexIA: no se pudo cargar embeddings', e.message);
}

// utilidades
function dot(a, b) { return a.reduce((s, v, i) => s + v * b[i], 0); }
function norm(a) { return Math.sqrt(a.reduce((s, v) => s + v * v, 0)); }

// Detector sencillo de consultas jurídicas (basado en palabras clave)
function isLegalQuery(text) {
  if (!text) return false;
  const keywords = ['contrato','compraventa','derecho','juzgado','demanda','abogado','inmueble','despido','salario','laboral','tribut','penal','delito','fiscal','familia','alimentos','divorcio','custodia','testamento','herencia','responsabilidad','juicio','sentencia','reclam','arrendamiento','saneamiento','vicios'];
  const t = text.toLowerCase();
  let hits = 0;
  for (const k of keywords) {
    if (t.includes(k)) hits++;
  }
  return hits > 0;
}

app.post('/api/chat', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt || !prompt.trim()) return res.status(400).json({ error: 'El prompt es obligatorio.' });
    if (!openAiKey) return res.status(500).json({ error: 'La API key no está configurada en el servidor.' });

    // Rechazar consultas que no sean sobre derecho
    if (!isLegalQuery(prompt)) {
      return res.json({ answer: 'Lo siento, solo respondo consultas relacionadas con derecho. Por favor reformula la pregunta como una consulta jurídica o incluye términos legales.' });
    }

    // Config
    const model = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
    const embModel = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
    const temperature = Number(process.env.OPENAI_TEMPERATURE || 0.0);

    // Sistema base (instrucciones)
    const systemBase = `Eres LexIA, un asistente experto en derecho (civil, laboral, penal, administrativo y de familia). Responde siempre en español con claridad y profesionalismo. Antes de dar una respuesta sustantiva, pide aclaraciones necesarias (por ejemplo: jurisdicción/país, fechas o documentos relevantes) si la consulta es ambigua. Entrega respuestas estructuradas en cuatro secciones cuando sea pertinente: 1) Resumen breve, 2) Pasos prácticos recomendados, 3) Riesgos y advertencias legales, 4) Referencias generales. No proporciones asesoramiento jurídico vinculante; sugiere consultar a un abogado para casos concretos.`;

    // Recuperación semántica (si hay embeddings)
    let retrieved = '';
    if (kbEmbeddings && kbEmbeddings.length > 0) {
      try {
        const embRes = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openAiKey}` },
          body: JSON.stringify({ model: embModel, input: prompt })
        });
        if (!embRes.ok) {
          const body = await embRes.text();
          console.warn('Error embeddings query:', body);
        } else {
          const embJson = await embRes.json();
          const qEmb = embJson.data?.[0]?.embedding;
          if (qEmb) {
            const scores = kbEmbeddings.map(item => ({
              id: item.id,
              score: dot(qEmb, item.embedding) / (norm(qEmb) * norm(item.embedding)),
              text: item.text
            }));
            scores.sort((a, b) => b.score - a.score);
            const top = scores.slice(0, 4);
            retrieved = top.map(t => `- (score:${t.score.toFixed(3)}) ${t.text}`).join('\n');
            console.log('LexIA: recuperados', top.length, 'fragmentos relevantes');
          }
        }
      } catch (e) {
        console.warn('Error en búsqueda semántica:', e.message);
      }
    }

    const contextForSystem = retrieved ? `Documentos relevantes:\n${retrieved}\n\n` : '';
    const systemFull = kbContent ? systemBase + '\n\nContexto KB:\n' + kbContent : systemBase;

    // Llamada a la API de chat
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openAiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: contextForSystem + systemFull },
          { role: 'user', content: prompt }
        ],
        max_tokens: 800,
        temperature
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Error de OpenAI:', errorBody);
      let errorMessage = 'Error al conectar con la API de OpenAI.';
      try {
        const parsed = JSON.parse(errorBody);
        if (parsed?.error?.message) errorMessage = parsed.error.message;
      } catch {}
      return res.status(502).json({ error: errorMessage });
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.trim() || 'No recibí respuesta de la API.';
    res.json({ answer });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.listen(port, () => {
  console.log(`Servidor iniciado en http://localhost:${port}`);
});
