import {readFileSync, existsSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {copy} from '../src/copy.js';
import {audiblePitchDirection,pitchPreview,wav} from '../src/recording.js';

const data = new URL('../public/data/',import.meta.url);
const read = name => JSON.parse(readFileSync(new URL(name,data),'utf8'));

test('every training language has four playable levels',()=>{
  const items=[...read('curriculum.zh-CN.json').items,...read('curriculum.other.json')];
  const assets=read('demos.json');
  for(const language of ['en','fi-FI','es-ES','zh-CN']){
    const cohort=items.filter(item=>item.language===language);
    assert.deepEqual([...new Set(cohort.map(item=>item.level))],[1,2,3,4]);
    assert.ok(cohort.some(item=>item.practice_set==='everyday' && item.level===4));
    assert.ok(cohort.some(item=>item.practice_set==='pairs' && item.level===3));
    for(const {id,practice_set,partner} of cohort){
      for(const file of [assets[id].audio,assets[id].animation])assert.ok(existsSync(new URL(file.replace('data/',''),data)));
      if(practice_set==='pairs'){
        const alternate=cohort.find(item=>item.id===partner);
        assert.equal(alternate?.partner,id);
        assert.notEqual(assets[id].audio_revision,assets[partner].audio_revision);
      }
    }
  }
  assert.equal(items.filter(item=>item.mode==='tone').length,5);
});

test('English and Chinese provide the same interface controls',()=>{
  assert.deepEqual(Object.keys(copy.en).sort(),Object.keys(copy['zh-CN']).sort());
});

test('microphone PCM and pitch diagnostic preserve actual input',()=>{
  const samples=Float32Array.from({length:16000},(_,i)=>0.2*Math.sin(2*Math.PI*200*i/16000));
  const header=new DataView(wav(samples));
  assert.equal(header.getUint16(22,true),1);
  assert.equal(header.getUint32(24,true),16000);
  assert.equal(header.getUint32(40,true),32000);
  assert.ok(pitchPreview(samples).every(point=>Math.abs(point.hz-200)<5));
  assert.ok(pitchPreview(new Float32Array(16000)).every(point=>point.hz===null));
});

test('pitch observations use relative motion and abstain on unreliable frames',()=>{
  for(const start of [100,200]){
    const points=Array.from({length:15},(_,i)=>({seconds:i*.025,hz:start*(1+i*.025)}));
    const calibration=points.map(point=>point.hz);
    assert.equal(audiblePitchDirection(points,calibration),'pitchRise');
    assert.equal(audiblePitchDirection(points.map((point,i)=>({...point,hz:calibration.at(-i-1)})),calibration),'pitchFall');
    assert.equal(audiblePitchDirection(points.map(point=>({...point,hz:start})),calibration),null);
  }
  assert.equal(audiblePitchDirection([],[]),null);
});

test('transcription verdict compares written content and preserves word boundaries',async()=>{
  const {compareTranscription}=await import('../src/transcription.js');
  assert.equal(compareTranscription('I see you.','i see you!','en').status,'matched');
  assert.equal(compareTranscription('an ice','a nice','en').status,'different');
  assert.equal(compareTranscription("Don't go.",'Don’t go','en').status,'matched');
  assert.equal(compareTranscription('學校。','学校','zh-CN').status,'matched');
  assert.equal(compareTranscription('我要去学校。','我要去學校：','zh-CN').status,'matched');
  assert.equal(compareTranscription('¡Sí!','si','es-ES').status,'different');
  assert.equal(compareTranscription('Minä olen Ana.','MINÄ olen Ana','fi-FI').status,'matched');
  assert.equal(compareTranscription('me','…','en').status,'empty');
  assert.equal(compareTranscription('me',null,'en').status,'unavailable');
});
