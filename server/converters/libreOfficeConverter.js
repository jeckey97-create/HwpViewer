const fs = require('fs/promises');
const path = require('path');
const { Buffer } = require('buffer');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const libreOfficeCandidates = [
  process.env.LIBREOFFICE_PATH,
  'soffice',
  'libreoffice',
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
].filter(Boolean);

function createLibreOfficeConverter({ tmpDir, convertedDir, cryptoRandomId }) {
  return {
    name: 'libreOfficeConverter',
    convertToPdf: inputPath =>
      convertWithLibreOffice(inputPath, {
        tmpDir,
        convertedDir,
        cryptoRandomId,
      }),
  };
}

async function convertWithLibreOffice(inputPath, context) {
  const { tmpDir, convertedDir, cryptoRandomId } = context;
  await fs.mkdir(convertedDir, { recursive: true });

  const sofficePath = await resolveLibreOfficePath();
  console.log(`[convert] converter=libreOfficeConverter`);
  await logExistingLibreOfficeProcesses();
  await logInputMagicNumber(inputPath);

  const outputFileName = `${path.basename(
    inputPath,
    path.extname(inputPath),
  )}.pdf`;
  const outputPath = path.join(convertedDir, outputFileName);
  const userProfileDir = path.join(tmpDir, `lo-profile-${cryptoRandomId()}`);
  const userInstallation = pathToFileUrl(userProfileDir);

  await fs.rm(outputPath, { force: true });
  await fs.mkdir(userProfileDir, { recursive: true });
  const beforeFiles = await listOutputFiles(convertedDir);

  const baseArgs = [
    `-env:UserInstallation=${userInstallation}`,
    '--headless',
    '--nologo',
    '--nofirststartwizard',
    '--norestore',
    '--nolockcheck',
  ];
  const convertArgsCandidates = [
    [...baseArgs, '--convert-to', 'pdf', '--outdir', convertedDir, inputPath],
    [
      ...baseArgs,
      '--convert-to',
      'pdf:writer_pdf_Export',
      '--outdir',
      convertedDir,
      inputPath,
    ],
  ];

  let lastConversionError = null;
  let generatedPdfPath = null;
  for (const args of convertArgsCandidates) {
    const startedAt = Date.now();
    console.log('[convert] LibreOffice conversion start');
    try {
      const { stdout, stderr } = await execFileAsync(sofficePath, args, {
        windowsHide: true,
        timeout: 120000,
      });
      logConverterOutput('LibreOffice stdout', stdout);
      logConverterOutput('LibreOffice stderr', stderr);
      console.log('[convert] LibreOffice exit code=0');
    } catch (error) {
      logConverterOutput('LibreOffice stdout', error.stdout);
      logConverterOutput('LibreOffice stderr', error.stderr);
      console.log(`[convert] LibreOffice exit code=${error.code ?? 'unknown'}`);
      lastConversionError = error;
    }

    const afterFiles = await listOutputFiles(convertedDir);
    generatedPdfPath =
      findGeneratedPdf(afterFiles, beforeFiles, startedAt) ||
      ((await pathExists(outputPath)) ? outputPath : null);

    if (generatedPdfPath) {
      break;
    }
  }

  const finalFiles = await listOutputFiles(convertedDir);
  const pdfExists = Boolean(generatedPdfPath);
  console.log(`[convert] PDF exists=${pdfExists}`);
  if (!pdfExists) {
    console.log(
      '[convert] GUI opens this file, but headless conversion failed',
    );
    if (lastConversionError) {
      console.log(
        `[convert] last LibreOffice error message=${
          lastConversionError.message || ''
        }`,
      );
    }
    const error = new Error('원본보기 변환에 실패하여 기본보기로 엽니다.');
    error.statusCode = 500;
    error.cause = new Error('LibreOffice did not create a PDF file.');
    throw error;
  }

  await fs.rm(userProfileDir, { recursive: true, force: true }).catch(() => {});
  console.log('[convert] selected PDF path ready');
  return generatedPdfPath;
}

