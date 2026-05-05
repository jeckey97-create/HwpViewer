import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { parseFile, ParsedDocument } from '../utils/hwpxParser';
import { convertDocumentToPdf } from '../utils/pdfConverter';
import { debugError, debugLog, debugWarn } from '../utils/logger';

interface Props {
  fileUri: string;
}

export default function ViewerScreen({ fileUri }: Props): React.JSX.Element {
  const [doc, setDoc] = useState<ParsedDocument | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [viewerMode, setViewerMode] = useState<'pdf' | 'hwpx'>('pdf');
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfLoadFailed, setPdfLoadFailed] = useState(false);
  // DEV ONLY: remove debugStep after the Android viewer loading issue is diagnosed.
  const [_debugStep, setDebugStep] = useState('파일 감지됨');
  const [error, setError] = useState<string | null>(null);
  const pdfWebViewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const fileName = getOriginalFileName(fileUri);
  const isHwpxFile = isHwpxDocument(fileUri);

  const loadFile = useCallback(async () => {
    if (!fileUri) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setDoc(null);
    setPdfUrl(null);
    setPdfLoading(false);
    setPdfLoadFailed(false);
    setViewerMode('pdf');
    setDebugStep('파일 감지됨');
    clearPdfWebViewTimeout(pdfWebViewTimeoutRef);

    if (!isHwpDocument(fileUri)) {
      try {
        const parsed = await withTimeout(
          parseFile(fileUri),
          20000,
          'Document parsing timed out.',
        );
        setDoc(parsed);
        setViewerMode('hwpx');
      } catch {
        setError('문서를 열 수 없습니다.');
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      setDebugStep('PDF 변환 시작');
      if (isHwpxFile) {
        debugLog('[ViewerScreen] .hwpx open: conversion will be called');
      }
      debugLog('[ViewerScreen] convertDocumentToPdf: before call');
      const converted = await convertDocumentToPdf(fileUri, {
        timeoutMs: 60000,
        onDebugStep: setDebugStep,
      });
      debugLog('[ViewerScreen] convertDocumentToPdf: success');
      debugLog('[ViewerScreen] server response pdfUrl received');
      setDebugStep('pdfUrl 수신');
      setPdfUrl(converted.pdfUrl);
      setPdfLoading(true);
      setDebugStep('PDF Viewer 렌더링 시작');
      startPdfWebViewTimeout(pdfWebViewTimeoutRef, () => {
        setDebugStep('PDF WebView 20초 타임아웃');
        setPdfLoading(false);
        setPdfLoadFailed(true);
      });
    } catch (e: any) {
      const failureReason = getErrorMessage(e);
      debugError('[ViewerScreen] convertDocumentToPdf failed', {
        message: failureReason,
        name: e?.name || 'UnknownError',
      });
      if (e?.stack) {
        debugError('[ViewerScreen] convertDocumentToPdf failed stack', {
          stack: e.stack,
        });
      }
      setDebugStep(`API 실패: ${failureReason}`);
      debugWarn('[ViewerScreen] Falling back to HWPX direct rendering', {
        reason: failureReason,
      });
      try {
        const parsed = await withTimeout(
          parseFile(fileUri),
          20000,
          'HWPX fallback parsing timed out.',
        );
        setDoc(parsed);
        setViewerMode('hwpx');
      } catch {
        setError('문서를 열 수 없습니다.');
      }
    } finally {
      setLoading(false);
    }
  }, [fileUri, isHwpxFile]);

  useEffect(() => {
    loadFile();
  }, [loadFile]);

  useEffect(() => {
    return () => clearPdfWebViewTimeout(pdfWebViewTimeoutRef);
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>문서를 여는 중입니다...</Text>
      </View>
    );
  }

  if (!fileUri) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>
          .hwp 또는 .hwpx 파일을 열어주세요
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>열기 실패</Text>
        <Text style={styles.errorMsg}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={loadFile}>
          <Text style={styles.retryText}>다시 시도</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (viewerMode === 'pdf' && pdfUrl) {
    return (
      <View style={styles.container}>
        <Header title={fileName} />
        {pdfLoadFailed ? (
          <View style={styles.center}>
            <Text style={styles.errorMsg}>문서를 열 수 없습니다.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={loadFile}>
              <Text style={styles.retryText}>다시 시도</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        <WebView
          source={{ uri: getPdfViewerUrl(pdfUrl) }}
          style={[styles.webview, pdfLoadFailed ? styles.hiddenWebview : null]}
          originWhitelist={['*']}
          startInLoadingState={true}
          onLoadStart={() => {
            setDebugStep('PDF WebView 로딩 시작');
            startPdfWebViewTimeout(pdfWebViewTimeoutRef, () => {
              setDebugStep('PDF WebView 20초 타임아웃');
              setPdfLoading(false);
              setPdfLoadFailed(true);
            });
            setPdfLoading(true);
            setPdfLoadFailed(false);
          }}
          onLoadEnd={() => {
            setDebugStep('PDF WebView 로딩 완료');
            clearPdfWebViewTimeout(pdfWebViewTimeoutRef);
            setPdfLoading(false);
          }}
          onError={() => {
            clearPdfWebViewTimeout(pdfWebViewTimeoutRef);
            setPdfLoading(false);
            setPdfLoadFailed(true);
          }}
          onHttpError={() => {
            clearPdfWebViewTimeout(pdfWebViewTimeoutRef);
            setPdfLoading(false);
            setPdfLoadFailed(true);
          }}
          renderLoading={() => (
            <View style={styles.webviewLoading}>
              <Text style={styles.webviewLoadingText}>
                문서를 여는 중입니다...
              </Text>
            </View>
          )}
        />
        {pdfLoading && !pdfLoadFailed ? (
          <View style={styles.webviewLoading}>
            <Text style={styles.webviewLoadingText}>
              문서를 여는 중입니다...
            </Text>
          </View>
        ) : null}
      </View>
    );
  }

  if (!doc) {
    return <View style={styles.center} />;
  }

  return renderHwpxFallback(doc);
}

function Header({ title }: { title: string }): React.JSX.Element {
  return (
    <View style={styles.header}>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}

function renderHwpxFallback(doc: ParsedDocument): React.JSX.Element {
  return (
    <View style={styles.container}>
      <Header title={doc.title} />
      <WebView
        source={{ html: doc.html }}
        style={styles.webview}
        originWhitelist={['*']}
        scalesPageToFit={false}
        showsVerticalScrollIndicator={true}
      />
    </View>
  );
}

function getPdfViewerUrl(pdfUrl: string): string {
  const viewerBaseUrl = getServerViewerBaseUrl(pdfUrl);
  return `${viewerBaseUrl}/viewer?file=${encodeURIComponent(pdfUrl)}`;
}

function getServerViewerBaseUrl(pdfUrl: string): string {
  try {
    const parsedUrl = new URL(pdfUrl);
    return `${parsedUrl.protocol}//${parsedUrl.host}`;
  } catch {
    return '';
  }
}

function isHwpDocument(fileUri: string): boolean {
  const cleanUri = fileUri.split('?')[0].split('#')[0].toLowerCase();
  return (
    cleanUri.endsWith('.hwp') ||
    cleanUri.endsWith('.hwpx') ||
    isAndroidContentUri(cleanUri)
  );
}

function isHwpxDocument(fileUri: string): boolean {
  const cleanUri = fileUri.split('?')[0].split('#')[0].toLowerCase();
  return cleanUri.endsWith('.hwpx');
}

function isAndroidContentUri(fileUri: string): boolean {
  return Platform.OS === 'android' && fileUri.startsWith('content://');
}

function getOriginalFileName(fileUri: string): string {
  const lastPart = fileUri.split('/').filter(Boolean).pop() || '문서';
  const cleanName = lastPart.split('?')[0].split('#')[0];

  try {
    return decodeURIComponent(cleanName);
  } catch {
    return cleanName;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  center: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },
  loadingText: { color: '#aaa', fontSize: 14 },
  errorTitle: { color: '#ff6b6b', fontSize: 18, fontWeight: 'bold' },
  errorMsg: {
    color: '#aaa',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    marginTop: 8,
    backgroundColor: '#4f8ef7',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  header: {
    backgroundColor: '#16213e',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 15, fontWeight: '700', flex: 1 },
  webview: { flex: 1, backgroundColor: '#fff' },
  hiddenWebview: { display: 'none' },
  webviewLoading: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  webviewLoadingText: { color: '#aaa', fontSize: 14 },
});

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);

    promise.then(
      value => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      error => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

function startPdfWebViewTimeout(
  timeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
  onTimeout: () => void,
): void {
  clearPdfWebViewTimeout(timeoutRef);
  timeoutRef.current = setTimeout(onTimeout, 20000);
}

function clearPdfWebViewTimeout(
  timeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
): void {
  if (timeoutRef.current) {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }
}

function getErrorMessage(error: any): string {
  if (error?.message) {
    return String(error.message);
  }

  return 'Unknown conversion error';
}
