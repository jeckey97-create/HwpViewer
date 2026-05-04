const express = require('express');
const fs = require('fs/promises');
const multer = require('multer');
const path = require('path');
const { Buffer } = require('buffer');
const { createDocumentConverter } = require('./converters/documentConverter');
const { resolveLibreOfficePath } = require('./converters/libreOfficeConverter');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const TMP_DIR = path.join(__dirname, 'tmp');
const UPLOAD_DIR = path.join(TMP_DIR, 'uploads');
const DEBUG_DIR = path.join(TMP_DIR, 'debug');
const PUBLIC_DIR = path.join(__dirname, 'public');
const CONVERTED_DIR = path.join(PUBLIC_DIR, 'converted');

const allowedExtensions = new Set(['.hwp', '.hwpx']);
const documentConverter = createDocumentConverter({
  tmpDir: TMP_DIR,
  convertedDir: CONVERTED_DIR,
  cryptoRandomId,
});

app.use((req, _res, next) => {
  console.log(`[server] ${req.method} ${req.path}`);
  next();
});

async function ensureUploadDir() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

async function ensureConvertedDir() {
  await fs.mkdir(CONVERTED_DIR, { recursive: true });
}

async function ensureDebugDir() {
  await fs.mkdir(DEBUG_DIR, { recursive: true });
}

function getSafeOriginalName(file) {
  return Buffer.from(file.originalname, 'latin1').toString('utf8');
}

function validateHwpFile(file) {
  const originalName = getSafeOriginalName(file);
  const extension = path.extname(originalName).toLowerCase();

  if (!allowedExtensions.has(extension)) {
    const error = new Error('Only .hwp and .hwpx files are supported.');
    error.statusCode = 400;
    throw error;
  }

  return { originalName, extension };
}

const storage = multer.diskStorage({
  destination: async (_req, _file, callback) => {
    try {
      await ensureUploadDir();
      callback(null, UPLOAD_DIR);
    } catch (error) {
      callback(error);
    }
  },
  filename: (_req, file, callback) => {
    const originalName = getSafeOriginalName(file);
    const extension = path.extname(originalName).toLowerCase();
    const uniqueName = `${Date.now()}-${cryptoRandomId()}${extension}`;
    callback(null, uniqueName);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, callback) => {
    try {
      validateHwpFile(file);
      callback(null, true);
    } catch (error) {
      callback(error);
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024,
    files: 1,
  },
});

async function convertHwpToPdf(inputPath) {
  await ensureConvertedDir();
  console.log(`[convert] selected converter=${documentConverter.name}`);
  return documentConverter.convertToPdf(inputPath);
}

app.use('/converted', express.static(CONVERTED_DIR));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/viewer', (req, res) => {
  const fileUrl = typeof req.query.file === 'string' ? req.query.file : '';

  if (!fileUrl) {
    return res.status(400).send('Missing PDF file URL.');
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.send(createPdfViewerHtml(fileUrl));
});

app.post(
  '/api/documents/convert-to-pdf',
  (_req, _res, next) => {
    console.log('[convert] request received');
    next();
  },
  upload.single('file'),
  async (req, res, next) => {
    const uploadedPath = req.file?.path;
    let conversionFailed = false;

    try {
      if (!req.file || !uploadedPath) {
        return res.status(400).json({ error: 'A document file is required.' });
      }

      const { originalName, extension } = validateHwpFile(req.file);
      console.log(`[convert] uploaded file name=${originalName}`);
      console.log(`[convert] uploaded file extension=${extension}`);
      console.log(`[convert] uploaded file size=${req.file.size}`);
      console.log(`[convert] uploaded temp path=${uploadedPath}`);
      const pdfPath = await convertHwpToPdf(uploadedPath);
      const pdfUrl = `${req.protocol}://${req.get(
        'host',
      )}/converted/${encodeURIComponent(path.basename(pdfPath))}`;
      console.log(`[convert] response pdfUrl=${pdfUrl}`);
      return res.json({ pdfUrl });
    } catch (error) {
      conversionFailed = true;
      if (uploadedPath) {
        await copyFailedUploadForDebug(uploadedPath).catch(copyError => {
          console.error(
            `[convert] failed upload debug copy error=${
              copyError.message || copyError
            }`,
          );
        });
      }
      return next(error);
    } finally {
      if (uploadedPath) {
        // Delete uploads promptly because documents can contain private data.
        // TODO: Add lifecycle cleanup for orphaned temp files on process restart.
        if (conversionFailed && isDevelopmentMode()) {
          console.log(
            `[convert] development mode keeps failed temp upload=${uploadedPath}`,
          );
        } else {
          await fs.unlink(uploadedPath).catch(() => {});
        }
      }
    }
  },
);

