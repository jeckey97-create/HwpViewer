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
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 50 * 1024 * 1024);
const CONVERTED_FILE_TTL_MS = Number(
  process.env.CONVERTED_FILE_TTL_MS || 30 * 60 * 1000,
);
const CLEANUP_INTERVAL_MS = Number(
  process.env.CLEANUP_INTERVAL_MS || 5 * 60 * 1000,
);
const RATE_LIMIT_WINDOW_MS = Number(
  process.env.RATE_LIMIT_WINDOW_MS || 60 * 1000,
);
const RATE_LIMIT_MAX_REQUESTS = Number(
  process.env.RATE_LIMIT_MAX_REQUESTS || 12,
);
const MAX_VIEWER_FILE_URL_LENGTH = 2048;

const allowedExtensions = new Set(['.hwp', '.hwpx']);
const rateLimitBuckets = new Map();
const documentConverter = createDocumentConverter({
  tmpDir: TMP_DIR,
  convertedDir: CONVERTED_DIR,
  cryptoRandomId,
});

app.set('trust proxy', true);

app.use(securityHeaders);

app.use((req, _res, next) => {
  console.log(`[server] ${req.method} ${req.path} ip=${getClientIp(req)}`);
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
    fileSize: MAX_UPLOAD_BYTES,
    files: 1,
  },
});

async function convertHwpToPdf(inputPath) {
  await ensureConvertedDir();
  logInfo('[convert] selected converter', { converter: documentConverter.name });
  return documentConverter.convertToPdf(inputPath);
}

app.use(
  '/converted',
  express.static(CONVERTED_DIR, {
    dotfiles: 'deny',
    etag: false,
    fallthrough: false,
    index: false,
    maxAge: 0,
    setHeaders: res => {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
    },
  }),
);

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/viewer', (req, res) => {
  const fileUrl = typeof req.query.file === 'string' ? req.query.file : '';

  if (!fileUrl) {
    return res.status(400).send('Missing PDF file URL.');
  }

  if (!isAllowedViewerFileUrl(req, fileUrl)) {
    return res.status(400).send('Invalid PDF file URL.');
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.send(createPdfViewerHtml(fileUrl));
});

app.post(
  '/api/documents/convert-to-pdf',
  rateLimit,
  (_req, _res, next) => {
    logInfo('[convert] request received');
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

      const { extension } = validateHwpFile(req.file);
      logInfo('[convert] uploaded file accepted', {
        extension,
        size: req.file.size,
      });
      const pdfPath = await convertHwpToPdf(uploadedPath);
      const pdfUrl = `${req.protocol}://${req.get(
        'host',
      )}/converted/${encodeURIComponent(path.basename(pdfPath))}`;
      logInfo('[convert] conversion succeeded');
      return res.json({ pdfUrl });
    } catch (error) {
      conversionFailed = true;
      if (uploadedPath) {
        await copyFailedUploadForDebug(uploadedPath).catch(copyError => {
          logError('[convert] failed upload debug copy error', copyError);
        });
      }
      return next(error);
    } finally {
      if (uploadedPath) {
        if (conversionFailed && isDevelopmentMode()) {
          logInfo('[convert] development mode keeps failed temp upload');
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

  logError('[convert] request failed', error, { statusCode });

  res.status(statusCode).json({ error: message });
});

if (require.main === module) {
  startCleanupLoop();
  app.listen(PORT, () => {
    console.log(
      `Document conversion API listening on http://localhost:${PORT}`,
    );
  });
}

function cryptoRandomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function copyFailedUploadForDebug(uploadedPath) {
  if (!isDevelopmentMode()) {
    return;
  }

  await ensureDebugDir();
  const debugPath = path.join(DEBUG_DIR, path.basename(uploadedPath));
  await fs.copyFile(uploadedPath, debugPath);
  logInfo('[convert] failed upload copied to debug');
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

function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; script-src https://cdnjs.cloudflare.com; worker-src https://cdnjs.cloudflare.com blob:; connect-src 'self' https:; img-src 'self' data:; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
  );
  next();
}

function rateLimit(req, res, next) {
  const now = Date.now();
  const key = getClientIp(req);
  const bucket = rateLimitBuckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    rateLimitBuckets.set(key, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return next();
  }

  bucket.count += 1;
  if (bucket.count > RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({ error: 'Too many requests.' });
  }

  return next();
}

function getClientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function isAllowedViewerFileUrl(req, fileUrl) {
  if (fileUrl.length > MAX_VIEWER_FILE_URL_LENGTH) {
    return false;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(fileUrl);
  } catch {
    return false;
  }

  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    return false;
  }

  const requestHost = req.get('host');
  if (!requestHost) {
    return false;
  }

  return parsedUrl.host === requestHost && parsedUrl.pathname.startsWith('/converted/');
}

function startCleanupLoop() {
  cleanupExpiredFiles().catch(error => {
    logError('[cleanup] initial cleanup failed', error);
  });
  setInterval(() => {
    cleanupExpiredFiles().catch(error => {
      logError('[cleanup] cleanup failed', error);
    });
  }, CLEANUP_INTERVAL_MS).unref();
}

async function cleanupExpiredFiles() {
  const now = Date.now();
  await removeExpiredFiles(CONVERTED_DIR, now - CONVERTED_FILE_TTL_MS, ['.pdf']);
  await removeExpiredFiles(UPLOAD_DIR, now - CONVERTED_FILE_TTL_MS, ['.hwp', '.hwpx']);
}

async function removeExpiredFiles(directory, olderThanMs, extensions) {
  const entries = await fs.readdir(directory).catch(error => {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  });

  await Promise.all(
    entries.map(async entry => {
      const filePath = path.join(directory, entry);
      const stat = await fs.stat(filePath).catch(() => null);
      if (!stat?.isFile()) {
        return;
      }

      if (!extensions.includes(path.extname(entry).toLowerCase())) {
        return;
      }

      if (stat.mtimeMs > olderThanMs) {
        return;
      }

      await fs.unlink(filePath).catch(() => {});
    }),
  );
}

function logInfo(message, details) {
  if (details) {
    console.log(`${message} ${JSON.stringify(details)}`);
  } else {
    console.log(message);
  }
}

function logError(message, error, details = {}) {
  const safeError = {
    message: error?.message || String(error || 'Unknown error'),
    code: error?.code,
    ...details,
  };
  console.error(`${message} ${JSON.stringify(safeError)}`);
  if (isDevelopmentMode() && error?.stack) {
    console.error(error.stack);
  }
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
