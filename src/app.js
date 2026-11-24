import './style.css';
import {Converter} from 'opencc-js';
import {copy} from './copy.js';
import {audiblePitchDirection,capture,decode,pitchPreview,wav} from './recording.js';

const $ = id => document.getElementById(id);
const translate = Converter({from:'tw',to:'cn'});
const hostedApi = (import.meta.env.VITE_API_URL || '').replace(/\/$/,'');
const apiDefault = import.meta.env.DEV ? '/api' : '';
const voices = {'en':'english','fi-FI':'finnish','es-ES':'spanish','zh-CN':'chinese'};
const contours = {1:[.78,.81,.83,.81,.79],2:[.29,.32,.48,.67,.88],3:[.48,.28,.17,.25,.59],4:[.91,.73,.51,.32,.18],5:[.52,.49,.41]};
const readStorage = (key, fallback) => {
  try {return JSON.parse(localStorage.getItem(key)) ?? fallback;}
  catch {return fallback;}
};
const saveStorage = (key,value) => {try {localStorage.setItem(key,JSON.stringify(value));}catch{}};
const state = {lang:readStorage('vst-language','en'),locale:readStorage('vst-interface','en'),level:1,tones:false,
  counts:readStorage('vst-counts',{}),position:0,status:'ready',recording:false,busy:false,result:null,observed:[],
  sessionPitch:[],api:readStorage('vst-api',apiDefault),request:0,drillReturn:null};
if(!voices[state.lang])state.lang='en';
if(!copy[state.locale])state.locale='en';
const t = () => copy[state.locale];
const demoAudio = new Audio();
demoAudio.preload='auto';
let courses=[], media={}, avatar, cameraStop, micStop, worker, recordingURL;
let cameraState;

