require("dotenv").config();
const express = require("express");
const path = require("path");

const app = express();
const port = process.env.PORT || 3000;
const openAiKey = process.env.OPENAI_API_KEY;

if (!openAiKey) {
  console.warn("WARNING: OPENAI_API_KEY no está configurada. Crea un archivo .env con tu clave.");
}

app.use(express.json());
app.use(express.static(path.join(__dirname)));

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
          { role: "system", content: "Eres un asistente experto en derecho. Responde siempre en español con claridad y profesionalismo." },
          { role: "user", content: prompt }
        ],
        max_tokens: 500,
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("Error de OpenAI:", errorBody);
      return res.status(502).json({ error: "Error al conectar con la API de OpenAI." });
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
