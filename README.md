# LexIA — Chatbot legal

Este repositorio contiene una interfaz web y un backend Express que llama a la API de OpenAI para responder consultas legales.

Opción recomendada de despliegue: Render.com

Por qué elegir Render
- Despliegue sencillo de apps Node.js desde GitHub.
- Gestión de variables de entorno seguras (p. ej. `OPENAI_API_KEY`).
- URL pública automática para tu backend.

Pasos para desplegar en Render
1. Crea una cuenta en https://render.com e inicia sesión.
2. En Render, conecta tu repositorio GitHub `kemenyrojas-cyber/chatbot`.
3. Crea un nuevo servicio "Web Service" usando el branch `main`.
4. Render detectará `package.json`. Como comando de inicio usa:

```bash
npm install
npm start
```

5. En la sección de Environment → Environment Variables agrega:

- `OPENAI_API_KEY` = TU_CLAVE_DE_OPENAI

6. Despliega y copia la URL pública que Render asigne, por ejemplo:

```
https://lexia-backend.onrender.com
```

Configurar el frontend
- Si quieres mantener el frontend en GitHub Pages, edita `index.html` y asigna la URL pública del backend a la variable global `window.BACKEND_URL` (ya existe en el archivo):

```html
<script>
	window.BACKEND_URL = "https://lexia-backend.onrender.com";
</script>
```

- Si decides servir el frontend desde el mismo server Express (default), no necesitas cambiar `BACKEND_URL`.

- Si no tienes backend, deja `window.BACKEND_URL = "";` y el chat funcionará en modo demo local con respuestas simuladas de derecho.

Render config
- El repositorio incluye `render.yaml` para que Render pueda detectar la configuración del servicio y desplegarlo como app Node.js.

Probar localmente
1. Crea `.env` en la raíz del proyecto con:

```env
OPENAI_API_KEY=tu_clave_real_de_openai
```

2. Instala dependencias e inicia:

```bash
npm install
npm start
```

3. Abre `http://localhost:3000` y prueba el chat.

Comandos útiles para GitHub / despliegue

```bash
# Empujar cambios al repositorio
git add .
git commit -m "Preparar despliegue: documentación y configuración"
git push origin main
```

Notas de seguridad
- Nunca subas tu `.env` con la clave a GitHub.
- Usa las variables de entorno del proveedor para configurar `OPENAI_API_KEY`.

Puedo seguir y:
- Preparar un template para Vercel/Netlify si prefieres serverless.
- Actualizar `index.html` para apuntar a la URL del backend cuando ya esté desplegado (proporciona la URL y lo hago).

Si quieres que proceda con Render, dime y te guío paso a paso en el panel de Render (no necesito tus credenciales). Si ya has desplegado y me das la URL pública, actualizaré `index.html` y subiré el cambio.