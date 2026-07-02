const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

let availabilityPromise = null;
let nodeOcrWorkerPromise = null;
let activeOcrProcesses = 0;
const ocrProcessQueue = [];

function withGlobalOcrSlot(task) {
  const limit = Math.max(1, Math.min(8, Number(process.env.LEXIA_LOCAL_OCR_GLOBAL_CONCURRENCY || 2)));
  return new Promise((resolve, reject) => {
    const run = async () => {
      activeOcrProcesses += 1;
      try {
        resolve(await task());
      } catch (error) {
        reject(error);
      } finally {
        activeOcrProcesses -= 1;
        const next = ocrProcessQueue.shift();
        if (next) next();
      }
    };
    if (activeOcrProcesses < limit) run();
    else ocrProcessQueue.push(run);
  });
}

function runProcess(command, args, options = {}) {
  const timeoutMs = Math.max(1000, Number(options.timeoutMs) || 120000);
  const maxOutputBytes = Math.max(1024, Number(options.maxOutputBytes) || 2 * 1024 * 1024);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const stdout = [];
    const stderr = [];
    let outputBytes = 0;
    let settled = false;

    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      const error = new Error(`${command} excedió ${Math.round(timeoutMs / 1000)} segundos.`);
      error.code = 'LOCAL_OCR_TIMEOUT';
      finish(error);
    }, timeoutMs);

    child.stdout.on('data', chunk => {
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes) {
        child.kill('SIGKILL');
        const error = new Error(`${command} produjo una salida demasiado grande.`);
        error.code = 'LOCAL_OCR_OUTPUT_LIMIT';
        finish(error);
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.on('error', error => {
      const wrapped = new Error(
        error.code === 'ENOENT'
          ? `No se encontró el ejecutable local "${command}".`
          : `${command} no pudo iniciarse: ${error.message}`
      );
      wrapped.code = error.code === 'ENOENT' ? 'LOCAL_OCR_NOT_INSTALLED' : 'LOCAL_OCR_PROCESS_ERROR';
      finish(wrapped);
    });
    child.on('close', code => {
      if (settled) return;
      const result = {
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        code
      };
      if (code !== 0) {
        const error = new Error(result.stderr.trim() || `${command} terminó con código ${code}.`);
        error.code = 'LOCAL_OCR_COMMAND_FAILED';
        error.exitCode = code;
        finish(error);
        return;
      }
      finish(null, result);
    });
  });
}

function naturalPageSort(left, right) {
  const leftNumber = Number(String(left).match(/(\d+)(?=\.[^.]+$)/)?.[1]) || 0;
  const rightNumber = Number(String(right).match(/(\d+)(?=\.[^.]+$)/)?.[1]) || 0;
  return leftNumber - rightNumber;
}

async function ensureSystemOcrAvailable() {
  if (!availabilityPromise) {
    availabilityPromise = Promise.all([
      runProcess(process.env.LEXIA_PDF_RENDER_EXECUTABLE || 'pdftoppm', ['-v'], { timeoutMs: 10000 }),
      runProcess(process.env.LEXIA_PDF_INFO_EXECUTABLE || 'pdfinfo', ['-v'], { timeoutMs: 10000 }),
      runProcess(process.env.LEXIA_OCR_EXECUTABLE || 'tesseract', ['--version'], { timeoutMs: 10000 })
    ]).then(() => ({ available: true })).catch(error => {
      availabilityPromise = null;
      throw error;
    });
  }
  return availabilityPromise;
}

async function prepareNodeLanguageData() {
  const spa = require('@tesseract.js-data/spa');
  const eng = require('@tesseract.js-data/eng');
  const languagePath = path.join(os.tmpdir(), 'lexia-tesseract-languages-v1');
  await fs.mkdir(languagePath, { recursive: true });
  await Promise.all([spa, eng].map(async language => {
    const source = path.join(language.langPath, `${language.code}.traineddata.gz`);
    const target = path.join(languagePath, `${language.code}.traineddata.gz`);
    try {
      await fs.access(target);
    } catch {
      await fs.copyFile(source, target);
    }
  }));
  return languagePath;
}

async function getNodeOcrWorker() {
  if (!nodeOcrWorkerPromise) {
    nodeOcrWorkerPromise = (async () => {
      const { createWorker, OEM } = require('tesseract.js');
      const langPath = await prepareNodeLanguageData();
      return createWorker('spa+eng', OEM.LSTM_ONLY, {
        langPath,
        gzip: true,
        cachePath: path.join(os.tmpdir(), 'lexia-tesseract-cache')
      });
    })().catch(error => {
      nodeOcrWorkerPromise = null;
      throw error;
    });
  }
  return nodeOcrWorkerPromise;
}

