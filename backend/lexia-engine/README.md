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

## LEXIA-JURIS

El ciclo de análisis implementado es:

1. Identificar perfil, jurisdicción, intención, área y rol procesal.
2. Construir un expediente conversacional que separa hechos alegados de hechos confirmados.
3. Detectar evidencia mencionada, fechas, información faltante y señales de urgencia.
4. Recuperar conocimiento jurídico y construir el razonamiento existente.
5. Ejecutar un control dual: argumento favorable y mejor contraargumento.
6. Generar la síntesis local y, cuando existe, una respuesta del proveedor configurado.
7. Aplicar fidelidad de fuentes y LEXIA-SCORE.
8. Rechazar candidatos con citas jurídicas no respaldadas y seleccionar el candidato seguro con mayor puntuación.

Los perfiles disponibles son `lawyer`, `student`, `public-sector` y `citizen`. Se infieren del campo `role` enviado a `/api/chat`.

## LEXIA-SCORE 1.0

Para un perfil `r`, la calidad estimada de una respuesta se calcula como:

```text
Q_r(y) =
  (A^wA · F^wF · D^wD · J^wJ · C^wC · U^wU · N^wN)
  · (1-H)^3 · (1-K)^2 · exp(-2E)
```

- `A`: indicador interno de exactitud jurídica.
- `F`: fidelidad de fuentes.
- `D`: fidelidad a los documentos o evidencia mencionados.
- `J`: jurisdicción y vigencia.
- `C`: comprensión del caso.
- `U`: utilidad práctica.
- `N`: claridad y naturalidad.
- `H`: citas o afirmaciones jurídicas no respaldadas.
- `K`: contradicciones detectadas.
- `E`: error jurídico grave.

Todos los valores están entre 0 y 1. Los pesos dependen del perfil y suman 1. La media geométrica impide que una dimensión alta compense completamente una dimensión jurídica baja.

`A`, `D`, `J`, `C`, `U` y `N` son indicadores automáticos, no una certificación de corrección. La API devuelve `calibratedByLawyers: false` hasta que los pesos y umbrales se calibren contra un conjunto de casos evaluado por profesionales.

## Contrato de `/api/chat`

Además de los campos existentes, acepta:

```json
{
  "role": "abogado-independiente",
  "sessionId": "expediente-001",
  "caseFile": {
    "jurisdiction": "Perú",
    "confirmedFacts": [],
    "disputedFacts": [],
    "evidence": []
  }
}
```

La respuesta incluye:

- `caseFile`: expediente estructurado actualizado.
- `quality`: dimensiones, penalizaciones y puntuación LEXIA-SCORE.
- `diagnostics.dualAnalysis`: apoyo, contraargumentos, riesgos y vacíos.
- `diagnostics.candidateSelection`: candidato elegido y resultado del control de seguridad.
