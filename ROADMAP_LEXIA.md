# Roadmap adaptado a LEXIA

Este documento adapta el roadmap de la imagen al estado actual de LEXIA, mapeando fases, hitos técnicos y operativos, módulos ya presentes en el repositorio, KPIs y próximos pasos.

Resumen rápido:
- Fase 1 (Meses 1–6): Piloto controlado con portal mínimo, orquestador y `brain.py` activo.
- Fase 2 (Meses 7–18): Escalar RAG, clasificador IA de expedientes, notificaciones y dashboard público.
- Fase 3 (Meses 19–30): Integración interinstitucional (APIs RENIEC/SUNAT/etc.), trazabilidad y certificación.
- Fase 4 (Meses 31–48): Análisis predictivo, traducción automática y modelo de exportación.

Fase 1 — Piloto (Meses 1–6)
- Hitos tecnológicos:
  - Orquestador y flujo conversacional: ya implementado en `backend/lexia-engine/orchestrator.js` y funciones auxiliares (`flow-control.js`, `case-file.js`).
  - Cerebro analítico en Python: `backend/lexia-engine/brain.py` + puente `python-brain.js` (configurable vía `LEXIA_PYTHON_BRAIN_*`).
  - Base de conocimiento local: `backend/lexia-engine/knowledge.js` y archivos `kb/` en `ai-engine/kb`.
  - LEXIA-SCORE: `backend/lexia-engine/lexia-score.js` ya disponible.
- Hitos operativos:
  - Capacitación de 50–200 usuarios pilotos (magistrados/abogados internos).
  - Definir protocolo de seguridad y mesa de ayuda.
- Inversión estimada: S/. 2–3M (ajustar según alcance piloto).
- KPI clave:
  - 500 usuarios activos (meta piloto), 95% uptime del servicio local.

Acciones inmediatas para Fase 1 (qué ya hay y qué falta):
- Ya: orquestador, brain.py, knowledge, lexia-score, extracción de conocimiento derivado (`derived-knowledge.js`).
- Falta/Mejorar: interfaz web básica para recibir consultas (frontend), endpoints de ingestión y un dashboard operativo.

Fase 2 — Escala Nacional (Meses 7–18)
- Hitos tecnológicos:
  - Módulo IA para clasificación de expedientes: usar `brain.py` + `dual-reasoning.js` para generar etiquetas y priorización; exponer como microservicio.
  - Notificaciones automáticas (SMS/email): integrar adaptadores en `providers` o crear `backend/notifications`.
  - Dashboard público y métricas: nuevo servicio frontend que consuma `/api/chat` y métricas internas.
- Hitos operativos:
  - Despliegue a múltiples cortes/tribunales; convenios con colegios de abogados.
  - Campaña ciudadana y soporte local.
- Inversión estimada: S/. 8.0M (ajustar).
- KPI clave: 80% de expedientes digitalizados; NPS >= 70.

Qué integrar desde el código actual:
- Reusar `knowledge.js` para aumentar corpus (scripts de ingestión en `ai-engine/scripts`).
- Exponer `createLexiaEngine` (orquestador) como servicio escalable en `backend/server.js`.

Fase 3 — Integración Interinstitucional (Meses 19–30)
- Hitos tecnológicos:
  - APIs con RENIEC/SUNAT/SUNARP: diseñar adaptadores y conectores seguros.
  - Blockchain para trazabilidad (opcional POC).
  - Chatbot legal ciudadano con SLA y monitoreo (certificación ISO 27001 recomendada).
- Hitos operativos:
  - Integración con fiscalías y defensoría; auditoría de calidad judicial.
- Inversión estimada: S/. 5.5M.
- KPI clave: 95% de resoluciones notificadas en <24h.

Notas de implementación desde el repo:
- Añadir nuevos adaptadores en `backend/lexia-engine/providers` (carpeta a crear).
- Añadir logging y trazabilidad en `orchestrator.js` y en el puente Python (`python-brain.js`).

Fase 4 — Internacionalización y Analítica Avanzada (Meses 31–48)
- Hitos tecnológicos:
  - Análisis predictivo de resoluciones: entrenar y desplegar modelos (puede ser servicio separado `analytics/`).
  - Traducción automática y soporte de lenguas nativas: integrar servicios de traducción o modelos locales.
  - Open data judicial: exponer datasets anonimizados.
- Hitos operativos:
  - Modelo de exportación regional y evaluación de impacto.
- Inversión estimada: S/. 4.0M.
- KPI clave: reducción del 40% del costo por notificación.

Mapa rápido de responsabilidades por archivo/módulo (estado actual):
- `backend/lexia-engine/orchestrator.js`: flujo central de LEXIA y puntos de integración.
- `backend/lexia-engine/brain.py` + `python-brain.js`: cerebro analítico y pre-procesos de interpretación.
- `backend/lexia-engine/knowledge.js`: RAG/local KB y funciones de ingestión.
- `backend/lexia-engine/lexia-score.js`: evaluación de calidad de candidatos.
- `backend/lexia-engine/derived-knowledge.js`: extracción de conocimiento derivado.
- `ai-engine/scripts/`: scripts de ingestión y feeders para ampliar KB.

Próximos pasos recomendados (corto plazo, 4–8 semanas):
1. Crear archivo de roadmap oficial en el repo (este documento).
2. Definir alcance del piloto (cortes, número de usuarios, dataset) y preparar ingestión inicial desde `ai-engine/kb`.
3. Implementar endpoints mínimos para métricas y healthchecks (uptime, latencia, uso memoria).
4. Prototipar dashboard operativo (KPIs: consultas/día, score medio, tasa de fallback a proveedor).

Nota práctica: He añadido un dashboard ligero local en `frontend/src/views/metrics.html` y endpoints backend `/health` y `/api/metrics` que no usan proveedores pagos. Úsalo para monitorear la instancia local sin coste.

Si quieres, adapto este roadmap a un formato de presentación (slides) o genero issues / milestones en GitHub con las tareas desglosadas.
