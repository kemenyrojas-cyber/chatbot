# Arquitectura de LEXIA

## Componentes

```text
Frontend estático
      │
      ▼
API Express ─────► PostgreSQL/Supabase
      │
      ▼
LEXIA Engine
 ├─ Brain: intención y conversación
 ├─ Case File: expediente conversacional
 ├─ Knowledge: RAG y fuentes jurídicas
 ├─ Reasoner: análisis jurídico y contraste dual
 ├─ Providers: modelos externos o locales
 └─ Response/Score: respuesta, validación y selección
```

## Topología local

`compose.dev.yaml` crea dos servicios aislados:

```text
localhost:3000 ─► app (Node.js 20)
                         │
                         ▼
                  database (PostgreSQL 16)
```

Las credenciales `lexia/lexia_dev` son exclusivamente locales y no deben reutilizarse en staging o producción. Los puertos solo se enlazan a `127.0.0.1`.

## Reglas

- El orquestador coordina; la lógica nueva debe residir en módulos especializados.
- Las respuestas de modelos no son fuentes jurídicas.
- Los hechos declarados por usuarios son alegaciones hasta que exista evidencia.
- Los documentos privados no se incorporan a la base jurídica compartida.
- Toda conclusión importante debe poder rastrearse a hechos y fuentes.
- El backend mantiene compatibilidad del contrato REST o versiona los cambios incompatibles.

## Deuda técnica prioritaria

`backend/server.js` todavía concentra rutas, persistencia, proveedores y lógica heredada. La migración debe ser incremental:

1. Extraer configuración y validación de entorno.
2. Extraer rutas y controladores.
3. Separar autenticación y persistencia.
4. Crear almacenamiento privado de expedientes.
5. Añadir pruebas de API con una aplicación Express que pueda iniciarse sin escuchar un puerto.

No se recomienda una reescritura total: incrementa el riesgo y elimina comportamiento ya validado.