async function fetchJSON(path){
  const response=await fetch(new URL(path,document.baseURI));
  if(!response.ok)throw new Error(String(response.status));
  return response.json();
}
function choices(){return courses.filter(item=>item.language===state.lang && (state.tones ? item.mode==='tone':item.level===state.level && item.mode!=='tone'));}
function active(){return choices()[state.position];}
function syllables(item){return item?.groups.flatMap(group=>group.syllables) ?? [];}
function status(key){state.status=key; $('status').textContent=t()[key]??'';}
function plain(text){return text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu,'');}
function normalized(text){return plain(state.lang==='zh-CN'?translate(text):text);}
function distance(reference, observed){
  let previous=Array.from({length:observed.length+1},(_,i)=>i);
  for(let i=0;i<reference.length;i++){
    const row=[i+1];
    for(let j=0;j<observed.length;j++) row.push(Math.min(row[j]+1,previous[j+1]+1,previous[j]+(reference[i]!==observed[j])));
    previous=row;
  }
  return previous.at(-1);
}
function labelFor(item){return item.focus ? `${item.focus.value} · ${item.text}` : item.text;}
function setButtonState(){
  const lock=state.recording || state.busy;
  for(const id of ['language','item','tone-mode','play','slow'])$(id).disabled=lock;
  for(const button of $('levels').children)button.disabled=lock;
  $('next').disabled=lock || !active();
  $('record').disabled=state.busy || !active();
  $('record').textContent=t()[state.recording?'stop':state.counts[active()?.id]?'retry':'record'];
}
function showCopy(){
  document.documentElement.lang=state.locale;
  document.title=t().brand;
  for(const element of document.querySelectorAll('[data-copy]')) element.textContent=t()[element.dataset.copy];
  $('avatar').setAttribute('aria-label',t().avatar);
  $('pitch').setAttribute('aria-label',t().pitch);
  const labels=state.locale==='en'?'Practice levels':'练习级别';
  $('levels').setAttribute('aria-label',labels);
  if(cameraState)$('camera-status').textContent=t()[cameraState];
  $('camera-toggle').textContent=cameraStop?t().cameraOff:t().cameraOn;
}
function showExercise(){
  showCopy();
  $('language').value=state.lang;
  $('interface').value=state.locale;
  const item=active();
  $('levels').replaceChildren(...t().levels.map((label,index)=>{
    const button=document.createElement('button');button.type='button';button.textContent=label;
    button.setAttribute('aria-pressed',String(!state.tones && state.level===index+1));
    button.onclick=()=>select({level:index+1,tones:false,drillReturn:null});return button;
  }));
  $('tone-mode').hidden=state.lang!=='zh-CN';
  $('tone-mode').textContent=t()[state.tones?'backLevels':'tones'];
  $('item').replaceChildren(...choices().map((entry,index)=>new Option(labelFor(entry),String(index),false,index===state.position)));
  if(!item){setButtonState();return;}
  const sounds=syllables(item), focus=item.focus;
  $('item-title').textContent=focus?.value??item.text;
  $('item-title').classList.toggle('long',item.text.length>11);
  $('pronunciation').textContent=sounds.length?sounds.map(s=>s.pinyin).join(' '):`/${item.phonetics.replaceAll(':','')}/`;
  const toneNames=sounds.length===1 && !focus ? t().toneNames[sounds[0].lexical_tone] : '';
  const carrier=focus?.type==='initial' ? `${t().initial} · ${t().carrier} ${item.text}`:
    focus?.type==='final'?`${t().final} /${focus.ipa}/ · ${t().carrier} ${item.text}`:'';
  $('subtarget').textContent=carrier||toneNames;
  $('subtarget').hidden=!(carrier||toneNames);
  const goals=sounds.flatMap(sound=>sound.gestures);
  const gesture=Object.keys(t().gesture).find(key=>goals.some(goal=>goal.startsWith(key)||goal.includes(key)));
  $('gesture').textContent=gesture?t().gesture[gesture]:t().illustration;
  $('pitch-card').hidden=state.lang!=='zh-CN' || Boolean(focus);
  $('progress').textContent=t().mark(Object.values(state.counts).filter(Boolean).length);
  $('next').textContent=t()[state.drillReturn?'backSentence':'next'];
  status(state.status);
  showResult();setButtonState();paintPitch();
}
function select(values){
  demoAudio.pause();avatar?.clear();state.request++;
  Object.assign(state,{position:0,status:'ready',result:null,observed:[],...values});
  if(recordingURL){URL.revokeObjectURL(recordingURL);recordingURL=null;}
  $('recording').hidden=true;$('recording').removeAttribute('src');
  saveStorage('vst-language',state.lang);
  showExercise();
}
function addDetail(list,label,value){
  if(value===undefined || value===null || value==='')return;
  const title=document.createElement('dt');title.textContent=label;
  const content=document.createElement('dd');content.textContent=String(value);
  list.append(title,content);
}
function showResult(){
  const item=active();if(!item)return;
  const list=$('advanced');list.replaceChildren();
  const result=state.result;
  const sounds=syllables(item);
  addDetail(list,t().targetText,item.text);
  addDetail(list,t().ipalabel,sounds.map(sound=>sound.ipa).join(' '));
  addDetail(list,t().surface,sounds.map(sound=>sound.surface_pinyin_numbered).join(' '));
  const asset=media[item.id];
  if(asset?.credit){
    addDetail(list,t().listen,`${t().audioHuman} · ${asset.credit.author} · ${asset.credit.license}`);
    const link=document.createElement('a');link.href=asset.credit.source;link.rel='noopener noreferrer';link.target='_blank';link.textContent=t().source;
    const license=document.createElement('a');license.href=asset.credit.license_url;license.rel='noopener noreferrer';license.target='_blank';license.textContent=asset.credit.license;
    list.lastElementChild.append(' ',link,' · ',license);
  }else addDetail(list,t().listen,t().audioSynth);
  $('recognition').hidden=!result;
  $('drill').hidden=true;
  if(!result)return;
  const hasText=typeof result.text==='string';
  const reference=normalized(item.text), observed=hasText?normalized(result.text):'';
  const diffs=distance([...reference],[...observed]);
  const textMatches=Boolean(hasText && reference && reference===observed);
  $('recognition').textContent=result.match==='matched'?t().match:
    hasText?(result.text?`${textMatches?t().matching:t().transcript} · ${result.text}`:t().noText):'';
  if(item.mode==='tone'){
    const direction=audiblePitchDirection(state.observed,state.sessionPitch);
    if(direction){
      const observation=state.locale==='zh-CN'?(direction==='pitchRise'?'录音中可测到的音高总体上升。':'录音中可测到的音高总体下降。'):
        (direction==='pitchRise'?'Pitch rose across the voiced part of your recording.':'Pitch fell across the voiced part of your recording.');
      const line=document.createElement('div');line.textContent=observation;$('recognition').append(line);
    }
  }
  addDetail(list,t().score,hasText&&reference?`${Math.round(100*diffs/[...reference].length)}%`:null);
  addDetail(list,t().segment,result.segments?.length?`${t().uncertain} · ${result.segments.join(' ')}`:t().unavailable);
  if(state.lang==='zh-CN')addDetail(list,t().tone,result.tone==='matched'?t().matching:t().uncertain);
  if(state.observed.length)addDetail(list,t().pitch,result.source==='praat'?t().serverPitch:t().localPitch);
  addDetail(list,t().words,result.alignment?.words?.map(([a,b,word])=>`${word} ${a.toFixed(2)}–${b.toFixed(2)} s`).join(' · '));
  addDetail(list,t().phones,result.alignment?.phones?.map(([a,b,ph])=>`${ph} ${a.toFixed(2)}–${b.toFixed(2)} s`).join(' · '));
  const targetWord=hasText&&diffs===1&&item.level===4&&reference.length===observed.length?
    item.word_spans.find(word=>[...reference].some((c,i)=>c!==observed[i]&&i>=word.start&&i<word.end)):null;
  if(targetWord){
    const candidates=courses.filter(word=>word.language===state.lang&&word.level===3&&word.mode!=='tone');
    const position=candidates.findIndex(word=>word.text===targetWord.text);
    if(position>=0){
      $('drill').hidden=false;$('drill').textContent=`${t().word} · ${targetWord.text}`;
      $('drill').onclick=()=>select({level:3,position,drillReturn:{lang:state.lang,level:4,position:state.position}});
    }
  }
}
async function play(speed){
  const item=active(), asset=media[item?.id];if(!asset || !item)return;
  demoAudio.pause();
  const audioURL=new URL(asset.audio,document.baseURI).href;
  if(demoAudio.src!==audioURL)demoAudio.src=audioURL;
  demoAudio.currentTime=0;demoAudio.playbackRate=speed;
  const playing=demoAudio.play();
  try{
    await playing;
    const track=await fetchJSON(asset.animation);
    if(item===active())avatar?.demonstrate(track,demoAudio,Boolean(item.focus || syllables(item).length===1));
  }catch{status('audioFailed');}
}
function showRecording(blob){
  if(recordingURL)URL.revokeObjectURL(recordingURL);
  recordingURL=URL.createObjectURL(blob);$('recording').src=recordingURL;$('recording').hidden=false;
}
async function analyzeRecording(blob,item,id){
  if(id!==state.request)return;
  state.recording=false;state.busy=true;setButtonState();status('preparing');
  try{
    if(!blob.size){status('unclear');return;}
    showRecording(blob);
    const samples=await decode(blob);
    const rms=Math.sqrt(samples.reduce((sum,sample)=>sum+sample*sample,0)/samples.length);
    if(samples.length<3200 || rms<.002){status('unclear');return;}
    state.counts[item.id]=(state.counts[item.id]||0)+1;saveStorage('vst-counts',state.counts);
    state.observed=pitchPreview(samples);
    state.sessionPitch.push(...state.observed.filter(point=>point.hz).map(point=>point.hz));
    state.sessionPitch=state.sessionPitch.slice(-2000);
    paintPitch();
    const endpoint=state.api || ($('hosted-analysis').checked ? hostedApi : '');
    if(endpoint){
      status('analyzing');
      try{
        const response=await fetch(`${endpoint}/analyze?exercise=${encodeURIComponent(item.id)}`,{
          method:'POST',headers:{'Content-Type':'audio/wav'},body:wav(samples),signal:AbortSignal.timeout(95000)});
        if(!response.ok)throw new Error(String(response.status));
        state.result=await response.json();
        if(state.result.pitch?.length)state.observed=state.result.pitch;
        status('saved');return;
      }catch{status('serverFailed');}
    }
    status('loadingModel');
    try{
      worker ??= new Worker(new URL('./whisper-worker.js',import.meta.url),{type:'module'});
      const text=await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('timeout')),120000);
        worker.onmessage=({data})=>{
          if(data.id!==id)return;
          if(data.ready){status('analyzing');return;}
          clearTimeout(timer);
          if(data.error){console.warn('Whisper',data.error);reject(new Error(data.error));}
          else resolve(data.text);
        };
        worker.onerror=error=>{clearTimeout(timer);reject(error);};
        worker.postMessage({id,samples,language:voices[item.language]},[samples.buffer]);
      });
      state.result={text,source:'browser'};status('saved');
    }catch{worker?.terminate();worker=null;state.result={source:'browser'};status('localFailed');}
  }catch{status('unclear');}
  finally{state.busy=false;showExercise();}
}
async function toggleCapture(){
  if(state.recording){micStop?.();return;}
  if(!active()||state.busy)return;
  demoAudio.pause();avatar?.clear();
  state.busy=true;state.result=null;state.observed=[];const item=active(),id=++state.request;
  setButtonState();
  try{
    micStop=await capture(blob=>analyzeRecording(blob,item,id));
    state.recording=true;status('recording');
  }catch{status('micError');}
  finally{state.busy=false;setButtonState();}
}
function paintPitch(){
  if($('pitch-card').hidden)return;
  const canvas=$('pitch'), width=canvas.clientWidth,height=canvas.clientHeight;
  if(!width||!height)return;
  const ratio=Math.min(2,devicePixelRatio||1);
  canvas.width=width*ratio;canvas.height=height*ratio;
  const ctx=canvas.getContext('2d');ctx.scale(ratio,ratio);
  ctx.strokeStyle='#e0e9e3';ctx.lineWidth=1;
  for(let i=1;i<4;i++){
    ctx.beginPath();ctx.moveTo(4,height*i/4);ctx.lineTo(width-4,height*i/4);ctx.stroke();
  }
  const trace=(points,color)=>{
    let writing=false;ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=2.5;
    for(const [at,value] of points){
      if(value===null){writing=false;continue;}
      const x=6+at*(width-12),y=height-8-Math.max(0,Math.min(1,value))*(height-16);
      if(writing)ctx.lineTo(x,y);else{ctx.moveTo(x,y);writing=true;}
    }
    ctx.stroke();
  };
  const sounds=syllables(active());
  const guide=sounds.flatMap(sound=>sound.contour==='low_third'?[.42,.29,.23,.20]:contours[sound.surface_tone]??[]);
  if(guide.length>1)trace(guide.map((value,i)=>[i/(guide.length-1),value]),'#0b7859');
  if(state.observed.length>1){
    const range=[...state.sessionPitch,...state.observed.filter(point=>point.hz).map(point=>point.hz)].sort((a,b)=>a-b);
    if(range.length<5)return;
    const low=Math.log2(range[Math.floor(range.length*.1)]),high=Math.log2(range[Math.floor(range.length*.9)]),median=(high+low)/2;
    const span=Math.max(high-low,3/12), duration=state.observed.at(-1).seconds;
    trace(state.observed.map(point=>[point.seconds/duration,point.hz?(.5+(Math.log2(point.hz)-median)/span*.75):null]),'#ac591a');
  }
}
async function toggleCamera(){
  if(cameraStop){cameraStop();cameraStop=null;cameraState=null;$('camera-status').textContent='';showCopy();return;}
  $('camera-toggle').disabled=true;
  cameraState='cameraLoading';$('camera-status').textContent=t()[cameraState];
  try{
    const {createCamera}=await import('./camera.js');
    cameraStop=await createCamera($('camera'),visible=>{
      cameraState=visible?'face':'noFace';$('camera-status').textContent=t()[cameraState];
    });
  }catch{cameraState='cameraFailed';}
  finally{$('camera-toggle').disabled=false;showCopy();setButtonState();}
}
async function setApi(){
  const desired=$('api').value.trim().replace(/\/$/,'');
  $('save-api').disabled=true;
  try{
    if(desired){
      const url=new URL(desired);
      if(url.username||url.password||url.search||url.hash||!(url.protocol==='https:'||url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)))throw new Error();
      const response=await fetch(`${desired}/health`,{signal:AbortSignal.timeout(5000)});
      if(!response.ok||!(await response.json()).speech_therapy)throw new Error();
    }
    state.api=desired;saveStorage('vst-api',desired);$('api-status').textContent=t()[desired?'apiConnected':'apiCleared'];
  }catch{$('api-status').textContent=t().apiInvalid;}
  finally{$('save-api').disabled=false;}
}

