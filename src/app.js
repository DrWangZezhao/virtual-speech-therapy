import './style.css';
import {practiceSounds} from './mouth-timeline.js';
import {copy} from './copy.js';
import {audiblePitchDirection,capture,decode,pitchPreview,wav} from './recording.js';
import {compareTranscription} from './transcription.js';
import {transcribe} from './whisper-client.js';

const $ = id => document.getElementById(id);
$('coach-notice').hidden = false;
const hostedApi = (import.meta.env.VITE_API_URL || '').replace(/\/$/,'');
const apiDefault = import.meta.env.DEV ? '/api' : '';
const languages = ['en','fi-FI','es-ES','zh-CN'];
const contours = {1:[.78,.81,.83,.81,.79],2:[.29,.32,.48,.67,.88],3:[.48,.28,.17,.25,.59],4:[.91,.73,.51,.32,.18],5:[.52,.49,.41]};
const readStorage = (key, fallback) => {
  try {return JSON.parse(localStorage.getItem(key)) ?? fallback;}
  catch {return fallback;}
};
const saveStorage = (key,value) => {try {localStorage.setItem(key,JSON.stringify(value));}catch{}};
const state = {lang:readStorage('vst-language','en'),locale:readStorage('vst-interface','en'),level:1,category:null,
  counts:readStorage('vst-counts',{}),position:0,status:'ready',recording:false,busy:false,result:null,observed:[],
  sessionPitch:[],api:readStorage('vst-api',apiDefault),request:0,drillReturn:null};
if(!languages.includes(state.lang))state.lang='en';
if(!copy[state.locale])state.locale='en';
const t = () => copy[state.locale];
const demoAudio = new Audio();
demoAudio.preload='auto';
let courses=[], media={}, avatar, micStop, recordingURL;
let cameraController, cameraState, livePose;
let coachController, coachState, coachOpen=false;
const animationCache=new Map();
let playbackSequence=0, timelineFrame;

