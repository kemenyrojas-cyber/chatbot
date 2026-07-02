# Roadmap de evolución de LEXIA

## Alcance de la adaptación

Este roadmap adapta la lógica de cuatro fases del modelo de referencia a LEXIA. No crea otro producto ni supone que LEXIA sea un sistema oficial del Poder Judicial. LEXIA seguirá siendo una plataforma de inteligencia y operación jurídica para profesionales, estudios, estudiantes, entidades y empresas.

Las fases son interdependientes. Una fase no se considera terminada por publicar funcionalidades: debe cumplir sus indicadores y puertas de salida.

## Línea base comprobada

| Capacidad | Estado actual | Tratamiento en el roadmap |
|---|---|---|
| Portal web adaptable | Disponible | Se estabiliza; no se reconstruye |
| Despliegue en nube | Disponible | Se añaden continuidad, respaldo y observabilidad |
| Chat jurídico con memoria | Disponible | Se somete a evaluación jurídica y controles de calidad |
| Groq y Cerebras | Integrados | Se mantienen como apoyo; la respuesta final sigue bajo controles de LEXIA |
| OpenAI | Deshabilitado | No es dependencia del roadmap |
| OCR y clasificación de expedientes | Disponible | Se mide y mejora con casos evaluados |
| Base jurídica PostgreSQL | Disponible | Se fortalece la curaduría, vigencia, jurisdicción y trazabilidad |
| Fuentes web verificadas | Disponible | Se amplía bajo lista permitida y aprobación |
| Doctrina nacional, extranjera e histórica | Disponible | Se usa como doctrina, nunca como norma peruana vigente |
| Notificaciones dentro de la aplicación | Parcial | Se incorporan canales externos y preferencias |
| Aplicación móvil nativa | No disponible | Primero PWA; app nativa sólo si el uso la justifica |
| Firma digital | No disponible | Se integra mediante proveedor acreditado, no se implementa criptografía propia |
| Integraciones RENIEC/SUNAT/SUNARP | No disponibles | Requieren convenio, base legal, consentimiento y APIs oficiales |
| Auditoría de seguridad / ISO 27001 | No disponible | Se trabaja por madurez y evidencia antes de certificar |
| Predicción de resoluciones | No disponible | Se reemplaza por analítica de riesgo explicable; LEXIA no predice decisiones judiciales como certezas |

## Fase 1 — Piloto confiable

**Periodo:** meses 1–6  
**Objetivo:** convertir la versión actual en un piloto medible y seguro.

### Hitos tecnológicos

- Fortalecer autenticación: contraseñas con hash robusto, sesiones revocables, recuperación segura y control de acceso por rol.
- Incorporar registro de auditoría para accesos, ingestas, cambios de estado y operaciones sensibles.
- Automatizar copias de seguridad y probar restauración de PostgreSQL.
- Añadir observabilidad de disponibilidad, latencia, errores, OCR y proveedores externos.
- Convertir la interfaz adaptable en PWA instalable antes de evaluar una app nativa.
- Formalizar la evaluación de respuestas: exactitud jurídica, fidelidad de fuentes, no repetición, utilidad y ausencia de filtraciones internas.
- Mantener OpenAI como dependencia deshabilitada.

### Hitos operativos

- Piloto controlado con 20–50 profesionales jurídicos.
- Protocolo de soporte, incidentes, privacidad, conservación y eliminación de datos.
- Comité de curaduría jurídica con responsables y tiempos de revisión.
- Conjunto de evaluación elaborado con consultas y expedientes anonimizados.
- Capacitación inicial y sesiones mensuales de retroalimentación.

### Inversión estimada

**S/ 180 000–450 000**, según dedicación del equipo, auditoría externa e infraestructura. Es un rango de planificación, no una cotización.

### KPI clave

- Disponibilidad mensual ≥ 99.5 %.
- Cero vulnerabilidades críticas abiertas al cierre de la fase.
- 100 % de restauraciones de respaldo de prueba completadas.
- ≥ 85 % de respuestas evaluadas como útiles por el panel piloto.
- Tasa de citas o afirmaciones verificables sin respaldo < 1 %.
- ≥ 20 usuarios activos semanales durante ocho semanas.

### Puerta de salida

No avanzar si la autenticación, los respaldos, la auditoría o la evaluación jurídica no tienen evidencia verificable.

## Fase 2 — Escala profesional

**Periodo:** meses 7–18  
**Objetivo:** escalar LEXIA para estudios y equipos jurídicos sin degradar calidad.

### Hitos tecnológicos

- Mejorar clasificación de expedientes con etiquetas validadas por abogados y métricas por materia.
- Gestión de casos con responsables, estados, tareas, vencimientos y permisos por organización.
- Notificaciones por correo y, sólo si existe necesidad validada, SMS o mensajería autorizada.
- Panel privado de operación y calidad; no publicar datos personales ni expedientes.
- Firma electrónica mediante integración con un proveedor acreditado.
- Ciclo de vigencia de fuentes: fecha de revisión, jurisdicción, tipo, autoridad y estado.
- Controles automáticos contra mezcla de materias, jurisdicciones y doctrina/normativa.

### Hitos operativos

- Incorporación progresiva de estudios y áreas legales.
- Manuales por perfil, soporte con acuerdos de atención y responsables de escalamiento.
- Programa de alianzas académicas y profesionales para evaluación, no para validar comercialmente respuestas sin evidencia.
- Revisión trimestral de sesgos, errores graves y consultas no resueltas.