async function ensureNodeOcrAvailable() {
  require.resolve('tesseract.js');
  require.resolve('pdfjs-dist/legacy/build/pdf.mjs');
  require.resolve('@napi-rs/canvas');
  require.resolve('@tesseract.js-data/spa');
  require.resolve('@tesseract.js-data/eng');
  return { available: true, engine: 'tesseract.js' };
}

async function ensureLocalOcrAvailable() {
  try {
    await ensureSystemOcrAvailable();
    return { available: true, engine: 'tesseract' };
  } catch (systemError) {
    try {
      return await ensureNodeOcrAvailable();
    } catch (nodeError) {
      const error = new Error(
        `No hay un motor OCR local disponible. Sistema: ${systemError.message} Node: ${nodeError.message}`
      );
      error.code = 'LOCAL_OCR_NOT_AVAILABLE';
      throw error;
    }
  }
}

async function ocrPdfWithSystemTools(file, options = {}) {
  await ensureSystemOcrAvailable();
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const pdfRenderer = process.env.LEXIA_PDF_RENDER_EXECUTABLE || 'pdftoppm';
  const pdfInfo = process.env.LEXIA_PDF_INFO_EXECUTABLE || 'pdfinfo';
  const tesseract = process.env.LEXIA_OCR_EXECUTABLE || 'tesseract';
  const languages = String(process.env.LEXIA_OCR_LANGUAGES || 'spa+eng').trim();
  const dpi = Math.max(120, Math.min(240, Number(process.env.LEXIA_OCR_DPI || 170)));
  const concurrency = Math.max(1, Math.min(4, Number(process.env.LEXIA_LOCAL_OCR_CONCURRENCY || 2)));
  const pagesPerBatch = Math.max(4, Math.min(30, Number(process.env.LEXIA_LOCAL_OCR_BATCH_PAGES || 12)));
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lexia-ocr-'));
  const sourcePath = path.join(tempRoot, 'source.pdf');
  const pagePrefix = path.join(tempRoot, 'page');

  try {
    await fs.writeFile(sourcePath, file.buffer);
    const info = await runProcess(pdfInfo, [sourcePath], {
      timeoutMs: 30000,
      maxOutputBytes: 512 * 1024
    });
    const pageCount = Number(info.stdout.match(/^Pages:\s+(\d+)/mi)?.[1]) || 0;
    if (!pageCount) throw new Error('No se pudo determinar el número de páginas del PDF.');

    const pageTexts = new Array(pageCount);
    const failures = [];
    let completedPages = 0;
    onProgress({ phase: 'rendering_pages', progress: 5, completedPages, totalPages: pageCount, pageTexts });

    for (let batchStart = 1; batchStart <= pageCount; batchStart += pagesPerBatch) {
      const batchEnd = Math.min(pageCount, batchStart + pagesPerBatch - 1);
      onProgress({
        phase: 'rendering_pages',
        progress: 5 + Math.round((completedPages / pageCount) * 75),
        completedPages,
        totalPages: pageCount,
        pageTexts
      });
      await runProcess(pdfRenderer, [
        '-f', String(batchStart),
        '-l', String(batchEnd),
        '-jpeg',
        '-jpegopt', 'quality=88',
        '-r', String(dpi),
        sourcePath,
        pagePrefix
      ], {
        timeoutMs: Number(process.env.LEXIA_PDF_RENDER_TIMEOUT_MS || 10 * 60 * 1000),
        maxOutputBytes: 512 * 1024
      });

      const pageFiles = (await fs.readdir(tempRoot))
        .filter(name => /^page-\d+\.jpg$/i.test(name))
        .sort(naturalPageSort);
      if (!pageFiles.length) {
        throw new Error(`El conversor local no produjo imágenes para las páginas ${batchStart}-${batchEnd}.`);
      }

      let nextBatchIndex = 0;
      const workers = Array.from({ length: Math.min(concurrency, pageFiles.length) }, async () => {
        while (nextBatchIndex < pageFiles.length) {
          const fileIndex = nextBatchIndex;
          nextBatchIndex += 1;
          const pageFile = pageFiles[fileIndex];
          const pageNumber = Number(pageFile.match(/(\d+)(?=\.jpg$)/i)?.[1]) || (batchStart + fileIndex);
          try {
            const result = await withGlobalOcrSlot(() => runProcess(tesseract, [
                path.join(tempRoot, pageFile),
                'stdout',
                '-l', languages,
                '--oem', '1',
                '--psm', '6',
                '-c', 'preserve_interword_spaces=1'
              ], {
                timeoutMs: Number(process.env.LEXIA_OCR_PAGE_TIMEOUT_MS || 120000),
                maxOutputBytes: Number(process.env.LEXIA_OCR_PAGE_MAX_OUTPUT_BYTES || 2 * 1024 * 1024)
              }));
            const text = result.stdout.replace(/\u0000/g, '').replace(/[ \t]+\n/g, '\n').trim();
            if (text.length >= 8) pageTexts[pageNumber - 1] = text;
            else failures.push({ pageNumber, reason: 'sin texto legible' });
          } catch (error) {
            failures.push({ pageNumber, reason: error.message });
          } finally {
            completedPages += 1;
            await fs.unlink(path.join(tempRoot, pageFile)).catch(() => {});
            onProgress({
              phase: 'local_ocr',
              progress: 10 + Math.round((completedPages / pageCount) * 75),
              completedPages,
              totalPages: pageCount,
              pageTexts
            });
          }
        }
      });
      await Promise.all(workers);
    }

    const successfulPages = pageTexts.filter(Boolean).length;
    if (!successfulPages) {
      const firstReason = failures[0]?.reason ? ` Motivo: ${failures[0].reason}` : '';
      throw new Error(`El OCR local no pudo recuperar texto legible de ninguna página.${firstReason}`);
    }

    const text = pageTexts
      .map((pageText, index) => pageText ? `## Página ${index + 1}\n${pageText}` : '')
      .filter(Boolean)
      .join('\n\n');
    return {
      text,
      pageTexts,
      pageCount,
      successfulPages,
      failedPages: failures,
      engine: 'tesseract'
    };
  } finally {
    const resolvedTempRoot = path.resolve(tempRoot);
    const resolvedOsTemp = path.resolve(os.tmpdir());
    if (resolvedTempRoot.startsWith(`${resolvedOsTemp}${path.sep}`)) {
      await fs.rm(resolvedTempRoot, { recursive: true, force: true }).catch(() => {});
    }
  }
}

