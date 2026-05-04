import { Platform } from 'react-native';

export interface PdfConversionResult {
  pdfUrl: string;
}

export interface DocumentFileInfo {
  fileName: string;
  extension: 'hwp' | 'hwpx';
  mimeType: string;
}

export interface PdfConversionOptions {
  timeoutMs?: number;
  onDebugStep?: (step: string) => void;
}

type RuntimeProcess = {
  env?: Record<string, string | undefined>;
};

const MOCK_PDF_URL =
  'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';

const CONVERT_TO_PDF_PATH = '/api/documents/convert-to-pdf';
const DEFAULT_CONVERSION_TIMEOUT_MS = 60000;

// Development server address notes:
// - Android physical device with adb reverse: http://127.0.0.1:3000
// - Android emulator: http://10.0.2.2:3000
// - iOS simulator: http://127.0.0.1:3000
// - Physical device: http://<your-computer-LAN-IP>:3000
// Override with API_BASE_URL or DOCUMENT_CONVERSION_API_BASE_URL.
// React Native does not load .env files by default; use a bundler env plugin,
// native build config, or edit DEFAULT_API_BASE_URL for a physical device.
const DEFAULT_API_BASE_URL =
  Platform.OS === 'android' ? 'http://127.0.0.1:3000' : 'http://127.0.0.1:3000';

export const API_BASE_URL =
  getEnv('API_BASE_URL') ||
  getEnv('DOCUMENT_CONVERSION_API_BASE_URL') ||
  DEFAULT_API_BASE_URL;

const USE_MOCK_CONVERSION =
  getEnv('DOCUMENT_CONVERSION_USE_MOCK').toLowerCase() === 'true';

export async function convertDocumentToPdf(
  fileUri: string,
  options: PdfConversionOptions = {},
): Promise<PdfConversionResult> {
  const fileInfo = extractDocumentFileInfo(fileUri);
  const timeoutMs = options.timeoutMs ?? DEFAULT_CONVERSION_TIMEOUT_MS;
  const requestUrl = buildConvertEndpoint(API_BASE_URL);
  const healthUrl = buildHealthEndpoint(API_BASE_URL);

  if (USE_MOCK_CONVERSION) {
    return { pdfUrl: MOCK_PDF_URL };
  }

  const uploadFile = {
    uri: fileUri,
    name: fileInfo.fileName,
    type: fileInfo.mimeType,
  };
  const formData = new FormData();
  formData.append('file', uploadFile as any);

  console.log(`[pdfConverter] API_BASE_URL=${API_BASE_URL}`);
  console.log(`[pdfConverter] healthUrl=${healthUrl}`);
  console.log(`[pdfConverter] requestUrl=${requestUrl}`);
  console.log(`[pdfConverter] fileUri=${fileUri}`);
  console.log(`[pdfConverter] FormData file.uri=${uploadFile.uri}`);
  console.log(`[pdfConverter] FormData file.name=${uploadFile.name}`);
  console.log(`[pdfConverter] FormData file.type=${uploadFile.type}`);

  let response: Response;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    options.onDebugStep?.('서버 연결 확인');
    await checkHealth(healthUrl, timeoutMs);
    options.onDebugStep?.('서버 연결 성공');
    options.onDebugStep?.('API 요청 시작');
    response = await Promise.race([
      fetch(requestUrl, {
        method: 'POST',
        body: formData as any,
      }),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('Document conversion request timed out.')),
          timeoutMs,
        );
      }),
    ]);
    options.onDebugStep?.('API 응답 수신');
  } catch (error: any) {
    if (error?.message?.startsWith('서버 연결 실패')) {
      throw error;
    }
    console.error(
      `[pdfConverter] PDF conversion request failed after health success message=${
        error?.message || 'Unknown error'
      }`,
    );
    throw new Error(`PDF 변환 실패: ${error?.message || ''}`.trim());
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }

  let responseText = '';
  try {
    responseText = await response.text();
  } catch (error: any) {
    console.error(
      `[pdfConverter] response text read failed message=${
        error?.message || 'Unknown error'
      }`,
    );
  }

  if (!response.ok) {
    console.error(
      `[pdfConverter] HTTP error status=${response.status} responseText=${responseText}`,
    );
    throw new Error(
      `PDF 변환 실패: ${response.status} ${
        extractServerError(responseText) ||
        'Document conversion request failed.'
      }`.trim(),
    );
  }

  let data: Partial<PdfConversionResult> & { error?: string } = {};
  try {
    data = JSON.parse(responseText) as Partial<PdfConversionResult> & {
      error?: string;
    };
  } catch (error: any) {
    console.error(
      `[pdfConverter] response JSON parse failed message=${
        error?.message || 'Unknown error'
      } responseText=${responseText}`,
    );
  }

  if (!data.pdfUrl || typeof data.pdfUrl !== 'string') {
    console.error('[pdfConverter] pdfUrl 없음');
    throw new Error('pdfUrl 없음');
  }

  return { pdfUrl: data.pdfUrl };
}