app.use((error, _req, res, _next) => {
  const statusCode = error.statusCode || 500;
  const message = getErrorMessage(error, statusCode);

  console.error(`[convert] error message=${error.message || 'Unknown error'}`);
  if (error.stack) {
    console.error(`[convert] error stack=${error.stack}`);
  }

  res.status(statusCode).json({ error: message });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(
      `Document conversion API listening on http://localhost:${PORT}`,
    );
  });
}

function cryptoRandomId() {
  return Math.random().toString(36).slice(2, 10);
}

async function copyFailedUploadForDebug(uploadedPath) {
  if (!isDevelopmentMode()) {
    return;
  }

  await ensureDebugDir();
  const debugPath = path.join(DEBUG_DIR, path.basename(uploadedPath));
  await fs.copyFile(uploadedPath, debugPath);
  console.log(`[convert] failed upload copied to debug=${debugPath}`);
}

function isDevelopmentMode() {
  return process.env.NODE_ENV !== 'production';
}

function getErrorMessage(error, statusCode) {
  if (error instanceof multer.MulterError) {
    return error.code === 'LIMIT_FILE_SIZE'
      ? 'Uploaded file is too large.'
      : 'Invalid upload request.';
  }

  return error.message || 'Document conversion failed.';
}

function createPdfViewerHtml(fileUrl) {
  const encodedFileUrl = JSON.stringify(fileUrl);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>PDF Viewer</title>
  <style>
    html, body {
      width: 100%;
      min-height: 100%;
      margin: 0;
      background: #f3f4f6;
      color: #111827;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    #status {
      padding: 16px;
      text-align: center;
      color: #4b5563;
      font-size: 14px;
    }
    #pages {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 12px;
      box-sizing: border-box;
    }
    canvas {
      width: 100%;
      height: auto;
      max-width: 960px;
      background: #fff;
      box-shadow: 0 1px 4px rgba(15, 23, 42, 0.18);
    }
  </style>
</head>
<body>
  <div id="status">문서를 여는 중입니다...</div>
  <div id="pages"></div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
  <script>
    const fileUrl = ${encodedFileUrl};
    const statusEl = document.getElementById('status');
    const pagesEl = document.getElementById('pages');

    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    async function renderPdf() {
      try {
        const pdf = await pdfjsLib.getDocument({ url: fileUrl }).promise;
        statusEl.textContent = '';

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1 });
          const containerWidth = Math.max(document.documentElement.clientWidth - 24, 320);
          const scale = Math.min(containerWidth / viewport.width, 2.5);
          const scaledViewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');

          canvas.width = Math.floor(scaledViewport.width);
          canvas.height = Math.floor(scaledViewport.height);
          pagesEl.appendChild(canvas);

          await page.render({ canvasContext: context, viewport: scaledViewport }).promise;
        }
      } catch (error) {
        console.error(error);
        statusEl.textContent = '문서를 열 수 없습니다.';
      }
    }

    renderPdf();
  </script>
</body>
</html>`;
}

module.exports = { app, convertHwpToPdf, resolveLibreOfficePath };