async function fetchJSON(path, options){
  const response=await fetch(new URL(path,document.baseURI),options);
  if(!response.ok)throw new Error(String(response.status));
  return response.json();
}
function versionedAsset(path, revision){
  const url=new URL(path,document.baseURI);
  if(revision)url.searchParams.set('v',revision);
  return url;
}
function choices(){
  return courses.filter(item=>{
    if(item.language!==state.lang)return false;
    if(state.category==='tone')return item.mode==='tone';
    if(state.category)return item.practice_set===state.category;
    return item.level===state.level && item.mode!=='tone' && !item.practice_set;
  });
}
function active(){return choices()[state.position];}
function syllables(item){return item?.groups.flatMap(group=>group.syllables) ?? [];}
function status(key){
  state.status=key;
  $('status').textContent=['ready','saved'].includes(key)?'':t()[key]??'';
  $('status').hidden=!$('status').textContent;
}
function labelFor(item){return item.focus ? `${item.focus.value} · ${item.text}` : item.text;}
function setButtonState(){
  const lock=state.recording || state.busy;
  for(const id of ['language','item','levels','open-exercises','contrast'])$(id).disabled=lock;
  $('language').disabled=lock || coachOpen;
  for(const element of [$('mouth-timeline'),$('timeline-play'),...$('sound-buttons').children])element.disabled=lock || coachOpen;
  $('coach-entry').disabled=lock || !active();
  $('play').disabled=lock || !active();
  $('next').disabled=lock || !active();
  $('record').disabled=state.busy || !active();
  $('record').dataset.recording=String(state.recording);
  $('record-label').textContent=t()[state.recording?'stop':state.counts[active()?.id]?'retry':'record'];
}
function showCopy(){
  document.documentElement.lang=state.locale;
  document.title=t().brand;
  for(const element of document.querySelectorAll('[data-copy]')) element.textContent=t()[element.dataset.copy];
  $('avatar').setAttribute('aria-label',t().avatar);
  $('pitch').setAttribute('aria-label',t().pitch);
  $('recognition').setAttribute('aria-label',t().transcript);
  showCamera();
  showCoachState();
}
function showExercise(){
  showCopy();
  $('language').value=state.lang;
  $('interface').value=state.locale;
  const exercises=choices(), item=exercises[state.position];
  const categories=t().levels.map((label,index)=>new Option(label,String(index+1)));
  for(const name of ['everyday','pairs','tone']){
    if(courses.some(entry=>entry.language===state.lang && (entry.practice_set===name || entry.mode===name))){
      categories.push(new Option(t()[name==='tone'?'tones':name],name));
    }
  }
  $('levels').replaceChildren(...categories);
  $('levels').value=state.category??String(state.level);
  $('current-level').textContent=$('levels').selectedOptions[0]?.textContent??t().exercise;
  $('item-position').textContent=item?`${state.position+1} / ${exercises.length}`:'';
  $('item').replaceChildren(...exercises.map((entry,index)=>new Option(labelFor(entry),String(index),false,index===state.position)));
  if(!item){setButtonState();return;}
  const sounds=syllables(item), focus=item.focus;
  $('item-title').textContent=focus?.value??item.text;
  $('item-title').lang=state.lang;
  $('item-title').classList.toggle('long',item.text.length>(state.lang==='zh-CN'?8:11));
  $('pronunciation').textContent=sounds.length?sounds.map(s=>s.pinyin).join(' '):'';
  const toneNames=sounds.length===1 && !focus ? t().toneNames[sounds[0].lexical_tone] : '';
  const carrier=focus?.type==='initial' ? `${t().initial} · ${t().carrier} ${item.text}`:
    focus?.type==='final'?`${t().final} /${focus.ipa}/ · ${t().carrier} ${item.text}`:'';
  $('subtarget').textContent=carrier||toneNames;
  $('subtarget').hidden=!(carrier||toneNames);
  const partnerIndex=exercises.findIndex(entry=>entry.id===item.partner);
  $('contrast').hidden=partnerIndex<0;
  if(partnerIndex>=0){
    $('contrast').textContent=t().compareWith(exercises[partnerIndex].text);
    $('contrast').onclick=()=>{
      select({position:partnerIndex});
      play($('slow').checked ? .78 : 1);
    };
  }
  $('pitch-card').hidden=state.lang!=='zh-CN' || Boolean(focus);
  $('progress').textContent=t().mark(Object.values(state.counts).filter(Boolean).length);
  $('next-label').textContent=t()[state.drillReturn?'backSentence':'next'];
  $('mouth-timeline').max=media[item.id]?.duration ?? 1;
  $('mouth-timeline').value=0;
  $('timeline-time').textContent='0.00 s';
  $('sound-hint').textContent=t().soundTip;
  $('sound-buttons').replaceChildren(...practiceSounds(item).map(sound=>{
    const button=document.createElement('button');button.type='button';button.textContent=`/${sound}/`;
    button.setAttribute('aria-pressed','false');
    button.onclick=()=>{
      playbackSequence++;demoAudio.pause();
      try {
        if(!avatar?.showSound(sound))return;
        for(const sibling of $('sound-buttons').children)sibling.setAttribute('aria-pressed',String(sibling===button));
        $('sound-hint').textContent=t().soundSelected(sound);
      } catch { $('sound-hint').textContent=t().illustration; }
    };
    return button;
  }));
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
  addDetail(list,t().ipalabel,sounds.length?sounds.map(sound=>sound.ipa).join(' '):item.phonetics?.replaceAll(':',''));
  addDetail(list,t().surface,sounds.map(sound=>sound.surface_pinyin_numbered).join(' '));
  const asset=media[item.id];
  if(asset?.credit){
    const recordingType = asset.audio_kind === 'human' ? t().audioHuman : t().audioNeural;
    addDetail(list,t().listen,`${recordingType} · ${asset.credit.author} · ${asset.credit.license}`);
    const link=document.createElement('a');link.href=asset.credit.source;link.rel='noopener noreferrer';link.target='_blank';link.textContent=t().source;
    const license=document.createElement('a');license.href=asset.credit.license_url;license.rel='noopener noreferrer';license.target='_blank';license.textContent=asset.credit.license;
    list.lastElementChild.append(' ',link,' · ',license);
  }else addDetail(list,t().listen,t().audioSynth);
  $('recognition').hidden=!result && !recordingURL;
  $('transcript-verdict').hidden=!result;
  $('summary-heard').hidden=true;
  $('drill').hidden=true;
  $('pitch-observation').hidden=true;
  $('transcript-target').textContent=item.text;
  $('transcript-target').lang=state.lang;
  $('transcript-heard').textContent=t().transcriptVerdicts.unavailable;
  $('transcript-heard').lang=state.locale;
  $('pronunciation-result').textContent='';
  if(!result)return;
  const comparison=compareTranscription(item.text,result.text,state.lang);
  const verdict=$('transcript-verdict');
  verdict.dataset.result=comparison.status;
  verdict.textContent=t().transcriptVerdicts[comparison.status];
  $('transcript-heard').textContent=comparison.actual.length?result.text:t().transcriptVerdicts[comparison.status];
  $('transcript-heard').lang=comparison.actual.length?state.lang:state.locale;
  $('summary-heard').hidden=comparison.status!=='different';
  $('heard-text').textContent=result.text??'';
  $('heard-text').lang=state.lang;
  const direction=item.mode==='tone'?audiblePitchDirection(state.observed,state.sessionPitch):null;
  $('pitch-observation').hidden=!direction;
  $('pitch-observation').textContent=direction?t()[direction]:'';
  const pronunciation=result.match==='matched'?t().match:result.source==='praat'?t().uncertain:t().unavailable;
  $('pronunciation-result').textContent=`${t().pronunciationResult} · ${pronunciation}`;
  addDetail(list,state.lang==='zh-CN'?t().score:t().wordScore,comparison.errorRate===null?null:`${Math.round(100*comparison.errorRate)}%`);
  addDetail(list,t().segment,result.segments?.length?`${t().uncertain} · ${result.segments.join(' ')}`:t().unavailable);
  if(state.lang==='zh-CN')addDetail(list,t().tone,result.tone==='matched'?t().matching:t().uncertain);
  if(state.observed.length)addDetail(list,t().pitch,result.source==='praat'?t().serverPitch:t().localPitch);
  addDetail(list,t().words,result.alignment?.words?.map(([a,b,word])=>`${word} ${a.toFixed(2)}–${b.toFixed(2)} s`).join(' · '));
  addDetail(list,t().phones,result.alignment?.phones?.map(([a,b,ph])=>`${ph} ${a.toFixed(2)}–${b.toFixed(2)} s`).join(' · '));
  const {expected,actual,edits}=comparison;
  const targetWord=state.lang==='zh-CN'&&edits===1&&item.level===4&&expected.length===actual.length?
    item.word_spans.find(word=>expected.some((c,i)=>c!==actual[i]&&i>=word.start&&i<word.end)):null;
  if(targetWord){
    const candidates=courses.filter(word=>word.language===state.lang&&word.level===3&&!word.practice_set&&word.mode!=='tone');
    const position=candidates.findIndex(word=>word.text===targetWord.text);
    if(position>=0){
      $('drill').hidden=false;$('drill').textContent=`${t().word} · ${targetWord.text}`;
      $('drill').onclick=()=>{
        $('result-dialog').close();
        select({level:3,category:null,position,drillReturn:{lang:state.lang,level:4,category:state.category,position:state.position}});
      };
    }
  }
}
async function prepareDemo(item,current){
  const asset=media[item?.id];
  if(!asset || !current())return false;
  const trackURL=versionedAsset(asset.animation,asset.animation_revision).href;
  if(!animationCache.has(trackURL))animationCache.set(trackURL,fetchJSON(trackURL).catch(error=>{animationCache.delete(trackURL);throw error;}));
  const track=await animationCache.get(trackURL);
  if(!current())return false;
  const audioURL=versionedAsset(asset.audio,asset.audio_revision).href;
  if(demoAudio.src!==audioURL)demoAudio.src=audioURL;
  avatar?.demonstrate(track,demoAudio);
  for(const button of $('sound-buttons').children)button.setAttribute('aria-pressed','false');
  return true;
}
async function playAsset(item,speed,current){
  const sequence=++playbackSequence;
  const valid=()=>sequence===playbackSequence && current();
  demoAudio.pause();
  try{
    if(!await prepareDemo(item,valid))return false;
    demoAudio.currentTime=0;demoAudio.playbackRate=speed;
    await demoAudio.play();
    return valid();
  }catch(error){
    if(valid() && error.name!=='AbortError' && !coachOpen)status('audioFailed');
    return false;
  }
}
function updateTimeline(){
  $('mouth-timeline').value=String(demoAudio.currentTime);
  $('timeline-time').textContent=`${demoAudio.currentTime.toFixed(2)} s`;
  cancelAnimationFrame(timelineFrame);
  if(!demoAudio.paused)timelineFrame=requestAnimationFrame(updateTimeline);
}
for(const event of ['play','pause','seeked','ended'])demoAudio.addEventListener(event,updateTimeline);
$('mouth-timeline').oninput=async event=>{
  const time=Number(event.target.value),request=state.request,sequence=++playbackSequence;
  demoAudio.pause();
  try{
    if(!await prepareDemo(active(),()=>request===state.request && sequence===playbackSequence))return;
    demoAudio.currentTime=time;
    $('mouth-timeline').value=String(time);
    $('timeline-time').textContent=`${time.toFixed(2)} s`;
  }catch{status('audioFailed');}
};
$('timeline-play').onclick=async()=>{
  if(!demoAudio.paused){demoAudio.pause();return;}
  const request=state.request,sequence=++playbackSequence;
  try{
    if(!await prepareDemo(active(),()=>request===state.request && sequence===playbackSequence))return;
    demoAudio.playbackRate=$('slow').checked ? .78 : 1;
    if(demoAudio.ended)demoAudio.currentTime=0;
    await demoAudio.play();
  }catch{status('audioFailed');}
};

