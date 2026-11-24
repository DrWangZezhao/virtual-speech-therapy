const SAMPLE_RATE = 16000;

export async function capture(onStop) {
  const stream = await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true},video:false});
  let recorder;
  try { recorder = new MediaRecorder(stream); }
  catch (error) { stream.getTracks().forEach(track=>track.stop());throw error; }
  const chunks = [];
  recorder.ondataavailable = ({data})=>{ if(data.size) chunks.push(data); };
  const stop = () => { if(recorder.state !== 'inactive') recorder.stop(); };
  const release = () => { clearTimeout(timeout); stream.getTracks().forEach(track=>track.stop()); };
  const timeout = setTimeout(stop,12000);
  recorder.onstop = () => { release(); onStop(new Blob(chunks,{type:recorder.mimeType})); };
  recorder.onerror = () => { release(); onStop(new Blob()); };
  try { recorder.start(); }
  catch (error) { release();throw error; }
  return stop;
}

export async function decode(blob) {
  const context = new AudioContext();
  try {
    const media = await context.decodeAudioData(await blob.arrayBuffer());
    const output = new OfflineAudioContext(1,Math.ceil(media.duration * SAMPLE_RATE),SAMPLE_RATE);
    const source = output.createBufferSource();source.buffer=media;source.connect(output.destination);source.start();
    return (await output.startRendering()).getChannelData(0);
  } finally { await context.close(); }
}

export function wav(samples) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const tag = (position,text)=>[...text].forEach((c,i)=>view.setUint8(position+i,c.charCodeAt(0)));
  tag(0,'RIFF'); view.setUint32(4,buffer.byteLength-8,true);tag(8,'WAVE');tag(12,'fmt ');
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
  view.setUint32(24,SAMPLE_RATE,true);view.setUint32(28,SAMPLE_RATE*2,true);
  view.setUint16(32,2,true);view.setUint16(34,16,true);tag(36,'data');view.setUint32(40,samples.length*2,true);
  for(let i=0;i<samples.length;i++) view.setInt16(44+i*2,Math.max(-1,Math.min(1,samples[i]))*32767,true);
  return buffer;
}

export function pitchPreview(samples) {
  const rate = SAMPLE_RATE/2;
  const stride = Math.floor(rate * 0.025);
  const width = Math.floor(rate * 0.052);
  const minimum = Math.floor(rate / 550);
  const maximum = Math.floor(rate / 65);
  const frame = new Float32Array(width);
  const correlation = new Float32Array(maximum + 2);
  const results = [];
  for(let start=0;start+width*2<samples.length;start+=stride*2){
    let mean=0, energy=0;
    for(let j=0;j<width;j++){frame[j]=(samples[start+j*2]+samples[start+j*2+1])/2;mean+=frame[j]/width;}
    for(let j=0;j<width;j++){frame[j]-=mean;energy+=frame[j]*frame[j];}
    let hz=null;
    if(energy/width>0.000025){
      let peak=0;
      for(let lag=minimum-1;lag<=maximum+1;lag++){
        let cross=0, total=0;
        for(let j=0;j<width-lag;j++){const a=frame[j],b=frame[j+lag];cross+=a*b;total+=a*a+b*b;}
        correlation[lag]=2*cross/(total||1);peak=Math.max(peak,correlation[lag]);
      }
      const threshold=Math.max(0.66,peak*0.88);
      for(let lag=minimum;lag<=maximum;lag++){
        if(correlation[lag]<threshold || correlation[lag]<correlation[lag-1] || correlation[lag]<correlation[lag+1])continue;
        hz=rate/lag;break;
      }
    }
    results.push({seconds:(start+width)/SAMPLE_RATE,hz});
  }
  return results;
}

export function audiblePitchDirection(points, calibration) {
  const usable = points.filter(point => Number.isFinite(point.hz) && point.hz > 0);
  if (usable.length < 8 || usable.length / points.length < .35) return null;
  const duration = usable.at(-1).seconds - usable[0].seconds;
  if (duration < .14) return null;
  const logarithms = usable.map(point => 12 * Math.log2(point.hz));
  if (logarithms.some((value, i) => i > 0 && Math.abs(value - logarithms[i - 1]) > 7)) return null;
  const percentiles = calibration.filter(hz => Number.isFinite(hz) && hz > 0).sort((a,b)=>a-b);
  const range = percentiles.length >= 8 ? 12*Math.log2(percentiles[Math.floor(.9*percentiles.length)] / percentiles[Math.floor(.1*percentiles.length)]) : 0;
  const threshold = Math.max(.9, .17*range);
  const window = Math.max(2, Math.floor(logarithms.length/4));
  const median = values => [...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
  const change = median(logarithms.slice(-window)) - median(logarithms.slice(0,window));
  if (change > threshold) return 'pitchRise';
  if (change < -threshold) return 'pitchFall';
  return null;
}
