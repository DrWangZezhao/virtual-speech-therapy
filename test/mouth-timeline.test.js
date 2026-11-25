import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mouthAtTime,practiceSounds} from '../src/mouth-timeline.js';
const read=name=>JSON.parse(readFileSync(new URL('../public/data/'+name,import.meta.url),'utf8'));

test('mouth movement follows recording time and closes during silence',()=>{
  const cues=[{start:0,end:.2,value:'A'},{start:.2,end:.5,value:'D'},{start:.5,end:.8,value:'X'}];
  assert.ok(mouthAtTime(cues,.1).lipAp<=0);
  assert.ok(mouthAtTime(cues,.35).lipAp>.8);
  assert.equal(mouthAtTime(cues,.7).jaw,0);
  assert.equal(mouthAtTime(cues,1).jaw,0);
});

test('exploration preserves Mandarin phones and English sound sequences',()=>{
  assert.deepEqual(practiceSounds({phonetics:'m:i:'}),['m','i']);
  assert.deepEqual(practiceSounds({phonetics:'st:ɑ:p'}),['s','t','ɑ','p']);
  const item=read('curriculum.zh-CN.json').items[0];
  assert.deepEqual(practiceSounds(item),['p','a']);
});

test('audio-derived mouth cues are ordered and stay within each recording',()=>{
  for(const asset of Object.values(read('demos.json'))){
    const track=read(asset.animation.replace('data/',''));
    assert.ok(track.mouthCues?.length,asset.animation+' has audio timing');
    let previous=0;
    for(const cue of track.mouthCues){
      assert.ok(cue.start>=previous-.001 && cue.end>cue.start);
      assert.ok(cue.end<=asset.duration+.1);
      assert.match(cue.value,/^[A-HX]$/);
      previous=cue.end;
    }
  }
});
