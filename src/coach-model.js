import {env, pipeline} from '@huggingface/transformers';
import {cleanCoachReply} from './coach-guide.js';

env.allowLocalModels = false;
let model;
self.onmessage = async ({data}) => {
  const {id, prompt} = data;
  try {
    model ??= pipeline('text-generation', 'onnx-community/DeepSeek-R1-Distill-Qwen-1.5B-ONNX', {
      revision:'90c5edf28c2538b20f85a3c83e6413810b7579ee',
      dtype:'q4f16', device:'webgpu',
    });
    const generate = await model;
    if (!prompt) {
      self.postMessage({id, ready:true});
      return;
    }
    const base = generate.tokenizer.apply_chat_template([{role:'user',content:prompt}], {
      tokenize:false, add_generation_prompt:true,
    }).replace(/<think>\s*$/, '');
    const output = await generate(base + '<think>\n</think>\n', {
      max_new_tokens:72, do_sample:false, return_full_text:false,
    });
    self.postMessage({id, text:cleanCoachReply(output[0]?.generated_text)});
  } catch (error) {
    model = null;
    self.postMessage({id, error:error.message});
  }
};