async function logInputMagicNumber(inputPath) {
  const file = await fs.open(inputPath, 'r');
  try {
    const buffer = Buffer.alloc(8);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    const bytes = buffer.subarray(0, bytesRead);
    const hex = bytes.toString('hex');
    const ascii = bytes.toString('ascii').replace(/[^\x20-\x7e]/g, '.');
    const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[convert] input magic hex=${hex}`);
      console.log(`[convert] input magic ascii=${ascii}`);
      console.log(`[convert] input looks like ZIP/HWPX=${isZip}`);
    } else {
      console.log(`[convert] input looks like ZIP/HWPX=${isZip}`);
    }
  } finally {
    await file.close();
  }
}

async function logExistingLibreOfficeProcesses() {
  if (process.platform !== 'win32') {
    return;
  }

  try {
    const { stdout } = await execFileAsync('tasklist', {
      windowsHide: true,
      timeout: 10000,
    });
    const lines = stdout
      .split(/\r?\n/)
      .filter(line => /^soffice(\.bin|\.exe)?\s/i.test(line));

    if (lines.length) {
      console.log(
        '[convert] Existing soffice.exe/soffice.bin process detected. This can affect headless conversion on Windows; using isolated UserInstallation profile for this conversion.',
      );
    } else {
      console.log('[convert] Existing LibreOffice processes=(none)');
    }
  } catch (error) {
    console.log(
      `[convert] Existing LibreOffice process check failed=${
        error.message || error
      }`,
    );
  }
}

function logConverterOutput(label, output) {
  if (!output) {
    return;
  }

  if (process.env.NODE_ENV === 'production') {
    console.log(`[convert] ${label} length=${String(output).length}`);
  } else {
    console.log(`[convert] ${label}=${output}`);
  }
}

function pathToFileUrl(filePath) {
  return `file:///${filePath.replace(/\\/g, '/').replace(/ /g, '%20')}`;
}

async function listOutputFiles(directory) {
  await fs.mkdir(directory, { recursive: true });
  const names = await fs.readdir(directory);
  const files = [];

  for (const name of names) {
    const filePath = path.join(directory, name);
    const stat = await fs.stat(filePath);
    files.push({
      name,
      path: filePath,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
    });
  }

  return files.sort((a, b) => a.name.localeCompare(b.name));
}

function formatFileList(files) {
  if (!files.length) {
    return '(empty)';
  }

  return files
    .map(
      file =>
        `${file.name} size=${file.size} mtimeMs=${Math.round(file.mtimeMs)}`,
    )
    .join(' | ');
}

function findGeneratedPdf(afterFiles, beforeFiles, startedAt) {
  const beforeByPath = new Map(beforeFiles.map(file => [file.path, file]));
  const pdfs = afterFiles.filter(file =>
    file.name.toLowerCase().endsWith('.pdf'),
  );
  const generated = pdfs.filter(file => {
    const before = beforeByPath.get(file.path);
    return (
      !before || file.mtimeMs >= startedAt - 1000 || file.size !== before.size
    );
  });

  const newest = generated.sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
  return newest?.path || null;
}

async function resolveLibreOfficePath() {
  const checkedPaths = [];

  for (const candidate of libreOfficeCandidates) {
    checkedPaths.push(candidate);

    if (candidate.includes('\\') || candidate.includes('/')) {
      if (await pathExists(candidate)) {
        return candidate;
      }
      continue;
    }

    try {
      await execFileAsync(candidate, ['--version'], {
        windowsHide: true,
        timeout: 10000,
      });
      return candidate;
    } catch {}
  }

  const error = new Error(
    `LibreOffice executable was not found. Set LIBREOFFICE_PATH or install LibreOffice. Checked: ${checkedPaths.join(
      ', ',
    )}`,
  );
  error.statusCode = 500;
  throw error;
}

async function pathExists(filePath) {
  return fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);
}

module.exports = {
  createLibreOfficeConverter,
  resolveLibreOfficePath,
};
