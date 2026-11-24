import {readFileSync, existsSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {copy} from '../src/copy.js';
import {pitchPreview,wav} from '../src/recording.js';

const data = new URL('../public/data/',import.meta.url);
const read = name => JSON.parse(readFileSync(new URL(name,data),'utf8'));

test('every training language has four playable levels',()=>{
  const items=[...read('curriculum.zh-CN.json').items,...read('curriculum.other.json')];
  const assets=read('demos.json');
  for(const language of ['en','fi-FI','es-ES','zh-CN']){
    const cohort=items.filter(item=>item.language===language);
    assert.deepEqual([...new Set(cohort.map(item=>item.level))],[1,2,3,4]);
    for(const {id} of cohort){
      for(const file of [assets[id].audio,assets[id].animation])assert.ok(existsSync(new URL(file.replace('data/',''),data)));
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
