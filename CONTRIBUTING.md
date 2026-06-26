# Contribuir a LEXIA

LEXIA usa desarrollo basado en ramas cortas y revisión mediante pull request.

## Flujo

1. Actualiza `main`.
2. Crea una rama: `feature/nombre`, `fix/nombre`, `docs/nombre` o `chore/nombre`.
3. Haz cambios pequeños y agrega pruebas.
4. Ejecuta `npm run ci`.
5. Abre un pull request y espera CI aprobado.
6. Fusiona mediante squash merge. No trabajes directamente sobre producción.

## Commits

Usa mensajes imperativos y concretos:

```text
Add private case document parser
Fix unsupported citation validation
Document production recovery procedure
```

## Criterios de terminado

- La funcionalidad tiene pruebas proporcionales al riesgo.
- No existen secretos, datos personales ni expedientes en Git.
- Los cambios de API y configuración están documentados.
- CI está aprobado.
- Existe una forma clara de revertir el cambio.

## Revisión

Los cambios jurídicos deben revisar fidelidad de fuentes, jurisdicción, vigencia y tratamiento de incertidumbre. Los cambios de seguridad, autenticación, privacidad o base de datos requieren una revisión adicional antes de desplegar.
