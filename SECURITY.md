# Seguridad

## Información que nunca debe entrar en Git

- Contraseñas, tokens o claves API.
- Archivos `.env`.
- Expedientes, documentos privados o datos personales.
- Bases de cuentas locales.
- Logs de producción.

Usa variables protegidas del proveedor de despliegue y datos sintéticos en pruebas.

## Reporte

No abras un issue público con credenciales o datos personales. Reporta el problema de forma privada al responsable del repositorio e incluye impacto, alcance y pasos de reproducción sin adjuntar información sensible.

## Incidentes

Si una credencial fue incluida en Git:

1. Revócala o rota inmediatamente.
2. Elimínala del código actual.
3. Evalúa la reescritura del historial y sus efectos sobre clones y despliegues.
4. Revisa logs de acceso.
5. Documenta causa y medidas preventivas.

Eliminar el archivo en un commit nuevo no invalida una credencial expuesta previamente.
