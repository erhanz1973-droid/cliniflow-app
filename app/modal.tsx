import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View, Pressable, Text, ActivityIndicator, Platform } from 'react-native';
import { WebView } from 'react-native-webview';

export default function ModalScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const url = params.url as string;
  const title = params.title as string || '';

  if (!url) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Hata</Text>
          <Pressable onPress={() => router.back()} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </Pressable>
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>URL bulunamadı</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle} numberOfLines={1}>{title || 'Yükleniyor...'}</Text>
        <Pressable onPress={() => router.back()} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>✕</Text>
        </Pressable>
      </View>
      <WebView
        source={{ uri: url }}
        style={styles.webview}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        allowsProtectedMedia={true}
        allowsAirPlayForMediaPlayback={true}
        originWhitelist={['*']}
        mixedContentMode="always"
        allowsBackForwardNavigationGestures={false}
        onPermissionRequest={(request) => {
          console.log('[MODAL] Permission requested:', request);
          // Auto-grant camera and microphone permissions
          if (request.resources.includes('camera') || request.resources.includes('microphone')) {
            console.log('[MODAL] Granting camera/microphone permission');
            request.grant(request.resources);
          } else {
            request.deny();
          }
        }}
        injectedJavaScript={`
          (function() {
            const originalLog = console.log;
            const originalError = console.error;
            const originalWarn = console.warn;
            
            function sendToReactNative(level, ...args) {
              try {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'CONSOLE_LOG',
                  level: level,
                  message: args.map(arg => 
                    typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
                  ).join(' ')
                }));
              } catch (e) {
                // Ignore
              }
            }
            
            console.log = function(...args) {
              originalLog.apply(console, args);
              sendToReactNative('log', ...args);
            };
            
            console.error = function(...args) {
              originalError.apply(console, args);
              sendToReactNative('error', ...args);
            };
            
            console.warn = function(...args) {
              originalWarn.apply(console, args);
              sendToReactNative('warn', ...args);
            };
            
            // Check and enable getUserMedia support
            if (!navigator.mediaDevices) {
              console.log('[INJECTED] Creating navigator.mediaDevices');
              navigator.mediaDevices = {};
            }
            
            if (!navigator.mediaDevices.getUserMedia) {
              console.log('[INJECTED] Creating getUserMedia polyfill');
              navigator.mediaDevices.getUserMedia = function(constraints) {
                const getUserMedia = navigator.getUserMedia || 
                                    navigator.webkitGetUserMedia || 
                                    navigator.mozGetUserMedia || 
                                    navigator.msGetUserMedia;
                
                if (!getUserMedia) {
                  return Promise.reject(new Error('getUserMedia is not supported in this browser/WebView'));
                }
                
                return new Promise(function(resolve, reject) {
                  getUserMedia.call(navigator, constraints, resolve, reject);
                });
              };
            }
            
            // Send ready message
            setTimeout(() => {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'PAGE_READY',
                url: window.location.href,
                hasGetUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
              }));
            }, 100);
          })();
          true; // Note: this is required, or you'll sometimes get silent failures
        `}
        renderLoading={() => (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2563EB" />
          </View>
        )}
        onNavigationStateChange={(navState) => {
          console.log('[MODAL] Navigation state changed:', navState.url);
          // If user navigates to chat page or has success message, close modal
          if (navState.url.includes('/chat') || navState.url.includes('?message=')) {
            console.log('[MODAL] Closing modal - chat page detected');
            router.back();
          }
        }}
        onMessage={(event) => {
          // Handle messages from WebView
          try {
            const data = JSON.parse(event.nativeEvent.data);
            
            if (data.type === 'CONSOLE_LOG') {
              // Forward console logs from WebView to React Native console
              const logMethod = data.level === 'error' ? console.error : 
                               data.level === 'warn' ? console.warn : 
                               console.log;
              logMethod(`[WEBVIEW ${data.level.toUpperCase()}]`, data.message);
            } else if (data.type === 'PAGE_READY') {
              console.log('[MODAL] Page ready:', data.url);
            } else if (data.type === 'CLOSE_MODAL' || data.type === 'UPLOAD_COMPLETE') {
              router.back();
            }
          } catch (e) {
            // Not JSON, log as-is
            console.log('[MODAL] Message from WebView:', event.nativeEvent.data);
          }
        }}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('[MODAL] WebView error:', nativeEvent);
        }}
        onHttpError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('[MODAL] WebView HTTP error:', nativeEvent);
        }}
        onLoadEnd={() => {
          console.log('[MODAL] WebView load ended');
        }}
        onLoadStart={() => {
          console.log('[MODAL] WebView load started');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#0b1220',
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
    paddingTop: Platform.OS === 'ios' ? 50 : 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
  },
  closeBtn: {
    padding: 8,
    marginLeft: 12,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 24,
    color: '#fff',
    fontWeight: '700',
  },
  webview: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: '#fff',
    fontSize: 16,
  },
});