function play(speed){
  const request=state.request;
  return playAsset(active(),speed,()=>request===state.request);
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
      const text=await transcribe(samples,item.language,{onReady:()=>status('analyzing')});
      state.result={text,source:'browser'};status('saved');
    }catch{state.result={source:'browser'};status('localFailed');}
  }catch{status('unclear');}
  finally{state.busy=false;showExercise();}
}
async function toggleCapture(){
  if(state.recording){micStop?.();return;}
  if(!active()||state.busy)return;
  demoAudio.pause();avatar?.clear();
  if(recordingURL){URL.revokeObjectURL(recordingURL);recordingURL=null;}
  $('recording').hidden=true;$('recording').removeAttribute('src');
  state.busy=true;state.result=null;state.observed=[];const item=active(),id=++state.request;
  showResult();
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
  ctx.strokeStyle='#38343c';ctx.lineWidth=1;
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
  if(guide.length>1)trace(guide.map((value,i)=>[i/(guide.length-1),value]),'#9c9be9');
  if(state.observed.length>1){
    const range=[...state.sessionPitch,...state.observed.filter(point=>point.hz).map(point=>point.hz)].sort((a,b)=>a-b);
    if(range.length<5)return;
    const low=Math.log2(range[Math.floor(range.length*.1)]),high=Math.log2(range[Math.floor(range.length*.9)]),median=(high+low)/2;
    const span=Math.max(high-low,3/12), duration=state.observed.at(-1).seconds;
    trace(state.observed.map(point=>[point.seconds/duration,point.hz?(.5+(Math.log2(point.hz)-median)/span*.75):null]),'#f4afbe');
  }
}
function showCamera(){
  const message=t()[cameraState] ?? '';
  if($('camera-status').textContent!==message)$('camera-status').textContent=message;
  if($('mirror-status').textContent!==message)$('mirror-status').textContent=message;
  $('live-mirror').hidden=!cameraController || cameraState==='cameraLoading';
  $('camera-toggle').textContent=cameraController?t().cameraOff:t().cameraOn;
}
function stopCamera(reason=null){
  cameraController?.abort();
  cameraController=null;
  cameraState=reason;
  livePose=null;
  avatar?.setLiveMouth(null);
  showCamera();
}
async function toggleCamera(){
  if(cameraController){stopCamera();return;}
  const controller=new AbortController();
  cameraController=controller;
  cameraState='cameraLoading';
  showCamera();
  try{
    const {createCamera}=await import('./camera.js');
    await createCamera($('camera'),(pose,ended)=>{
      if(controller.signal.aborted)return;
      if(ended){stopCamera('cameraFailed');return;}
      livePose=pose;
      avatar?.setLiveMouth(pose);
      cameraState=pose?.tongue?'tongueVisible':pose?'face':'noFace';
      showCamera();
    },controller.signal);
    if(controller.signal.aborted)return;
    cameraState='noFace';
    showCamera();
    $('settings-dialog').close();
  }catch{
    if(cameraController===controller)stopCamera('cameraFailed');
  }
}

