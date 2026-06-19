# Lexia Engine

Lexia Engine es el director de orquesta de LEXIA.

Su responsabilidad no es hacer todo directamente, sino coordinar piezas con responsabilidades separadas:

- Lexia Brain: entiende el mensaje del usuario, el historial, la continuidad, correcciones y datos faltantes.
- Lexia Memory: entrega memoria conversacional útil.
- Lexia Knowledge: recupera conocimiento jurídico validado.
- Lexia Search: busca información externa cuando el conocimiento disponible no alcanza.
- Lexia Providers: ejecuta proveedores externos como GroqCloud, xAI/Grok, OpenAI u Ollama.
- Lexia Reasoner: estructura el criterio jurídico.
- Lexia Response: define el contexto para responder de forma humana y jurídica.

Regla de arquitectura:

Cada parte cumple su función. Lexia Engine coordina; no debe convertirse en una mezcla desordenada de búsqueda, memoria, proveedores y respuesta.

Estado actual:

Esta carpeta inicia la separación formal del motor. En esta fase, el orquestador recibe dependencias del backend existente para no romper endpoints ni cambiar la base de datos. Las siguientes fases deben extraer cada responsabilidad a su propio módulo.