$('interface').onchange=event=>{state.locale=event.target.value;saveStorage('vst-interface',state.locale);showExercise();};
$('language').onchange=event=>select({lang:event.target.value,level:1,tones:false,drillReturn:null});
$('item').onchange=event=>select({position:Number(event.target.value)});
$('tone-mode').onclick=()=>select({tones:!state.tones,level:1,drillReturn:null,position:state.tones?0:2});
$('next').onclick=()=>{
  if(state.drillReturn){select({...state.drillReturn,drillReturn:null});return;}
  if(state.position+1<choices().length){select({position:state.position+1});return;}
  if(!state.tones&&state.level<4)select({level:state.level+1});
  else status('allSet');
};
$('play').onclick=()=>play(1);
$('slow').onclick=()=>play(.66);
$('record').onclick=toggleCapture;
$('camera-toggle').onclick=toggleCamera;
$('save-api').onclick=setApi;
$('api').value=state.api.startsWith('/')?'':state.api;
$('hosted-choice').hidden=!hostedApi;
$('hosted-analysis').checked=Boolean(hostedApi && readStorage('vst-hosted-consent','')===hostedApi);
$('hosted-analysis').onchange=event=>saveStorage('vst-hosted-consent',event.target.checked?hostedApi:'');
$('reset-view').onclick=()=>avatar?.reset();
new ResizeObserver(paintPitch).observe($('pitch'));
setButtonState();
Promise.all([fetchJSON('data/curriculum.zh-CN.json'),fetchJSON('data/curriculum.other.json'),fetchJSON('data/demos.json')]).then(([mandarin,others,assets])=>{
  courses=[...mandarin.items,...others];media=assets;showExercise();
}).catch(error=>{console.error(error);status('startupFailed');});
import('./avatar.js').then(module=>module.createAvatar($('avatar'))).then(result=>{avatar=result;}).catch(error=>{
  console.error(error);const fallback=document.createElement('p');fallback.textContent=t().headFailed;$('avatar').replaceChildren(fallback);
});
