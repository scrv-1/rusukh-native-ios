import { PDF_ENGINE_SOURCE } from './engine.generated';

/** All scripts are shipped in the app; PDF contents never become markup. */
export const PDF_ENGINE_HTML = '<!doctype html><html><head><meta charset="utf-8">' +
  '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; connect-src \'none\'; img-src \'none\'; font-src \'none\'; style-src \'none\'; frame-src \'none\'; worker-src \'none\'; form-action \'none\'; base-uri \'none\'">' +
  '</head><body><script>' + PDF_ENGINE_SOURCE.replace(/<\/script/gi, '<\\/script') + '</script></body></html>';

export function extractionScript(id: string, base64: string): string {
  const request = JSON.stringify({ id, base64 }).replace(/</g, '\\u003c');
  return `(function(){const request=${request};const send=(type,payload)=>window.ReactNativeWebView.postMessage(JSON.stringify({id:request.id,type,payload}));window.RusukhPDF.extract(request,p=>send('progress',p)).then(r=>send('result',r)).catch(e=>send('error',{code:e.code||'PARSE_FAILED',message:e.message||'تعذّرت القراءة'}));})();true;`;
}
