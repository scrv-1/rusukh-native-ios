import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { extractionScript, PDF_ENGINE_HTML } from './html';
import { makePdfResult, MAX_PDF_BYTES, PDF_TIMEOUT_MS, PdfError, PdfProgress, PdfRequest, PdfResult } from './contracts';

const source = { html: PDF_ENGINE_HTML };
type Props = {
  request: PdfRequest; onExtract: (result: PdfResult) => void;
  onError: (error: PdfError) => void; onProgress?: (progress: PdfProgress) => void;
};
export function PdfTextExtractor(props: Props) { return <PdfExtractionJob key={props.request.id} {...props} />; }

function PdfExtractionJob({ request, onExtract, onError, onProgress }: Props) {
  // v14's public generic defaults to undefined; choose object so strict TS does
  // not reduce its WebViewProps & P intersection to never.
  const web = useRef<WebView<object>>(null);
  const [running, setRunning] = useState(true);
  const active = useRef(true);
  const started = useRef(false);
  const callbacks = useRef({ onExtract, onError, onProgress });
  callbacks.current = { onExtract, onError, onProgress };
  const deadline = useRef<ReturnType<typeof setTimeout> | null>(null);
  function fail(error: PdfError) {
    if (!active.current) return;
    active.current = false;
    setRunning(false);
    if (deadline.current) clearTimeout(deadline.current);
    web.current?.stopLoading();
    callbacks.current.onError(error);
  }
  useEffect(() => {
    active.current = true;
    if (request.base64.length > Math.ceil(MAX_PDF_BYTES / 3) * 4) {
      fail({ code: 'FILE_LIMIT', message: 'الحد الأقصى لملف PDF هو 10 ميغابايت.' });
      return;
    }
    deadline.current = setTimeout(() => fail({ code: 'TIMEOUT', message: 'استغرقت قراءة PDF وقتًا طويلًا. جرّب ملفًا أصغر.' }), PDF_TIMEOUT_MS);
    return () => { active.current = false; if (deadline.current) clearTimeout(deadline.current); };
  }, [request.id]);

  if (!running) return null;
  return <View style={{ width: 1, height: 1, opacity: 0, position: 'absolute' }} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <WebView<object> ref={web} key={request.id} source={source} originWhitelist={['*']} javaScriptEnabled
      onShouldStartLoadWithRequest={event => event.url === 'about:blank'}
      onOpenWindow={() => {}} javaScriptCanOpenWindowsAutomatically={false}
      allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false}
      sharedCookiesEnabled={false} thirdPartyCookiesEnabled={false} domStorageEnabled={false}
      cacheEnabled={false} incognito mixedContentMode="never" scrollEnabled={false}
      onContentProcessDidTerminate={() => fail({ code: 'PROCESS_STOPPED', message: 'أوقف النظام قارئ PDF. جرّب ملفًا أصغر.' })}
      onError={() => fail({ code: 'ENGINE_LOAD', message: 'تعذّر تشغيل قارئ PDF المحلي.' })}
      onMessage={event => {
        if (!active.current || event.nativeEvent.data.length > 7000000) return;
        try {
          const message = JSON.parse(event.nativeEvent.data);
          if (message.type === 'ready' && !started.current) {
            started.current = true;
            web.current?.injectJavaScript(extractionScript(request.id, request.base64));
          } else if (message.id === request.id && message.type === 'progress') {
            const progress = message.payload;
            if (Number.isInteger(progress?.completed) && Number.isInteger(progress?.total) && progress.completed >= 0 && progress.completed <= progress.total && progress.total <= 50) callbacks.current.onProgress?.(progress);
          } else if (message.id === request.id && message.type === 'result') {
            const result = makePdfResult(request.filename, message.payload);
            active.current = false;
            setRunning(false);
            if (deadline.current) clearTimeout(deadline.current);
            callbacks.current.onExtract(result);
          } else if (message.id === request.id && message.type === 'error') {
            fail({ code: String(message.payload?.code || 'PARSE_FAILED').slice(0, 60), message: String(message.payload?.message || 'تعذّرت قراءة PDF.').slice(0, 500) });
          }
        } catch { fail({ code: 'INVALID_RESULT', message: 'تعذّر التحقق من نتيجة قراءة PDF.' }); }
      }} />
  </View>;
}
