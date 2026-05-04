const fs = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const HANCOM_SCRIPT = path.join(__dirname, 'scripts', 'convertWithHancom.ps1');

function createHancomConverter({ convertedDir }) {
  return {
    name: 'hancomConverter',
    convertToPdf: inputPath => convertWithHancom(inputPath, convertedDir),
  };
}

async function convertWithHancom(inputPath, convertedDir) {
  await fs.mkdir(convertedDir, { recursive: true });

  const outputPath = path.join(
    convertedDir,
    `${path.basename(inputPath, path.extname(inputPath))}.pdf`,
  );

  await fs.rm(outputPath, { force: true });
  console.log('[convert] converter=hancomConverter');
  console.log(`[convert] Hancom input=${inputPath}`);
  console.log(`[convert] Hancom expected PDF path=${outputPath}`);

  try {
    const { stdout, stderr } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        HANCOM_SCRIPT,
        '-InputPath',
        inputPath,
        '-OutputPath',
        outputPath,
      ],
      {
        windowsHide: true,
        timeout: 180000,
        maxBuffer: 1024 * 1024,
      },
    );
    console.log(`[convert] Hancom stdout=${stdout || ''}`);
    console.log(`[convert] Hancom stderr=${stderr || ''}`);
    console.log('[convert] Hancom exit code=0');
  } catch (error) {
    console.log(`[convert] Hancom stdout=${error.stdout || ''}`);
    console.log(`[convert] Hancom stderr=${error.stderr || ''}`);
    console.log(`[convert] Hancom exit code=${error.code ?? 'unknown'}`);
    const conversionError = new Error(
      '원본보기 변환에 실패하여 기본보기로 엽니다.',
    );
    conversionError.statusCode = 500;
    conversionError.cause = error;
    throw conversionError;
  }

  if (!(await pathExists(outputPath))) {
    const error = new Error('원본보기 변환에 실패하여 기본보기로 엽니다.');
    error.statusCode = 500;
    error.cause = new Error('Hancom HWP did not create a PDF file.');
    throw error;
  }

  const stat = await fs.stat(outputPath);
  console.log(`[convert] Hancom PDF exists=true size=${stat.size}`);
  return outputPath;
}

async function pathExists(filePath) {
  return fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);
}

module.exports = { createHancomConverter };
