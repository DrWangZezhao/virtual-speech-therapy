import {coachLines, chooseCoachStep, coachPrompt, cleanCoachReply} from './coach-guide.js';
import {openCoachMic, speakCoach} from './coach-audio.js';
import {decode} from './recording.js';
import {transcribe} from './whisper-client.js';

let localModel;
let messageId = 0;

function loadLocalModel() {
  if (localModel) return localModel;
  const worker = new Worker(new URL('./coach-model.js', import.meta.url), {type:'module'});
  const model = {worker, ready:false};
  localModel = model;
  worker.onmessage = ({data}) => {
    if (data.ready) model.ready = true;
    if (data.error) { worker.terminate(); localModel = null; }
  };
  worker.onerror = () => { worker.terminate(); localModel = null; };
  worker.postMessage({id:++messageId});
  return model;
}

async function coachReply(prompt, {signal, apiKey, model}) {
  if (apiKey) {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method:'POST',
      headers:{'Content-Type':'application/json',Authorization:`Bearer ${apiKey}`},
      signal:AbortSignal.any([signal,AbortSignal.timeout(8500)]),
      body:JSON.stringify({model:'deepseek-flash',thinking:{type:'disabled'},max_tokens:100,
        messages:[{role:'user',content:prompt}]}),
    });
    if (!response.ok) throw new Error('DeepSeek request failed');
    return cleanCoachReply((await response.json()).choices?.[0]?.message?.content);
  }
  if (!model?.ready) return '';
  return new Promise(resolve => {
    const id = ++messageId;
    const worker = model.worker;
    function done(reply, reset = false) {
      clearTimeout(timer);
      worker.removeEventListener('message', receive);
      signal.removeEventListener('abort', cancel);
      if (reset && localModel === model) {
        worker.terminate();
        localModel = null;
      }
      resolve(reply);
    }
    const cancel = () => done('', true);
    function receive({data}) {
      if (data.id === id) done(data.text ?? '');
    }
    const timer = setTimeout(cancel,9500);
    worker.addEventListener('message', receive);
    signal.addEventListener('abort', cancel, {once:true});
    worker.postMessage({id,prompt});
  });
}

export function waitForAudio(audio, start, signal) {
  return new Promise(resolve => {
    if (signal.aborted) { resolve(false); return; }
    const finish = success => {
      audio.removeEventListener('ended', ended);
      audio.removeEventListener('error', failed);
      signal.removeEventListener('abort', abort);
      resolve(success);
    };
    const ended = () => finish(true);
    const failed = () => finish(false);
    const abort = () => { audio.pause(); finish(false); };
    audio.addEventListener('ended', ended, {once:true});
    audio.addEventListener('error', failed, {once:true});
    signal.addEventListener('abort', abort, {once:true});
    Promise.resolve().then(start).then(started => { if (started === false) failed(); }, failed);
  });
}

export async function runCoachSession({language, signal, apiKey, useLocal, target, advance, demo, caption, phase, speaking}) {
  const lines = coachLines[language];
  const listen = await openCoachMic(signal);
  const model = useLocal && !apiKey && navigator.gpu ? loadLocalModel() : null;
  const recent = [];
  const voice = new Audio();
  async function say(line, reply) {
    if (signal.aborted) return;
    phase('coachSpeaking');
    speaking(true);
    try {
      if (reply) {
        caption(reply);
        if (await speakCoach(reply,language,signal)) return;
      }
      if (signal.aborted) return;
      caption(lines[line]);
      voice.src = new URL(`data/coach/${language}-${line}.mp3`, document.baseURI).href;
      const played = await waitForAudio(voice, () => voice.play(), signal);
      if (!played && !signal.aborted) await speakCoach(lines[line],language,signal);
    } finally { speaking(false); }
  }

  async function example(slower = false) {
    if (signal.aborted) return;
    phase('coachSpeaking');
    caption(target().text);
    await demo(slower ? .72 : 1,signal);
  }

  await say('start');
  await example();
  while (!signal.aborted) {
    phase('coachListening');
    const recording = await listen();
    phase('coachThinking');
    const samples = await decode(recording);
    const text = await transcribe(samples,language,{signal});
    const current = target().text;
    const step = chooseCoachStep(text,current,language);
    if (step === 'end') break;
    const movesOn = step === 'next' || step === 'match';
    if (movesOn && !advance()) break;
    let reply = '';
    if ((step === 'retry' || step === 'match') && (apiKey || model?.ready)) {
      const prompt = coachPrompt({language,target:current,text:text.slice(0,300),step,recent});
      try { reply = await coachReply(prompt,{signal,apiKey,model}); }
      catch { /* The prepared voice remains available when the model is unreachable. */ }
    }
    recent.push({heard:text.slice(0,160),reply:reply || lines[step]});
    if (recent.length > 2) recent.shift();
    await say(step,reply);
    await example(['retry','slow','quiet'].includes(step));
  }
  if (!signal.aborted) await say('finish');
}
