# Entorno de desarrollo

## Entorno recomendado: contenedores

El entorno reproduce automáticamente:

- Node.js 20 LTS.
- PostgreSQL 16.
- Dependencias exactas del lockfile.
- Variables locales seguras.
- Recarga automática del backend.
- Health checks de aplicación y base de datos.

Instala una sola vez:

- Git.
- Docker Desktop con WSL 2.
- Visual Studio Code.
- Extensión Dev Containers.

Comprueba la máquina:

```bash
npm run doctor
```

### Opción A: VS Code Dev Container

1. Abre el repositorio en VS Code.
2. Ejecuta `Dev Containers: Reopen in Container`.
3. Espera a que termine `npm run ci`.
4. Abre `http://localhost:3000`.

VS Code trabajará dentro del contenedor con Node 20. PostgreSQL se inicia como servicio separado.

### Opción B: terminal

```bash
npm run dev:container
```

Comandos operativos:

```bash
npm run dev:container:logs
npm run health
npm run dev:container:down
```

Los datos de PostgreSQL permanecen en un volumen local aunque detengas los contenedores. `down` no elimina ese volumen.

El contenedor establece `LEXIA_LOAD_ENV=false`: no carga el archivo `.env` del host ni recibe accidentalmente credenciales de staging o producción.

## Modo nativo

Úsalo solo cuando no puedas utilizar Docker:

```bash
npm ci --prefix backend
cp .env.example .env
npm run env:check
npm run ci
npm run dev
```

Debes instalar Node.js 20 y proporcionar PostgreSQL por separado. En PowerShell, copia el archivo con `Copy-Item .env.example .env`.

## Entornos

- `development`: trabajo local con datos sintéticos.
- `staging`: validación integrada, configuración similar a producción y sin datos reales innecesarios.
- `production`: rama `main`, secretos protegidos y despliegue después de CI.

Cada entorno debe usar base de datos, claves y almacenamiento independientes.

## Comandos

```text
npm run dev        servidor local con recarga
npm run doctor     verifica Node, npm, Git, Docker y Compose
npm run dev:container inicia aplicación y PostgreSQL reproducibles
npm run check      política del repositorio y sintaxis
npm test           pruebas automatizadas
npm run ci         controles ejecutados por GitHub Actions
npm run env:check  valida configuración del entorno
npm run health     comprueba la aplicación iniciada
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
