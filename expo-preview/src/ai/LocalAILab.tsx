import React, { useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { Palette } from '../ui';
import { AI_PROTOCOL, AI_ENGINE_VERSION, LocalAIDraft, LocalAIStatus, validateBridgeDraft } from './contracts';
export type { LocalAIDraft, LocalAIStatus } from './contracts';

type Props = { sourceText: string; onResult: (draft: LocalAIDraft) => void; onStatus?: (status: LocalAIStatus) => void; p?: Pick<Palette, 'surface' | 'danger'> };
let html: string | undefined;
function getHTML() {
  // Deliberately deferred until the user opens this laboratory. Metro keeps the
  // module in the bundle but does not construct the 22 MB HTML string at startup.
  if (!html) html = (require('./engine.generated') as { LOCAL_AI_HTML: string }).LOCAL_AI_HTML;
  return html;
}

export function LocalAILab({ sourceText, onResult, onStatus, p }: Props) {
  const web = useRef<WebView<object>>(null);
  const callbacks = useRef({ onResult, onStatus });
  callbacks.current = { onResult, onStatus };
  const source = useRef(sourceText);
  source.current = sourceText;
  const revision = useRef(0);
  const ready = useRef(false);
  const alive = useRef(true);
  const terminalFailed = useRef(false);
  const [error, setError] = useState<string | null>(null);
  function sendSource() {
    if (!ready.current || terminalFailed.current) return;
    const message = { protocol: AI_PROTOCOL, type: 'source', requestId: String(revision.current), sourceText: source.current };
    web.current?.injectJavaScript(`window.RusukhAI?.receive(${JSON.stringify(message)});true;`);
  }
  function fail(message: string) {
    if (!alive.current || terminalFailed.current) return;
    terminalFailed.current = true;
    ready.current = false;
    revision.current++;
    setError(message);
    callbacks.current.onStatus?.({ phase: 'error', message, engine: AI_ENGINE_VERSION });
  }
  useEffect(() => {
    revision.current++;
    sendSource();
  }, [sourceText]);
  useEffect(() => {
    alive.current = true;
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active' && !terminalFailed.current) {
        // Invalidate queued bridge messages before asking the WebView to stop.
        revision.current++;
        web.current?.injectJavaScript(`window.RusukhAI?.receive(${JSON.stringify({ protocol: AI_PROTOCOL, type: 'unload' })});true;`);
        sendSource();
        callbacks.current.onStatus?.({ phase: 'cancelled', message: 'توقفت الجلسة عند مغادرة التطبيق. أعد اختيار النموذج للبدء.', engine: AI_ENGINE_VERSION });
      }
    });
    return () => { alive.current = false; ready.current = false; subscription.remove(); };
  }, []);

  if (error) return <View style={{ padding: 16, backgroundColor: p?.surface ?? '#111' }}><Text accessibilityRole="alert" style={{ color: p?.danger ?? '#FF8989', fontSize: 17, textAlign: 'right' }}>{error} أغلق المختبر وافتحه للمحاولة مجددًا.</Text></View>;
  return <WebView<object> ref={web} source={{ html: getHTML() }} style={{ flex: 1, minHeight: 620, backgroundColor: '#111' }}
    originWhitelist={['*']} javaScriptEnabled javaScriptCanOpenWindowsAutomatically={false}
    onShouldStartLoadWithRequest={event => event.url === 'about:blank'} onOpenWindow={() => {}}
    allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false}
    sharedCookiesEnabled={false} thirdPartyCookiesEnabled={false} domStorageEnabled={false}
    cacheEnabled={false} incognito mixedContentMode="never"
    onContentProcessDidTerminate={() => fail('أوقف النظام المحرك المحلي، وقد يكون السبب نقص الذاكرة.')}
    onError={() => fail('تعذّر تشغيل المحرك داخل WebView.')}
    onMessage={event => {
      if (!alive.current || terminalFailed.current || event.nativeEvent.data.length > 30000) return;
      try {
        const message = JSON.parse(event.nativeEvent.data);
        if (message.protocol !== AI_PROTOCOL) return;
        if (message.type === 'ready') { ready.current = true; sendSource(); return; }
        if (message.requestId !== String(revision.current)) return;
        if (message.type === 'result') callbacks.current.onResult(validateBridgeDraft(message.payload, source.current));
        if (message.type === 'status') {
          const status = message.payload;
          if (status?.engine === AI_ENGINE_VERSION && ['idle', 'loading', 'ready', 'generating', 'draft', 'cancelled', 'error'].includes(status.phase) && typeof status.message === 'string') callbacks.current.onStatus?.({ phase: status.phase, message: status.message.slice(0, 700), modelName: typeof status.modelName === 'string' ? status.modelName.slice(0, 160) : undefined, engine: AI_ENGINE_VERSION, elapsedMs: typeof status.elapsedMs === 'number' && Number.isFinite(status.elapsedMs) ? status.elapsedMs : undefined });
        }
      } catch { fail('تعذّر التحقق من نتيجة المحرك المحلي. لم تُحفظ النتيجة.'); }
    }} />;
}

export default LocalAILab;
