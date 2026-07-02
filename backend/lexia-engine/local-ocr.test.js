const test = require('node:test');
const assert = require('node:assert/strict');
const { createCanvas } = require('@napi-rs/canvas');
const { PDFDocument } = require('pdf-lib');
const {
  ensureLocalOcrAvailable,
  ocrPdfWithNode,
  terminateNodeOcrWorker
} = require('./local-ocr');

test('el OCR Node identifica un expediente escaneado sin ejecutables del sistema', async t => {
  t.after(() => terminateNodeOcrWorker());
  const availability = await ensureLocalOcrAvailable();
  assert.equal(availability.available, true);

  const canvas = createCanvas(1200, 800);
  const context = canvas.getContext('2d');
  context.fillStyle = 'white';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'black';
  context.font = 'bold 42px Arial';
  context.fillText('EXPEDIENTE 02715-2026-0-1864-JR-LA-12', 60, 120);
  context.font = '32px Arial';
  context.fillText('DEMANDANTE: ANTICONA VELA, KEYTH AYUMI', 60, 220);
  context.fillText('MATERIA: DERECHO LABORAL', 60, 300);

  const pdf = await PDFDocument.create();
  const image = await pdf.embedJpg(canvas.toBuffer('image/jpeg', 95));
  const page = pdf.addPage([600, 400]);
  page.drawImage(image, { x: 0, y: 0, width: 600, height: 400 });

  const result = await ocrPdfWithNode({ buffer: Buffer.from(await pdf.save()) });
  assert.equal(result.engine, 'tesseract.js');
  assert.equal(result.pageCount, 1);
  assert.match(result.text, /02715-2026-0-1864-JR-LA-12/);
  assert.match(result.text, /ANTICONA VELA/i);
  assert.match(result.text, /DERECHO LABORAL/i);
});
