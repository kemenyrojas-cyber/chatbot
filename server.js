require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require('fs');
const fetch = global.fetch || require("node-fetch");

const app = express();
const port = process.env.PORT || 3000;
const openAiKey = process.env.OPENAI_API_KEY;

if (!openAiKey) {
  console.warn("WARNING: OPENAI_API_KEY no está configurada. Crea un archivo .env con tu clave.");
}

app.use(express.json());
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
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: kbContent ? `Eres un asistente experto en derecho. Responde siempre en español con claridad y profesionalismo.\n\nReferencias de conocimiento:\n${kbContent}` : "Eres un asistente experto en derecho. Responde siempre en español con claridad y profesionalismo." },
          { role: "user", content: prompt }
        ],
        max_tokens: 500,
        temperature: 0.2,
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
