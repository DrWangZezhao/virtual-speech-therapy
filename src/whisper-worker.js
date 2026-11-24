import {env, pipeline} from '@huggingface/transformers';

env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;
let model;
self.onmessage = async ({data}) => {
  try {
    model ??= pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny', {
      revision:'ff4177021cc41f7db950912b73ea4fdf7d01d8e7', dtype:'q8', device:'wasm'
    }).catch(error => { model = null; throw error; });
    const transcribe = await model;
    self.postMessage({id:data.id, ready:true});
    const result = await transcribe(data.samples,{language:data.language,task:'transcribe',return_timestamps:false});
    self.postMessage({id:data.id, text:result.text?.trim() ?? ''});
  } catch (error) { self.postMessage({id:data.id, error:error.message}); }
};
