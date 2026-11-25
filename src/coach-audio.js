export async function openCoachMic(signal) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}, video:false,
  });
  const release = () => stream.getTracks().forEach(track => track.stop());
  for (const track of stream.getAudioTracks()) track.enabled = false;
  if (signal.aborted) { release(); throw signal.reason; }
  let context;
  try {
    context = new AudioContext();
    await context.resume();
  } catch (error) {
    release();
    if (context) void context.close();
    throw error;
  }
  const analyser = context.createAnalyser();
  const input = context.createMediaStreamSource(stream);
  input.connect(analyser);
  analyser.fftSize = 1024;
  const samples = new Float32Array(analyser.fftSize);
  const close = () => {
    release();
    input.disconnect();
    if (context.state !== 'closed') void context.close();
  };
  if (signal.aborted) { close(); throw signal.reason; }
  signal.addEventListener('abort', close, {once:true});

  function captureTurn() {
    return new Promise((resolve,reject) => {
      if (signal.aborted) { reject(signal.reason); return; }
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      const start = performance.now();
      let level = .006, voiceSince = 0, lastVoice = 0, voiced = false;
      const cancel = () => finish(signal.reason);
      const timer = setInterval(detect, 35);
      function finish(error) {
        clearInterval(timer);
        signal.removeEventListener('abort', cancel);
        if (recorder.state !== 'inactive') recorder.stop();
        if (error) reject(error);
      }
      function detect() {
        const now = performance.now();
        analyser.getFloatTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum,x)=>sum+x*x,0) / samples.length);
        if (rms > Math.max(.012, level * 2.6)) {
          voiceSince ||= now;
          if (now - voiceSince >= 95) voiced = true;
          if (voiced) lastVoice = now;
        } else {
          voiceSince = 0;
          if (!voiced) level = Math.min(.014,level * .96 + rms * .04);
        }
        if ((voiced && now-lastVoice>1800) || now-start>25000) finish();
      }
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => resolve(voiced ? new Blob(chunks,{type:recorder.mimeType}) : null);
      recorder.onerror = () => finish(new Error('Microphone recording failed'));
      signal.addEventListener('abort', cancel, {once:true});
      try { recorder.start(); }
      catch (error) { finish(error); }
    });
  }

  return async () => {
    for (const track of stream.getAudioTracks()) track.enabled = true;
    try {
      let clip;
      do { clip = await captureTurn(); } while (!clip);
      return clip;
    } finally {
      for (const track of stream.getAudioTracks()) track.enabled = false;
    }
  };
}

export async function speakCoach(text, language, signal, onSpeaking = () => {}) {
  const synthesis = window.speechSynthesis;
  if (!synthesis || signal.aborted) return Promise.resolve(false);
  if (!synthesis.getVoices().length) {
    await new Promise(resolve => {
      const done = () => {
        clearTimeout(timer);
        synthesis.removeEventListener('voiceschanged', done);
        signal.removeEventListener('abort', done);
        resolve();
      };
      const timer = setTimeout(done, 1500);
      synthesis.addEventListener('voiceschanged', done, {once:true});
      signal.addEventListener('abort', done, {once:true});
    });
  }
  if (signal.aborted) return false;
  const locale = language === 'en' ? 'en-US' : language;
  return new Promise(resolve => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = locale;
    utterance.rate = .91;
    const voices = synthesis.getVoices().filter(voice => voice.localService && voice.lang.toLowerCase().startsWith(locale.slice(0,2).toLowerCase()));
    voices.sort((a,b) => Number(/natural|premium|enhanced/i.test(b.name)) - Number(/natural|premium|enhanced/i.test(a.name))
      || Number(b.lang===locale) - Number(a.lang===locale));
    if (voices[0]) utterance.voice = voices[0];
    // Keep transcripts on device if there is no suitable local voice.
    if (!utterance.voice) { resolve(false); return; }
    const complete = success => {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      onSpeaking(false);
      resolve(success);
    };
    const cancel = () => { synthesis.cancel(); complete(false); };
    const timer = setTimeout(cancel, 45000);
    utterance.onstart = () => onSpeaking(true);
    utterance.onpause = () => onSpeaking(false);
    utterance.onresume = () => onSpeaking(true);
    utterance.onend = () => complete(true);
    utterance.onerror = () => complete(false);
    signal.addEventListener('abort', cancel, {once:true});
    synthesis.speak(utterance);
  });
}