### Inversión estimada

**S/ 500 000–1 200 000**.

### KPI clave

- F1 macro de clasificación ≥ 0.85 en un conjunto jurídico etiquetado.
- ≥ 90 % de expedientes procesados sin intervención técnica.
- ≥ 70 % de usuarios activos mensuales que vuelven al mes siguiente.
- NPS ≥ 40; elevar la meta sólo después de tener una línea base.
- Incidentes de mezcla de jurisdicción o materia < 1 %.
- Tiempo medio de resolución de soporte < 8 horas hábiles.

### Puerta de salida

No escalar integraciones institucionales si no existen separación por organización, trazabilidad de acciones y métricas estables de calidad.

## Fase 3 — Interoperabilidad institucional

**Periodo:** meses 19–30  
**Objetivo:** conectar LEXIA con servicios externos bajo autorización y trazabilidad.

### Hitos tecnológicos

- API versionada, webhooks firmados, límites por cliente y documentación para integraciones.
- Adaptadores para RENIEC, SUNAT, SUNARP u otras entidades únicamente con convenio y API oficial.
- Consentimiento, finalidad, minimización y registro de cada consulta de datos personales.
- Firma digital e identidad mediante proveedores acreditados y estándares interoperables.
- Registro inmutable de auditoría mediante hash encadenado o servicio equivalente.
- No usar blockchain salvo que una evaluación pruebe una necesidad que el registro de auditoría no resuelva.
- Gestión de secretos, segregación de ambientes, pruebas de penetración y plan de continuidad.

### Hitos operativos

- Convenios piloto con alcance, responsables, base legal y límites de uso documentados.
- Preparación para ISO 27001; certificación sólo cuando existan controles operados y evidencia.
- Evaluación independiente de seguridad, privacidad y calidad jurídica.
- Mesa de gobernanza con producto, ingeniería, seguridad, legal y protección de datos.

### Inversión estimada

**S/ 900 000–2 500 000**, sin incluir tasas o costos impuestos por entidades y proveedores.

### KPI clave

- Disponibilidad ≥ 99.9 % para servicios contratados.
- 100 % de consultas institucionales con actor, finalidad y resultado auditables.
- Cero accesos a datos externos sin consentimiento o base legal registrada.
- ≥ 95 % de eventos críticos notificados internamente en menos de 15 minutos.
- Recuperación probada dentro de los objetivos RTO/RPO aprobados.

### Puerta de salida

No regionalizar mientras una integración no pueda auditarse, revocarse y aislarse sin afectar al resto del sistema.

## Fase 4 — Expansión regional responsable

**Periodo:** meses 31–48  
**Objetivo:** ampliar jurisdicciones y capacidades sin confundir ordenamientos ni automatizar decisiones jurídicas.

### Hitos tecnológicos

- Arquitectura multijurisdiccional con país, vigencia, autoridad y jerarquía obligatorios en cada fuente.
- Traducción asistida con conservación del texto original y revisión humana en documentos críticos.
- Analítica explicable de riesgos, plazos y carga de trabajo; no “predicción” determinista de sentencias.
- Métricas abiertas y anonimizadas sobre funcionamiento de LEXIA, nunca datos de expedientes.
- Paquetes de conocimiento separados por jurisdicción y pruebas específicas por país.

### Hitos operativos

- Piloto en una sola jurisdicción adicional antes de ampliar a otros países.
- Evaluación independiente de impacto, errores, sesgos y utilidad profesional.
- Protocolo regional de gobernanza, privacidad, incidentes y retiro de fuentes.
- Modelo comercial y de cooperación basado en resultados medidos.

### Inversión estimada

**S/ 1 200 000–3 500 000**.

### KPI clave

- Confusión entre jurisdicciones < 0.5 % en evaluación independiente.
- Reducción ≥ 30 % del tiempo operativo en tareas documentales seleccionadas.
- ≥ 90 % de respuestas regionales con jurisdicción correctamente identificada.
- Cero datos personales en conjuntos abiertos o métricas públicas.
- Retención anual de organizaciones ≥ 80 %.

### Puerta de salida

La expansión sólo continúa si la evaluación independiente demuestra utilidad, seguridad y capacidad de corregir o retirar conocimiento por jurisdicción.

## Lógica de ejecución

1. **Piloto confiable:** reduce incertidumbre técnica, jurídica y de seguridad.
2. **Escala profesional:** amplía usuarios sólo después de medir calidad y operación.
3. **Interoperabilidad institucional:** conecta servicios externos cuando existen autorización, trazabilidad y controles.
4. **Expansión regional responsable:** separa jurisdicciones y mide impacto antes de crecer.

## Reglas permanentes

- LEXIA apoya decisiones; no sustituye al profesional ni decide procesos.
- Las fuentes oficiales prevalecen sobre doctrina y opiniones de modelos.
- La doctrina extranjera o histórica se identifica y contrasta con derecho peruano vigente.
- Ninguna integración institucional se simula ni se anuncia antes de existir convenio y prueba.
- Los KPI se calculan con evidencia; no se declaran por percepción.
- El presupuesto se revisa al final de cada fase según alcance, equipo, infraestructura y obligaciones regulatorias.

