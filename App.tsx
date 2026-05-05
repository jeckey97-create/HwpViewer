import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Linking } from 'react-native';
import ViewerScreen from './src/screens/ViewerScreen';
import { debugError } from './src/utils/logger';

interface AppState {
  filePath: string | null;
  loading: boolean;
}

export default function App(): React.JSX.Element {
  const [state, setState] = useState<AppState>({
    filePath: null,
    loading: true,
  });

  const handleFileUrl = useCallback((url: string | null) => {
    if (!url) {
      setState({ filePath: null, loading: false });
      return;
    }

    setState({ filePath: url, loading: false });
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadInitialUrl = async () => {
      try {
        const initialUrl = await withTimeout(Linking.getInitialURL(), 3000);
        if (mounted) {
          handleFileUrl(initialUrl);
        }
      } catch (error) {
        debugError('[App] initial URL failed', { error });
        if (mounted) {
          setState({ filePath: null, loading: false });
        }
      }
    };

    loadInitialUrl();

    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleFileUrl(url);
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [handleFileUrl]);

  if (state.loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
        <ActivityIndicator size="large" color="#4f8ef7" />
        <Text style={styles.loadingText}>로딩 중...</Text>
      </View>
    );
  }

  if (!state.filePath) {
    return (
      <View style={styles.emptyContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
        <Text style={styles.emptyIcon}>HWP</Text>
        <Text style={styles.emptyTitle}>HWP 뷰어</Text>
        <Text style={styles.emptyDesc}>
          .hwp 또는 .hwpx 파일을 공유하거나 직접 열어주세요
        </Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
      <ViewerScreen fileUri={state.filePath} />
    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    color: '#aaa',
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  emptyIcon: {
    color: '#4f8ef7',
    fontSize: 36,
    fontWeight: '800',
    marginBottom: 8,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  emptyDesc: {
    color: '#888',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
});

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T | null> {
  return new Promise(resolve => {
    const timeoutId = setTimeout(() => resolve(null), timeoutMs);

    promise.then(
      value => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      () => {
        clearTimeout(timeoutId);
        resolve(null);
      },
    );
  });
}
