FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/package.json backend/package-lock.json ./backend/
RUN npm ci --prefix backend --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PYTHONUNBUFFERED=1
ENV LEXIA_PYTHON_EXECUTABLE=python3
ENV LEXIA_PYTHON_BRAIN_ENABLED=true

EXPOSE 3000

CMD ["node", "server.js"]
