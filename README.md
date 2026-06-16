# 🚀 LEXIA - Asesor Jurídico Inteligente
## Alimentado por base jurídica local y LP Derecho

---

## 🚀 Características Principales

### ✅ MOTOR JURÍDICO LOCAL
- **Normativa**
- **Jurisprudencia**
- **Casaciones**
- **Sentencias TC**
- Resultados ordenados por relevancia desde `/api/legal-search`
- Fallback útil cuando OpenAI no tiene créditos o no está disponible

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

### 3. Configurar Supabase para cuentas
La autenticación usa PostgreSQL cuando existe `SUPABASE_DATABASE_URL` o `DATABASE_URL`.
Con Supabase no necesitas crear la tabla manualmente: el backend crea y migra la tabla `accounts` al iniciar.

En Supabase:
- Crea un proyecto.
- Ve a **Project Settings > Database > Connection string**.
- Copia la URI del **Transaction pooler** o la conexión directa si tu despliegue tiene soporte IPv4.
- Reemplaza `[YOUR-PASSWORD]` por la contraseña real de la base.

En `.env` local o variables de Render:
```env
SUPABASE_DATABASE_URL=postgresql://postgres.tu-ref:tu-password@aws-0-region.pooler.supabase.com:6543/postgres
PGSSLMODE=require
```

Para verificar:
```bash
curl http://localhost:3000/api/auth/status
```

Debe responder `storage: "postgres"` y `provider: "supabase"`.

### 4. Alimentar la base jurídica con LP Derecho
```bash
npm run ingest-lpderecho
```

Este comando:
- Busca publicaciones en `lpderecho.pe`.
- Extrae contenido de artículos.
- Clasifica resultados en normativa, jurisprudencia, casaciones y sentencias TC.
- Fusiona los registros en `ai-engine/kb/legal_knowledge_base.json`.
- Genera `lpderecho_index.md` y `lpderecho_content.md` como respaldo legible.

Para pruebas controladas:

```bash
LPDERECHO_MAX_PAGES=1 LPDERECHO_MAX_ARTICLES=5 npm run ingest-lpderecho
```

En PowerShell:

```powershell
$env:LPDERECHO_MAX_PAGES='1'
$env:LPDERECHO_MAX_ARTICLES='5'
npm run ingest-lpderecho
```

Despues de una nueva ingestion, reinicia el servidor para que cargue la base actualizada.

### 5. Iniciar Servidor
```bash
npm start
```

---

## 📄 Archivos Generados

Al ejecutar `npm run ingest-lpderecho`, se actualizan:

1. **`ai-engine/kb/legal_knowledge_base.json`**
   - Base estructurada que consume `/api/legal-search`
   - Modulos: normativa, jurisprudencia, casaciones y sentencias TC

2. **`ai-engine/kb/lpderecho_content.md`**
   - Vista legible del contenido procesado
   - Organizado por categoria

3. **`ai-engine/kb/lpderecho_index.md`**
   - Índice de artículos procesados
   - Enlaces directos a lpderecho.pe

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

### Busqueda jurídica local
```bash
curl -X POST http://localhost:3000/api/legal-search \
  -H "Content-Type: application/json" \
  -d '{"query": "posesion precaria casacion"}'
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
