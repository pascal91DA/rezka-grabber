import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Share } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Clipboard from 'expo-clipboard';
import { Movie } from '../types/Movie';
import { useTheme } from '../context/ThemeContext';
import { toMirror } from '../services/mirrorService';

interface DebugWebViewScreenProps {
  route: {
    params: {
      movie: Movie;
    };
  };
}

interface CapturedRequest {
  id: number;
  method: string;
  url: string;
  timestamp: string;
  type: 'fetch' | 'xhr';
  requestData?: any;
}

export const DebugWebViewScreen: React.FC<DebugWebViewScreenProps> = ({ route }) => {
  const { movie } = route.params;
  const theme = useTheme();
  const webViewRef = useRef<WebView>(null);
  const [capturedRequests, setCapturedRequests] = useState<CapturedRequest[]>([]);
  const [isCapturing, setIsCapturing] = useState(true);

  // JavaScript код для перехвата запросов
  const injectedJavaScript = `
    (function() {
      const capturedRequests = [];
      let requestId = 0;

      // Перехват fetch API
      const originalFetch = window.fetch;
      window.fetch = function(...args) {
        const url = args[0];
        const options = args[1] || {};

        const request = {
          id: requestId++,
          method: options.method || 'GET',
          url: typeof url === 'string' ? url : url.url,
          timestamp: new Date().toISOString(),
          type: 'fetch',
          requestData: options.body
        };

        // Отправляем информацию в React Native
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'request',
          data: request
        }));

        return originalFetch.apply(this, args);
      };

      // Перехват XMLHttpRequest
      const originalXHROpen = XMLHttpRequest.prototype.open;
      const originalXHRSend = XMLHttpRequest.prototype.send;

      XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this._captureData = {
          id: requestId++,
          method: method,
          url: url,
          timestamp: new Date().toISOString(),
          type: 'xhr'
        };
        return originalXHROpen.apply(this, [method, url, ...rest]);
      };

      XMLHttpRequest.prototype.send = function(data) {
        if (this._captureData) {
          this._captureData.requestData = data;

          // Отправляем информацию в React Native
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'request',
            data: this._captureData
          }));
        }
        return originalXHRSend.apply(this, arguments);
      };

      // Логируем, что скрипт инициализирован
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'log',
        message: 'Request interceptor initialized'
      }));
    })();
    true; // Важно для WebView
  `;

  const handleWebViewMessage = (event: any) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);

      if (message.type === 'request' && isCapturing) {
        setCapturedRequests((prev) => [message.data, ...prev]);
      } else if (message.type === 'log') {
        console.log('[WebView]', message.message);
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  };

  const copyRequestToClipboard = async (request: CapturedRequest) => {
    const text = `Method: ${request.method}\nURL: ${request.url}\nType: ${request.type}\nTime: ${request.timestamp}${request.requestData ? `\nData: ${request.requestData}` : ''}`;
    await Clipboard.setStringAsync(text);
    console.log('Скопировано в буфер обмена');
  };

  const shareAllRequests = async () => {
    const text = capturedRequests
      .map((req) => `[${req.timestamp}] ${req.method} ${req.url}`)
      .join('\n\n');

    try {
      await Share.share({
        message: text,
        title: 'Перехваченные запросы',
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const clearRequests = () => {
    setCapturedRequests([]);
  };

  return (
    <View style={styles.container}>
      {/* WebView с загруженной страницей фильма */}
      <View style={[styles.webViewContainer, { borderBottomColor: theme.accentStrong }]}>
        <WebView
          ref={webViewRef}
          source={{ uri: toMirror(movie.url) }}
          injectedJavaScript={injectedJavaScript}
          onMessage={handleWebViewMessage}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          userAgent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36"
        />
      </View>

      {/* Панель управления */}
      <View style={styles.controlPanel}>
        <View style={styles.controlRow}>
          <TouchableOpacity
            style={[styles.controlButton, isCapturing && { backgroundColor: theme.accentStrong }]}
            onPress={() => setIsCapturing(!isCapturing)}
          >
            <Text style={styles.controlButtonText}>{isCapturing ? '⏸ Пауза' : '▶ Захват'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.controlButton} onPress={clearRequests}>
            <Text style={styles.controlButtonText}>🗑 Очистить</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.controlButton}
            onPress={shareAllRequests}
            disabled={capturedRequests.length === 0}
          >
            <Text style={styles.controlButtonText}>📤 Экспорт</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.counterText}>Перехвачено: {capturedRequests.length} запросов</Text>
      </View>

      {/* Список перехваченных запросов */}
      <ScrollView style={styles.requestsList}>
        {capturedRequests.map((request) => (
          <TouchableOpacity
            key={request.id}
            style={[styles.requestItem, { borderLeftColor: theme.accentStrong }]}
            onPress={() => copyRequestToClipboard(request)}
            onLongPress={() => copyRequestToClipboard(request)}
          >
            <View style={styles.requestHeader}>
              <Text style={styles.requestMethod}>{request.method}</Text>
              <Text style={styles.requestType}>{request.type.toUpperCase()}</Text>
              <Text style={styles.requestTime}>
                {new Date(request.timestamp).toLocaleTimeString()}
              </Text>
            </View>
            <Text style={styles.requestUrl} numberOfLines={3}>
              {request.url}
            </Text>
            {request.requestData && (
              <Text style={styles.requestData} numberOfLines={2}>
                Data:{' '}
                {typeof request.requestData === 'string'
                  ? request.requestData.substring(0, 100)
                  : JSON.stringify(request.requestData).substring(0, 100)}
                ...
              </Text>
            )}
          </TouchableOpacity>
        ))}

        {capturedRequests.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              Взаимодействуйте со страницей выше,{'\n'}
              чтобы увидеть перехваченные запросы
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  webViewContainer: {
    height: '40%',
    borderBottomWidth: 2,
  },
  controlPanel: {
    backgroundColor: '#2a2a2a',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  controlButton: {
    flex: 1,
    backgroundColor: '#444',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  controlButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  counterText: {
    color: '#aaa',
    fontSize: 12,
    textAlign: 'center',
  },
  requestsList: {
    flex: 1,
  },
  requestItem: {
    backgroundColor: '#2a2a2a',
    padding: 12,
    marginHorizontal: 8,
    marginVertical: 4,
    borderRadius: 8,
    borderLeftWidth: 3,
  },
  requestHeader: {
    flexDirection: 'row',
    marginBottom: 6,
    alignItems: 'center',
  },
  requestMethod: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: 'bold',
    marginRight: 8,
    minWidth: 50,
  },
  requestType: {
    color: '#FF9800',
    fontSize: 10,
    backgroundColor: '#3a3a3a',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
  },
  requestTime: {
    color: '#888',
    fontSize: 10,
  },
  requestUrl: {
    color: '#fff',
    fontSize: 12,
    marginBottom: 4,
  },
  requestData: {
    color: '#888',
    fontSize: 10,
    fontStyle: 'italic',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyStateText: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
