# 🚀 LEXIA - Asesor Jurídico Inteligente
## Alimentado con TODA la información de lpderecho.pe

---

## 🚀 Características Principales

### ✅ COBERTURA TOTAL DE LPDERECHO.PE
- **50+ artículos** con contenido completo
- **20 categorías** de derecho peruano
- **Toda la información** de jurisprudencia y sentencias
- **Índice completo** de más de 500 artículos disponibles

### 🤖 Inteligencia con OpenAI
- Respuestas precisas y fundamentadas
- Análisis profundos de casos
- Citas de artículos y jurisprudencia
- Disponible en español profesional

### 📚 Especialidad en Derecho Peruano
- Derecho Civil, Penal, Laboral
- Comercial, Administrativo, Tributario
- Procesal, Constitucional
- Notarial, Registral y más

---

## 🚀 Instalación Rápida

### 1. Instalar Dependencias
```bash
npm install --prefix backend
```

### 2. Configurar OpenAI
Crea archivo `.env`:
```env
OPENAI_API_KEY=sk-xxxxxxxxxxxx
OPENAI_MODEL=gpt-3.5-turbo
PORT=3000
```

### 3. Extraer Información de lpderecho.pe
```bash
npm run ingest-lpderecho
```

Este comando:
- Extrae TODAS las categorías
- Procesa 50+ artículos con contenido completo
- Indexa 500+ artículos para referencia
- Genera 3 archivos de base de conocimiento

### 4. Iniciar Servidor
```bash
npm start
```

---

## 📄 Archivos Generados

Al ejecutar `npm run ingest-lpderecho`, se generan:

1. **`ai-engine/kb/lpderecho_content.md`** (~800KB)
   - Contenido completo de 50+ artículos
   - Organisado por categoría
   - Incluye jurisprudencia

2. **`ai-engine/kb/lpderecho_index.md`** (~200KB)
   - Índice de 500+ artículos disponibles
   - Enlaces directos a lpderecho.pe
   - Búsqueda rápida

3. **`ai-engine/kb/legal_faqs.md`** (~100KB)
   - Preguntas frecuentes jurídicas
   - Respuestas fundamentadas

---

## 🧱 Estructura del Proyecto

```text
chatbot-main/
├── backend/               # Servidor Express, APIs y dependencias backend
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── routes/
│   │   └── services/
│   ├── package.json
│   └── server.js
├── frontend/              # Interfaz web estática
│   ├── public/
│   └── src/
│       ├── css/
│       ├── js/
│       └── views/
├── ai-engine/             # Base jurídica, scripts RAG y prompts
│   ├── kb/
│   ├── scripts/
│   ├── vector_db/
│   └── prompt_templates/
├── render.yaml
└── package.json
```

Los scripts globales de la raíz delegan al backend:

```bash
npm start
npm run dev
npm run ingest-lpderecho
```

Render instala y arranca desde `backend/`.

---

## 💱 Uso

### API REST
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt": "¿Cuales son los requisitos para un divorcio en Perú?"}'
```

### Respuesta
```json
{
  "answer": "Según la legislación peruana...",
  "source": "LEXIA (lpderecho.pe + OpenAI)",
  "model": "gpt-3.5-turbo"
}
```

---

## 📚 Ejemplos de Consultas

**DERECHO CIVIL:**
- "¿Cuáles son los requisitos de un contrato válido?"
- "Explicame sobre la compraventa de inmuebles en Perú"
- "¿Cómo funciona la herencia y la sucesión de bienes?"

**DERECHO PENAL:**
- "¿Qué diferencia hay entre robo y hurto?"
- "Explicame el procedimiento penal en Perú"
- "¿Cuáles son las penas por fraude?"

**DERECHO LABORAL:**
- "¿Qué derechos tengo si me despiden sin causa?"
- "¿Cómo se calcula el cálculo de indemnización?"
- "Explicame sobre seguridad social en Perú"

**DERECHO COMERCIAL:**
- "¿Cómo constituir una sociedad anónima?"
- "¿Qué es una quiebra y cómo se declara?"
- "Explicame sobre obligaciones mercantiles"

**CASOS COMPLEJOS:**
- "Tengo una disputa sobre una propiedad, ¿qué pasos sigo?"
- "Me despidieron sin justificación, ¿qué puedo hacer?"
- "Necesito redactar un contrato de compraventa, ¿qué debe incluir?"

---

## 📈 Categorías de Cobertura

- ✅ Derecho Civil
- ✅ Derecho Penal
- ✅ Derecho Laboral
- ✅ Derecho Comercial
- ✅ Derecho Tributario
- ✅ Derecho Administrativo
- ✅ Derecho Procesal
- ✅ Derecho Constitucional
- ✅ Derecho Mercantil
- ✅ Derecho Notarial
- ✅ Derecho Registral
- ✅ Jurisprudencia y Sentencias
- ✅ Legislación Vigente

---

## ⚠️ Importante

- **LEXIA proporciona información legal general**
- **NO reemplaza asesoría profesional**
- **Para casos complejos, consulte abogado especializado**
- **Basado en legislación peruana vigente**

---

## 🔗 Enlaces

- [lpderecho.pe](https://lpderecho.pe) - Portal jurídico
- [OpenAI](https://platform.openai.com) - Proveedor IA
- [GitHub](https://github.com/kemenyrojas-cyber/chatbot) - Código fuente

---

**🚀 LEXIA v2.0** - Asesor Jurídico Inteligente
