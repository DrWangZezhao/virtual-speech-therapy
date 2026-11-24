const languages = {en:'english','fi-FI':'finnish','es-ES':'spanish','zh-CN':'chinese'};
let worker, pending, sequence = 0;

export function transcribe(samples, language, {onReady, signal} = {}) {
  if (signal?.aborted) return Promise.reject(signal.reason);
  if (pending) return Promise.reject(new Error('Whisper is busy'));
  worker ??= new Worker(new URL('./whisper-worker.js',import.meta.url), {type:'module'});
  return new Promise((resolve,reject) => {
    const id = ++sequence;
    function cleanup() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      pending = null;
      worker.onmessage = null;
      worker.onerror = null;
    }
    function fail(error) {
      cleanup();
      worker.terminate();
      worker = null;
      reject(error);
    }
    const cancel = () => fail(signal.reason);
    const timer = setTimeout(() => fail(new Error('Whisper timed out')),120000);
    pending = id;
    signal?.addEventListener('abort', cancel, {once:true});
    worker.onmessage = ({data}) => {
      if (data.id !== id) return;
      if (data.ready) { onReady?.(); return; }
      if (data.error) { fail(new Error(data.error)); return; }
      cleanup();
      resolve(data.text);
    };
    worker.onerror = error => fail(new Error(error.message));
    try {
      worker.postMessage({id,samples,language:languages[language]},[samples.buffer]);
    } catch (error) { fail(error); }
  });
}