async function ocrPdfWithNode(file, options = {}) {
  await ensureNodeOcrAvailable();
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const [{ createCanvas }, pdfjs] = await Promise.all([
    Promise.resolve(require('@napi-rs/canvas')),
    import('pdfjs-dist/legacy/build/pdf.mjs')
  ]);
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(file.buffer),
    disableWorker: true,
    useSystemFonts: true,
    isEvalSupported: false
  });
  const pdf = await loadingTask.promise;
  const pageCount = pdf.numPages;
  const pageTexts = new Array(pageCount);
  const failures = [];
  const dpi = Math.max(120, Math.min(220, Number(process.env.LEXIA_OCR_DPI || 160)));
  const scale = dpi / 72;
  onProgress({
    phase: 'local_ocr',
    progress: 5,
    completedPages: 0,
    totalPages: pdf.numPages,
    pageTexts
  });

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    try {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext('2d');
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      const image = canvas.toBuffer('image/jpeg', 88);
      const result = await withGlobalOcrSlot(async () => {
        const worker = await getNodeOcrWorker();
        return worker.recognize(image);
      });
      const text = String(result?.data?.text || '')
        .replace(/\u0000/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .trim();
      if (text.length >= 8) pageTexts[pageNumber - 1] = text;
      else failures.push({ pageNumber, reason: 'sin texto legible' });
      page.cleanup();
    } catch (error) {
      failures.push({ pageNumber, reason: error.message });
    }
    onProgress({
      phase: 'local_ocr',
      progress: 10 + Math.round((pageNumber / pdf.numPages) * 75),
      completedPages: pageNumber,
      totalPages: pdf.numPages,
      pageTexts
    });
  }
  await loadingTask.destroy();

  const successfulPages = pageTexts.filter(Boolean).length;
  if (!successfulPages) {
    const firstReason = failures[0]?.reason ? ` Motivo: ${failures[0].reason}` : '';
    throw new Error(`El OCR local Node no pudo recuperar texto legible de ninguna página.${firstReason}`);
  }
  const text = pageTexts
    .map((pageText, index) => pageText ? `## Página ${index + 1}\n${pageText}` : '')
    .filter(Boolean)
    .join('\n\n');
  return {
    text,
    pageTexts,
    pageCount,
    successfulPages,
    failedPages: failures,
    engine: 'tesseract.js'
  };
}

async function ocrPdfLocally(file, options = {}) {
  try {
    await ensureSystemOcrAvailable();
    return await ocrPdfWithSystemTools(file, options);
  } catch (systemError) {
    try {
      return await ocrPdfWithNode(file, options);
    } catch (nodeError) {
      const error = new Error(
        `Los motores OCR locales fallaron. Sistema: ${systemError.message} Node: ${nodeError.message}`
      );
      error.code = 'LOCAL_OCR_FAILED';
      throw error;
    }
  }
}

async function terminateNodeOcrWorker() {
  if (!nodeOcrWorkerPromise) return;
  try {
    const worker = await nodeOcrWorkerPromise;
    await worker.terminate();
  } finally {
    nodeOcrWorkerPromise = null;
  }
}

module.exports = {
  ensureLocalOcrAvailable,
  ocrPdfLocally,
  ocrPdfWithNode,
  terminateNodeOcrWorker
};
