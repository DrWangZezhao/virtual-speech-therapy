// Rhubarb's audio-derived visemes drive the visible lips; tongue poses remain illustrative.
const poses = {
  X:{jaw:0,lipAp:0,lipProt:0,lipWidth:.5,labiodental:0},
  A:{jaw:.04,lipAp:-.25,lipProt:0,lipWidth:.5,labiodental:0},
  B:{jaw:.18,lipAp:.13,lipProt:0,lipWidth:.65,labiodental:0},
  C:{jaw:.75,lipAp:.7,lipProt:0,lipWidth:.58,labiodental:0},
  D:{jaw:1.2,lipAp:1,lipProt:0,lipWidth:.52,labiodental:0},
  E:{jaw:.5,lipAp:.38,lipProt:.65,lipWidth:.3,labiodental:0},
  F:{jaw:.25,lipAp:.22,lipProt:1,lipWidth:.2,labiodental:0},
  G:{jaw:.12,lipAp:.03,lipProt:0,lipWidth:.5,labiodental:1},
  H:{jaw:.6,lipAp:.5,lipProt:0,lipWidth:.5,labiodental:0},
};
export function mouthAtTime(cues, time) {
  if (!cues?.length) return null;
  const index=cues.findIndex(cue=>time>=cue.start && time<cue.end);
  if(index<0)return poses.X;
  const cue=cues[index], current=poses[cue.value] ?? poses.X;
  const previous=poses[cues[index-1]?.value] ?? poses.X;
  const blend=Math.min(1,Math.max(0,(time-cue.start)/Math.min(.035,(cue.end-cue.start)/2)));
  return Object.fromEntries(Object.keys(current).map(key=>[key,previous[key]+(current[key]-previous[key])*blend]));
}
export function practiceSounds(item) {
  if (item.groups?.length) return [...new Set(item.groups.flatMap(g=>g.syllables.flatMap(s=>s.surface_phones ?? s.phones ?? [])))];
  return [...new Set((item.phonetics ?? '').split(/\s+/).flatMap(s=>{
    const [onset='',vowel='',coda='']=s.split(':');
    const parts=value=>value.match(/tʃ|dʒ|tɕ|ts|[ptk]ʰ|./gu) ?? [];
    return [...parts(onset),vowel,...parts(coda)].filter(Boolean);
  }))];
}
