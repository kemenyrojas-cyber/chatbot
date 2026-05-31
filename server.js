require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require('fs');
const fetch = global.fetch || require("node-fetch");
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;
const openAiKey = process.env.OPENAI_API_KEY;

if (!openAiKey) {
  console.warn("WARNING: OPENAI_API_KEY no está configurada. Crea un archivo .env con tu clave.");
}

app.use(express.json());
// Habilitar CORS para permitir que el frontend en GitHub Pages (u otros origenes) haga peticiones
app.use(cors());
app.use(express.static(path.join(__dirname)));

// Cargar base de conocimientos (si existe) y truncar para evitar exceso de contexto
let kbContent = "";
try {
  const kbPath = path.join(__dirname, 'kb', 'legal_faqs.md');
  if (fs.existsSync(kbPath)) {
    const raw = fs.readFileSync(kbPath, 'utf8');
    kbContent = raw.replace(/\s+/g, ' ').trim().slice(0, 3000); // mantener hasta 3000 chars
    console.log('LexIA: KB cargada,', kbContent.length, 'caracteres');
  }
} catch (e) {
  console.warn('LexIA: no se pudo cargar KB', e.message);
}

app.post("/api/chat", async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: "El prompt es obligatorio." });
    }

    if (!openAiKey) {
      return res.status(500).json({ error: "La API key no está configurada en el servidor." });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openAiKey}`,
      },
      body: JSON.stringify({
const model = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
const systemBase = `Eres LexIA, un asistente experto en derecho (civil, laboral, penal, administrativo y de familia). Responde siempre en español con claridad y profesionalismo. Antes de dar una respuesta sustantiva, pide aclaraciones necesarias (por ejemplo: jurisdicción/pais, fechas o documentos relevantes) si la consulta es ambigua. Entrega respuestas estructuradas en cuatro secciones cuando sea pertinente: 1) Resumen breve, 2) Pasos prácticos recomendados, 3) Riesgos y advertencias legales, 4) Referencias generales. No proporciones asesoramiento jurídico vinculante; siempre sugiere consultar a un abogado para casos concretos. Si no conoces la jurisdicción, pregunta o indica que las reglas pueden variar según el país.`;
const systemFull = kbContent ? systemBase + "\n\nContexto de conocimiento:\n" + kbContent : systemBase;
        model: model,
        messages: [
          { role: "system", content: kbContent ? `Eres un asistente experto en derecho. Responde siempre en español con claridad y profesionalismo.\n\nReferencias de conocimiento:\n${kbContent}` : "Eres un asistente experto en derecho. Responde siempre en español con claridad y profesionalismo." },
          { role: "user", content: prompt }
        ],
        max_tokens: 800,
        temperature: Number(process.env.OPENAI_TEMPERATURE || 0.0),
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("Error de OpenAI:", errorBody);
      let errorMessage = "Error al conectar con la API de OpenAI.";
      try {
        const parsedError = JSON.parse(errorBody);
        if (parsedError?.error?.message) {
          errorMessage = parsedError.error.message;
        }
      } catch {
        // Mantener mensaje genérico si no es JSON.
      }
      return res.status(502).json({ error: errorMessage });
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.trim() || "No recibí respuesta de la API.";

    res.json({ answer });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

app.listen(port, () => {
  console.log(`Servidor iniciado en http://localhost:${port}`);
});