function showCoachState(){
  $('coach-panel').hidden=!coachOpen;
  $('exercise-panel').hidden=coachOpen;
  const message=t()[coachState] ?? '';
  if($('coach-phase').textContent!==message)$('coach-phase').textContent=message;
  $('coach-end').textContent=coachController?t().coachEnd:t().coachBack;
}

function closeCoach(){
  coachController?.abort();
  coachController=null;
  coachOpen=false;
  demoAudio.pause();
  avatar?.setSpeaking(false);
  avatar?.clear();
  showCoachState();
  setButtonState();
  $('coach-entry').focus();
}

async function startCoach(){
  if(!active() || state.recording || state.busy || coachOpen)return;
  const language=state.lang;
  const shortPhrases=courses.filter(item=>item.language===language && item.practice_set==='everyday');
  const prompts=!state.category && state.level===1 && state.position===0 && shortPhrases.length
    ? shortPhrases : choices().slice(state.position);
  let position=0;
  const controller=new AbortController();
  const {signal}=controller;
  coachController=controller;
  coachOpen=true;
  coachState='coachStarting';
  $('coach-caption').textContent='';
  $('coach-voice-note').hidden=true;
  $('coach-caption').lang=language;
  demoAudio.pause();
  avatar?.clear();
  showCoachState();
  setButtonState();
  $('coach-end').focus();
  try{
    const {runCoachSession,waitForAudio}=await import('./coach-session.js');
    if(signal.aborted)return;
    const target=()=>prompts[position];
    await runCoachSession({
      language,signal,target,
      apiKey:$('coach-key').value.trim(),useLocal:$('coach-local').checked,
      advance:()=>position+1<prompts.length && Boolean(prompts[++position]),
      demo:(speed,turnSignal)=>waitForAudio(demoAudio,()=>playAsset(target(),speed,()=>!signal.aborted),turnSignal),
      voiceUnavailable:()=>{if(!signal.aborted)$('coach-voice-note').hidden=false;},
      progress:value=>{if(!signal.aborted)$('coach-caption').textContent=t().coachProgress(value);},
      caption:text=>{if(!signal.aborted)$('coach-caption').textContent=text;},
      phase:key=>{if(!signal.aborted){coachState=key;showCoachState();}},
      speaking:value=>{if(coachController===controller)avatar?.setSpeaking(value);},
    });
    if(!signal.aborted)coachState='coachFinished';
  }catch{
    if(!signal.aborted && coachState!=='coachUnsupported')coachState=coachState==='coachStarting'?'micError':'coachError';
  }finally{
    if(coachController===controller){
      controller.abort();
      coachController=null;
      avatar?.setSpeaking(false);
      showCoachState();
    }
  }
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
$('language').onchange=event=>select({lang:event.target.value,level:1,category:null,drillReturn:null});
$('levels').onchange=({target})=>{
  const level=Number(target.value);
  select({level:level||1,category:level?null:target.value,drillReturn:null});
};
$('item').onchange=event=>select({position:Number(event.target.value)});
$('next').onclick=()=>{
  if(state.drillReturn){select({...state.drillReturn,drillReturn:null});return;}
  if(state.position+1<choices().length){select({position:state.position+1});return;}
  if(!state.category&&state.level<4)select({level:state.level+1});
  else status('allSet');
};
$('play').onclick=()=>play($('slow').checked ? .78 : 1);
$('slow').checked=Boolean(readStorage('vst-slow',false));
$('slow').onchange=event=>saveStorage('vst-slow',event.target.checked);
$('record').onclick=toggleCapture;
$('camera-toggle').onclick=toggleCamera;
$('stop-camera').onclick=()=>{stopCamera();$('open-settings').focus();};
$('coach-entry').onclick=startCoach;
$('coach-end').onclick=closeCoach;
$('local-model-option').hidden=false;
$('coach-local').checked=Boolean(readStorage('vst-coach-local',true));
$('coach-local').onchange=event=>saveStorage('vst-coach-local',event.target.checked);
window.addEventListener('pagehide',()=>{coachController?.abort();cameraController?.abort();});
$('save-api').onclick=setApi;
$('api').value=state.api.startsWith('/')?'':state.api;
$('hosted-choice').hidden=!hostedApi;
$('hosted-analysis').checked=Boolean(hostedApi && readStorage('vst-hosted-consent','')===hostedApi);
$('hosted-analysis').onchange=event=>saveStorage('vst-hosted-consent',event.target.checked?hostedApi:'');
$('reset-view').onclick=()=>avatar?.reset();
for(const [button,dialog] of [['open-exercises','exercises-dialog'],['open-settings','settings-dialog'],['open-result','result-dialog']]){
  $(button).onclick=()=>$(dialog).showModal();
}
new ResizeObserver(paintPitch).observe($('pitch'));
setButtonState();
Promise.all(['curriculum.zh-CN','curriculum.other','demos'].map(name=>fetchJSON(`data/${name}.json`,{cache:'no-cache'}))).then(([mandarin,others,assets])=>{
  courses=[...mandarin.items,...others];media=assets;showExercise();
}).catch(error=>{console.error(error);status('startupFailed');});
import('./avatar.js').then(module=>module.createAvatar($('avatar'))).then(result=>{avatar=result;avatar.setLiveMouth(livePose);}).catch(error=>{
  console.error(error);const fallback=document.createElement('p');fallback.textContent=t().headFailed;$('avatar').replaceChildren(fallback);
});
