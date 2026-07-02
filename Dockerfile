FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 \
        poppler-utils \
        tesseract-ocr \
        tesseract-ocr-eng \
        tesseract-ocr-spa \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/package.json backend/package-lock.json ./backend/
RUN npm ci --prefix backend --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PYTHONUNBUFFERED=1
ENV LEXIA_PYTHON_EXECUTABLE=python3
ENV LEXIA_PYTHON_BRAIN_ENABLED=true
ENV LEXIA_PDF_RENDER_EXECUTABLE=pdftoppm
ENV LEXIA_PDF_INFO_EXECUTABLE=pdfinfo
ENV LEXIA_OCR_EXECUTABLE=tesseract
ENV LEXIA_OCR_LANGUAGES=spa+eng

EXPOSE 3000

CMD ["node", "backend/server.js"]
