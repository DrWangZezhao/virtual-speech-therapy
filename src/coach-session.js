import {coachGreetings, coachLines, chooseCoachStep, coachPrompt, cleanCoachReply} from './coach-guide.js';
import {openCoachMic, speakCoach} from './coach-audio.js';
import {decode} from './recording.js';
import {transcribe} from './whisper-client.js';

let localModel;
let messageId = 0;

function loadLocalModel(onProgress) {
  if (localModel) return localModel;
  const worker = new Worker(new URL('./coach-model.js', import.meta.url), {type:'module'});
  let readyResolve, readyReject;
  const readyPromise = new Promise((resolve,reject) => { readyResolve=resolve; readyReject=reject; });
  const model = {worker, ready:false, readyPromise};
  localModel = model;
  worker.onmessage = ({data}) => {
    if (data.loading) onProgress?.(data.progress);
    if (data.ready) { model.ready = true; readyResolve(); }
    if (data.error) { worker.terminate(); localModel = null; readyReject(new Error(data.error)); }
  };
  worker.onerror = () => { worker.terminate(); localModel = null; readyReject(new Error('Local model could not load')); };
  worker.postMessage({id:++messageId});
  return model;
}

async function coachReply(prompt, {signal, apiKey, model}) {
  if (apiKey) {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method:'POST',
      headers:{'Content-Type':'application/json',Authorization:`Bearer ${apiKey}`},
      signal:AbortSignal.any([signal,AbortSignal.timeout(45000)]),
      body:JSON.stringify({model:'deepseek-flash',thinking:{type:'disabled'},max_tokens:300,
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
    const timer = setTimeout(cancel,180000);
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

export async function runCoachSession({language, signal, apiKey, useLocal, target, advance, demo, caption, phase, speaking, progress, voiceUnavailable = () => {}}) {
  const lines = coachLines[language];
  const listen = await openCoachMic(signal);
  if (useLocal && !apiKey) {
    phase('coachLoading');
    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter?.features.has('shader-f16')) {
      phase('coachUnsupported');
      throw new Error('Compatible WebGPU adapter unavailable');
    }
    if (signal.aborted) throw signal.reason;
  }
  const model = useLocal && !apiKey ? loadLocalModel(progress) : null;
  if (model) {
    phase('coachLoading');
    await new Promise((resolve,reject) => {
      const cancel = () => {
        model.worker.terminate();
        if (localModel===model) localModel=null;
        reject(signal.reason);
      };
      if (signal.aborted) { cancel(); return; }
      const timer = setTimeout(() => {
        model.worker.terminate();
        if (localModel===model) localModel=null;
        reject(new Error('Model loading timed out'));
      },600000);
      signal.addEventListener('abort',cancel,{once:true});
      model.readyPromise.then(resolve,reject).finally(()=>{
        clearTimeout(timer);
        signal.removeEventListener('abort',cancel);
      });
      signal.addEventListener('abort',()=>clearTimeout(timer),{once:true});
    });
  }
  const recent = [];
  const voice = new Audio();
  voice.onplaying=()=>speaking(true);
  voice.onpause=voice.onended=()=>speaking(false);
  async function say(line, reply) {
    if (signal.aborted) return;
    phase('coachSpeaking');
    try {
      if (reply) {
        caption(reply);
        const voiced=await speakCoach(reply,language,signal,speaking);
        if(!voiced && !signal.aborted)voiceUnavailable();
        return;
      }
      if (signal.aborted) return;
      caption(lines[line]);
      voice.src = new URL(`data/coach/${language}-${line}.mp3`, document.baseURI).href;
      const played = await waitForAudio(voice, () => voice.play(), signal);
      if (!played && !signal.aborted) await speakCoach(lines[line],language,signal,speaking);
    } finally { speaking(false); }
  }

  async function example(slower = false) {
    if (signal.aborted) return;
    phase('coachSpeaking');
    caption(target().text);
    await demo(slower ? .72 : 1,signal);
  }

  if (apiKey || model?.ready) {
    const greeting=coachGreetings[language];
    await say('start',greeting);
    recent.push({heard:'Session started',reply:greeting});
  } else {
    await say('start');
    await example();
  }
  while (!signal.aborted) {
    phase('coachListening');
    const recording = await listen();
    phase('coachThinking');
    const samples = await decode(recording);
    const text = await transcribe(samples,language,{signal});
    const current = target().text;
    if (apiKey || model?.ready) {
      if (!text.trim()) continue;
      const prompt = coachPrompt({language,target:current,text:text.slice(0,700),step:'conversation',recent});
      const reply = await coachReply(prompt,{signal,apiKey,model});
      if (!reply && !signal.aborted) throw new Error('The conversation model returned no spoken response');
      recent.push({heard:text.slice(0,700),reply});
      if (recent.length > 12) recent.shift();
      await say('retry',reply);
      continue;
    }
    const step = chooseCoachStep(text,current,language);
    if (step === 'end') break;
    const movesOn = step === 'next' || step === 'match';
    if (movesOn && !advance()) break;
    await say(step);
    await example(['retry','slow','quiet'].includes(step));
  }
  if (!signal.aborted) await say('finish');
}
