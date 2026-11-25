# Virtual Speech Therapy

[Open the practice app](https://drwangzezhao.github.io/virtual-speech-therapy/)

Virtual Speech Therapy is a pronunciation practice aid for speech rehabilitation. The English interface opens by default. Choose **English, Suomi, Español or 中文** for practice and switch the interface independently to Simplified Chinese. The original CHIMERA 3D head shows tongue, lip and jaw movements alongside each pronunciation example.

The four courses include sounds, syllables, words, sentences, sound pairs and everyday phrases. The full-screen studio puts the articulating head, the current prompt and the Listen, Record and Next buttons in one view. Open the category control above the prompt to select an exercise. Mandarin also includes five tone exercises, Pinyin, lexical and surface tones and a pitch-contour view. Settings include slow examples, a view reset and on-device camera tracking of external face and lip landmarks.

## Practice materials

The curated prompts use one-sound contrasts and progress from syllables and words to phrases. **Sound pairs** lets you hear each item alongside its partner, including English *fan/van*, Spanish *pero/perro*, Finnish *tuli/tuuli* and Mandarin *汤/糖*. **Everyday phrases** covers common needs such as asking for help, requesting water, asking for repetition and taking a break.

- [ASHA's Speech Sound Disorders practice portal](https://www.asha.org/practice-portal/clinical-topics/articulation-and-phonology/) describes minimum phoneme contrasts and practice at increasing levels of complexity.
- [ARASAAC's Spanish /p/ activities](https://static.arasaac.org/materials/2526/Fonema_P_Actividades_para_articulacion.pdf) and [Spanish /r/ activities](https://static.arasaac.org/materials/2526/Fonema_R_Actividades_para_articulacion.pdf) by Almudena Vergara and Elena Serrano informed the choice of sound families. [Víctor Serrano González's social script for asking for help](https://static.arasaac.org/materials/4554/es/Guion_social_pedir_y_ofrecer_ayuda.pdf) informed the everyday topic. These public references are available under [ARASAAC's terms](https://aulaabierta.arasaac.org/condiciones-de-uso). The app contains its own exercise selections, illustration and demonstration audio.
- [The Institute for the Languages of Finland](https://kotus.fi/suomen-puhumisen-haasteita/) discusses the distinction between single and double consonants in spoken Finnish.

The exercises are practice prompts for the existing recognizer. Text comparison uses Whisper. A speech-language professional can select the prompts that suit an individual's goals.

## Online and server-assisted practice

On GitHub Pages, multilingual Whisper runs in the browser on the captured audio. The first recording downloads the model. The main screen shows a short text comparison and, when the transcript differs, what Whisper heard. Open **Details** to compare the texts, replay the recording and view available measurements. Mandarin comparison normalizes Simplified and Traditional Chinese. The other languages compare words and preserve accents. Pronunciation assessment requires separate acoustic evidence.

The optional Python analysis service provides multilingual Whisper, Wav2Vec2 phoneme output, Praat-Parselmouth F0 and Mandarin Montreal Forced Aligner timing. GitHub Pages serves static assets. Run the service on a computer or HTTPS host and set **Settings → Analysis settings → Analysis server URL** to its `/api` endpoint. For a deployment with a shared server, set the repository Actions variable `VST_API_URL` to that endpoint and redeploy. Default practice keeps audio in the browser. Enable **Send my recordings to the analysis server** to use the shared service. The service processes audio in memory or temporary alignment files and retains no recordings.

The phoneme and tone grading interface reports uncertainty until its contrast-specific acceptance tests pass. The browser preview uses real recorded audio and reports relative pitch. On isolated tones it reports audible upward or downward movement when voiced frames support it. It is a separate diagnostic from the server's Praat output. MFA aligns the known prompt for timing. Corpus validation found weak discrimination for several aspirated contrasts and overlapping tone tokens. These outputs remain diagnostic. On GitHub Pages, advanced segment and forced-alignment results require a configured service.

## Run locally

Use Node.js 24 or later, Python 3.12 and an isolated MFA environment. The frontend is also usable without a local Python service.

```sh
npm ci
npm test
npm run dev
```

Install and run the optional service from another terminal. The model download is approximately 1.4 GB.

```sh
python -m pip install -r backend/requirements.txt
python backend/download_models.py
mfa model download acoustic mandarin_mfa
mfa model download dictionary mandarin_china_mfa
python -m uvicorn --app-dir backend service:app --host 127.0.0.1 --port 8787
```

The service expects MFA 3.4.4 on `PATH` or at `VST_MFA`. Use an absolute `VST_MODELS` path to reuse downloaded models. The local Vite server forwards `/api` to port 8787. When deploying the Python service on HTTPS, set `VST_ORIGINS` to the allowed origin list and use `backend/requirements.txt` with the official Mandarin acoustic and dictionary resources. The API accepts 16 kHz mono PCM WAV and serializes model work to bound memory use. Use a production reverse proxy appropriate for your host.

## Cloud deployment

`backend/Dockerfile` builds the Linux analysis service with pinned checkpoints and MFA 3.0.0 Mandarin assets. GitHub Actions verifies the image against a licensed reference recording. For Modal, install the Modal CLI, authenticate into the intended workspace and run `modal deploy backend/modal_app.py` from the repository root. The application uses a single on-demand CPU container with 6 GiB of memory and shuts it down when it is idle. Set the Pages variable to the deployed URL with `/api` appended. Check `/api/health`, then verify an actual recording through the public website.

## Demonstration assets

CHIMERA is vendored from Jameson Hodge's MIT-licensed [upstream revision](https://github.com/jamesondh/chimera-vocal-synth/tree/616b9af366ce43d5b41094aee2503e64afb795a0). The app uses the original renderer and Rust engine compiled to WebAssembly. The remapped articulator tracks come from that engine. They are synchronized as illustrations to the playback duration. Exact contact timing and spoken pitch fidelity require target-specific validation. The single-vowel target `o` uses a rounded carrier with a glide. The course names it separately from the sustained target.

Use `public/data/demos.json` for audio attribution, author, license and edit details. Licensed Mandarin reference clips include all five `ma` tone examples and selected words. The first-tone example was excerpted from `māma`. The remaining demos use Kokoro for English, Spanish and Mandarin and Piper Harri for Finnish. The asset pipeline retains eSpeak NG as a phonemization dependency and uses `cmn` for its Mandarin fallback. Audio and third-party code retain their source licenses. [Kokoro model](https://huggingface.co/hexgrad/Kokoro-82M), [Piper Harri voice](https://huggingface.co/rhasspy/piper-voices/tree/main/fi/fi_FI/harri/medium)

Model sources are [Whisper tiny ONNX](https://huggingface.co/onnx-community/whisper-tiny), [Whisper base CTranslate2](https://huggingface.co/Systran/faster-whisper-base), [Wav2Vec2 Phoneme](https://huggingface.co/facebook/wav2vec2-xlsr-53-espeak-cv-ft) and [MFA Mandarin](https://mfa-models.readthedocs.io/en/latest/acoustic/Mandarin/index.html).

## 简体中文

这是言语康复中的发音练习工具，默认打开英文界面。练习语言包括英语、芬兰语、西班牙语和普通话。点右上角的设置可以把界面切换到简体中文。点目标词上方的分类按钮可以选择日常短句、辨音词对或普通话声调。先听示范并观察三维头像的嘴部动作，再录下自己的发音。摄像头功能是可选项，在本机追踪外部可见的面部和嘴唇。

在线版默认在浏览器内运行 Whisper。录完后直接显示文字匹配结果，打开「详情」可以查看识别全文和回放录音。可在「设置 → 分析设置」开启云端 Praat、音素输出和普通话强制对齐。

## Voice coach and camera following

Choose **Talk with coach** for free on-device conversation. The browser downloads Qwen3 4B (approximately 2.3 GB) on first use and caches its files when browser storage permits. WebLLM 0.2.89 runs the model locally. A compatible WebGPU browser with shader-f16 and enough device memory (about 3.5 GB for the model) is required. Whisper transcribes each turn locally. Silence ends a spoken turn; **End conversation** releases the microphone. Download progress is shown while loading.

Turning off the local model in settings enables prepared guidance with Kokoro and Piper recordings. The default local model enables open conversation with recent exchanges as context (six on-device, up to twelve when using a personal API key), short replies, one question at a time, and gradual practice suggestions. Generated conversations do not automatically advance exercises or replay demonstrations. **End conversation** releases the microphone. Whisper still transcribes audio locally; generated replies appear as captions and use a matching local system voice when installed.

Coach behavior is configured through instructions and examples, not fine-tuning or clinical training. The local WebGPU model is enabled by default. Small on-device models can make mistakes; four-language quality is not clinically validated. Settings also support a personal DeepSeek API key held only in page memory, which sends text directly to DeepSeek. When a configured model fails, the session reports a connection error. Without a configured model, only prepared guidance is available. Speech animation is illustrative; exercise demonstrations use the CHIMERA tracks.

**Explore sounds** shows the exercise's individual speech sounds. Selecting one holds its starting CHIMERA articulatory pose; the time slider pauses and inspects the full recording. Play/pause resumes at the selected time. Animation data is loaded before audio starts, and the playback clock drives both the slider and the head, including slow playback.

Recorded demonstrations now carry audio-derived mouth cues generated by [Rhubarb Lip Sync 1.14.0, MIT](https://github.com/DanielSWolf/rhubarb-lip-sync). Regenerate them with `python3 scripts/build_lipsync.py /path/to/rhubarb` after replacing recordings. English uses its transcript-assisted recognizer; the other languages use its phonetic recognizer. These are approximate visible mouth shapes, not validated phoneme boundaries or measured tongue positions. Generated coach speech uses local system voices with speaking motion bounded by actual playback events; its mouth motion remains illustrative, rather than phoneme-synchronized.

**Mirror my mouth** uses MediaPipe Face Landmarker 0.10.32, its 478 surface landmarks and expression scores to drive jaw opening, lip aperture, lip width and rounding. Frames stay on device. A conservative color and connected-component heuristic estimates tongue extension only when a region crosses the lower-lip contour. This experimental estimate is sensitive to light, skin color, lipstick and occlusion. It has not been validated as a tongue tracker. Internal tongue posture is unavailable from the front camera. Demonstration audio and coach speech take priority over camera movement.

Sources and licenses are [MediaPipe, Apache 2.0](https://github.com/google-ai-edge/mediapipe), [MediaPipe's blendshape definitions](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/cc/vision/face_landmarker/face_blendshapes_graph.cc), [Qwen3, Apache 2.0](https://huggingface.co/Qwen/Qwen3-4B), [Qwen3 MLC weights](https://huggingface.co/mlc-ai/Qwen3-4B-q4f16_1-MLC/tree/a5c9fab855e3ccbdfed2e7e69683d75f30332161), [WebLLM](https://webllm.mlc.ai/docs/user/basic_usage.html), and [DeepSeek API documentation](https://api-docs.deepseek.com/api/create-chat-completion/). The coach's prepared recordings retain the Kokoro and Piper voice licenses described above. Regenerate them with `scripts/coach_audio.py`.
