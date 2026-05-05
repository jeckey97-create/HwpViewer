const fs = require('fs/promises');
const path = require('path');
const {app, resolveLibreOfficePath} = require('./index');

const TMP_DIR = path.join(__dirname, 'tmp');
const CONVERTED_DIR = path.join(__dirname, 'public', 'converted');
const PORT = 3314;

async function main() {
  await fs.mkdir(TMP_DIR, {recursive: true});

  const txtFile = path.join(TMP_DIR, 'sample.txt');
  await fs.writeFile(txtFile, 'placeholder');

  const server = app.listen(PORT);

  try {
    const sofficePath = await resolveLibreOfficePath();
    console.log(`LibreOffice: ${sofficePath}`);

    await assertUpload(txtFile, 400);

    const samplePath = process.env.TEST_DOCUMENT_PATH;
    if (samplePath) {
      await assertUpload(samplePath, 200);
      await assertConvertedPdfExists();
    } else {
      const placeholderHwpx = path.join(TMP_DIR, 'sample.hwpx');
      await fs.writeFile(placeholderHwpx, 'not a real hwpx file');
      await assertUpload(placeholderHwpx, 500);
      await fs.unlink(placeholderHwpx).catch(() => {});
      console.log(
        'No TEST_DOCUMENT_PATH was provided; verified invalid HWPX conversion failure.',
      );
    }

    console.log('convert-to-pdf API test completed');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await fs.unlink(txtFile).catch(() => {});
  }
}

async function assertUpload(filePath, expectedStatus) {
  const formData = new FormData();
  const fileBuffer = await fs.readFile(filePath);
  const fileBlob = new Blob([fileBuffer]);
  formData.append('file', fileBlob, path.basename(filePath));

  const response = await fetch(
    `http://127.0.0.1:${PORT}/api/documents/convert-to-pdf`,
    {
      method: 'POST',
      body: formData,
    },
  );

  const body = await response.json();
  if (response.status !== expectedStatus) {
    throw new Error(
      `${path.basename(filePath)} expected ${expectedStatus}, got ${
        response.status
      }: ${JSON.stringify(body)}`,
    );
  }

  if (expectedStatus === 200 && typeof body.pdfUrl !== 'string') {
    throw new Error(`${path.basename(filePath)} response is missing pdfUrl`);
  }

  console.log(`${path.basename(filePath)} -> ${response.status}`);
  if (body.pdfUrl) {
    console.log(`pdfUrl: ${body.pdfUrl}`);
  }
  if (body.error) {
    console.log(`error: ${body.error}`);
  }
}

async function assertConvertedPdfExists() {
  const entries = await fs.readdir(CONVERTED_DIR);
  const pdfFiles = entries.filter(entry => entry.toLowerCase().endsWith('.pdf'));

  if (pdfFiles.length === 0) {
    throw new Error('No converted PDF file was created.');
  }

  console.log(`converted PDF: ${pdfFiles[pdfFiles.length - 1]}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
