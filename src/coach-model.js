import {CreateMLCEngine, prebuiltAppConfig} from '@mlc-ai/web-llm';
import {cleanCoachReply} from './coach-guide.js';

const MODEL='Qwen3-4B-q4f16_1-MLC';
const record=prebuiltAppConfig.model_list.find(model=>model.model_id===MODEL);
const appConfig={...prebuiltAppConfig,model_list:[{
  ...record,
  model:record.model+'/resolve/a5c9fab855e3ccbdfed2e7e69683d75f30332161/',
}]};
let model;
self.onmessage=async({data})=>{
  const {id,prompt}=data;
  try{
    model ??= CreateMLCEngine(MODEL,{
      appConfig,
      initProgressCallback:report=>self.postMessage({loading:true,progress:Math.round(report.progress*100)}),
    },{context_window_size:4096});
    const engine=await model;
    if(!prompt){self.postMessage({id,ready:true});return;}
    const marker='\nCurrent context: ',boundary=prompt.lastIndexOf(marker);
    const context=JSON.parse(prompt.slice(boundary+marker.length));
    const instructions=prompt.slice(0,boundary).replace(/Examples of interaction:[\s\S]*?You receive/,'You receive')
      + '\nThe selected practice item is: '+context.target+'. Use it if the learner asks about the current exercise.'
      + '\nWhen relevant to the learner’s goal, use these practice phrases: '+context.examples.join(' / ');
    const history=context.recent.slice(-6).flatMap(turn=>[
      {role:'user',content:turn.heard},{role:'assistant',content:turn.reply},
    ]);
    const output=await engine.chat.completions.create({
      messages:[{role:'system',content:instructions},...history,{role:'user',content:context.heard}],
      max_tokens:128,temperature:.4,top_p:.8,extra_body:{enable_thinking:false},
    });
    const raw=output.choices[0]?.message.content;
    self.postMessage({id,text:cleanCoachReply(raw)});
  }catch(error){
    model=null;
    self.postMessage({id,error:error.message});
  }
};