export function extractDocumentFileInfo(fileUri: string): DocumentFileInfo {
  const cleanUri = fileUri.split('?')[0].split('#')[0];
  const rawFileName = cleanUri.split('/').filter(Boolean).pop() || 'document';
  const decodedFileName = safeDecodeURIComponent(rawFileName);
  const detectedExtension = decodedFileName.split('.').pop()?.toLowerCase();
  const extension =
    detectedExtension === 'hwp' || detectedExtension === 'hwpx'
      ? detectedExtension
      : inferDocumentExtension(fileUri);

  if (extension !== 'hwp' && extension !== 'hwpx') {
    throw new Error('Only .hwp and .hwpx files can be converted.');
  }

  const fileName = hasDocumentExtension(decodedFileName)
    ? decodedFileName
    : `document.${extension}`;

  return {
    fileName,
    extension,
    mimeType: extension === 'hwp' ? 'application/x-hwp' : 'application/hwpx',
  };
}

function buildConvertEndpoint(apiBaseUrl: string): string {
  return `${apiBaseUrl.replace(/\/$/, '')}${CONVERT_TO_PDF_PATH}`;
}

function buildHealthEndpoint(apiBaseUrl: string): string {
  return `${apiBaseUrl.replace(/\/$/, '')}/health`;
}

async function checkHealth(
  healthUrl: string,
  timeoutMs: number,
): Promise<void> {
  console.log(`[pdfConverter] health check start url=${healthUrl}`);
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    const response = await Promise.race([
      fetch(healthUrl),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('서버 연결 실패: health timeout')),
          timeoutMs,
        );
      }),
    ]);
    const responseText = await response.text();
    console.log(
      `[pdfConverter] health response status=${response.status} text=${responseText}`,
    );

    if (!response.ok) {
      throw new Error(`서버 연결 실패: health ${response.status}`);
    }
  } catch (error: any) {
    const message = error?.message || 'Network request failed';
    console.error(`[pdfConverter] health failed message=${message}`);
    throw new Error(
      message.startsWith('서버 연결 실패')
        ? message
        : `서버 연결 실패: ${message}`,
    );
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function extractServerError(responseText: string): string {
  if (!responseText) {
    return '';
  }

  try {
    const data = JSON.parse(responseText) as { error?: unknown };
    return typeof data.error === 'string' ? data.error : responseText;
  } catch {
    return responseText;
  }
}

function getEnv(name: string): string {
  const runtimeProcess = (
    globalThis as typeof globalThis & { process?: RuntimeProcess }
  ).process;

  return runtimeProcess?.env?.[name] || '';
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function inferDocumentExtension(fileUri: string): DocumentFileInfo['extension'] {
  const lowerUri = fileUri.toLowerCase();

  if (lowerUri.includes('hwpx')) {
    return 'hwpx';
  }

  return 'hwp';
}

function hasDocumentExtension(fileName: string): boolean {
  const lowerName = fileName.toLowerCase();
  return lowerName.endsWith('.hwp') || lowerName.endsWith('.hwpx');
}
