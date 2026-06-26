# Entorno de desarrollo

## Requisitos

- Node.js 20 LTS.
- npm 10 o superior.
- Git.
- PostgreSQL/Supabase para reproducir producción.

## Preparación

```bash
git clone https://github.com/kemenyrojas-cyber/chatbot.git
cd chatbot
npm ci --prefix backend
cp .env.example .env
npm run env:check
npm run ci
npm run dev
```

En PowerShell usa:

```powershell
Copy-Item .env.example .env
```

## Entornos

- `development`: trabajo local con datos sintéticos.
- `staging`: validación integrada, configuración similar a producción y sin datos reales innecesarios.
- `production`: rama `main`, secretos protegidos y despliegue después de CI.

Cada entorno debe usar base de datos, claves y almacenamiento independientes.

## Comandos

```text
npm run dev        servidor local con recarga
npm run check      política del repositorio y sintaxis
npm test           pruebas automatizadas
npm run ci         controles ejecutados por GitHub Actions
npm run env:check  valida configuración del entorno
npm run build      instalación reproducible de producción
```

## Política de ramas

Protege `main` en GitHub y exige:

- Pull request antes de fusionar.
- CI aprobado.
- Rama actualizada.
- Conversaciones resueltas.
- Prohibición de force push y eliminación de `main`.

Para un equipo pequeño, este flujo basado en tronco es más simple que mantener ramas permanentes `develop`, `qa` y `release`.

## Despliegue

Render despliega `main`. Antes de cambiar configuración:

1. Valida primero en staging.
2. Registra variables modificadas sin copiar sus valores.
3. Ejecuta pruebas de humo.
4. Conserva el commit anterior como punto de reversión.
