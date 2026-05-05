import { Platform } from 'react-native';
import { debugError, debugLog } from './logger';

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

const DEFAULT_API_BASE_URL = __DEV__
  ? Platform.OS === 'android'
    ? 'http://127.0.0.1:3000'
    : 'http://127.0.0.1:3000'
  : '';

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

  validateApiBaseUrl(API_BASE_URL);

  const uploadFile = {
    uri: fileUri,
    name: fileInfo.fileName,
    type: fileInfo.mimeType,
  };
  const formData = new FormData();
  formData.append('file', uploadFile as any);

  debugLog('[pdfConverter] request prepared', {
    apiBaseUrl: API_BASE_URL,
    healthUrl,
    requestUrl,
    fileName: uploadFile.name,
    fileType: uploadFile.type,
  });

  let response: Response;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    options.onDebugStep?.('Checking server connection');
    await checkHealth(healthUrl, timeoutMs);
    options.onDebugStep?.('Server connection succeeded');
    options.onDebugStep?.('Starting API request');
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
    options.onDebugStep?.('Received API response');
  } catch (error: any) {
    if (error?.message?.startsWith('Server connection failed')) {
      throw error;
    }
    debugError('[pdfConverter] PDF conversion request failed after health success', {
      message: error?.message || 'Unknown error',
    });
    throw new Error(`PDF conversion failed: ${error?.message || ''}`.trim());
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }

  let responseText = '';
  try {
    responseText = await response.text();
  } catch (error: any) {
    debugError('[pdfConverter] response text read failed', {
      message: error?.message || 'Unknown error',
    });
  }

  if (!response.ok) {
    debugError('[pdfConverter] HTTP error', {
      status: response.status,
      responseText,
    });
    throw new Error(
      `PDF conversion failed: ${response.status} ${
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
    debugError('[pdfConverter] response JSON parse failed', {
      message: error?.message || 'Unknown error',
      responseText,
    });
  }

  if (!data.pdfUrl || typeof data.pdfUrl !== 'string') {
    debugError('[pdfConverter] pdfUrl missing');
    throw new Error('pdfUrl missing');
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
  debugLog('[pdfConverter] health check start', { healthUrl });
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    const response = await Promise.race([
      fetch(healthUrl),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('Server connection failed: health timeout')),
          timeoutMs,
        );
      }),
    ]);
    const responseText = await response.text();
    debugLog('[pdfConverter] health response', {
      status: response.status,
      responseText,
    });

    if (!response.ok) {
      throw new Error(`Server connection failed: health ${response.status}`);
    }
  } catch (error: any) {
    const message = error?.message || 'Network request failed';
    debugError('[pdfConverter] health failed', { message });
    throw new Error(
      message.startsWith('Server connection failed')
        ? message
        : `Server connection failed: ${message}`,
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

function validateApiBaseUrl(apiBaseUrl: string): void {
  if (!apiBaseUrl) {
    throw new Error('Document conversion API is not configured.');
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(apiBaseUrl);
  } catch {
    throw new Error('Document conversion API URL is invalid.');
  }

  if (parsedUrl.protocol === 'https:') {
    return;
  }

  const isLocalhost =
    parsedUrl.hostname === 'localhost' ||
    parsedUrl.hostname === '127.0.0.1' ||
    parsedUrl.hostname === '10.0.2.2';

  if (__DEV__ && parsedUrl.protocol === 'http:' && isLocalhost) {
    return;
  }

  throw new Error('Document conversion API must use HTTPS in release builds.');
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
