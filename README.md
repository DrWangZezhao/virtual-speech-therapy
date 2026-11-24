# Virtual Speech Therapy

[Open the practice app](https://drwangzezhao.github.io/virtual-speech-therapy/)

Virtual Speech Therapy is a pronunciation practice aid for speech rehabilitation. The English interface opens by default. Choose **English, Suomi, Español or 中文** for practice and switch the interface independently to Simplified Chinese. The original CHIMERA 3D head shows tongue, lip and jaw movements alongside each pronunciation example.

The four courses include sounds, syllables, words and sentences. Mandarin also includes five tone exercises, Pinyin, lexical and surface tones and a pitch-contour view. Listen at normal or slow speed, record a microphone attempt and replay it. The optional camera tracks external face and lip landmarks on the device. A recording can be made and reviewed with the camera off.

## Online and server-assisted practice

On GitHub Pages, multilingual Whisper runs in the browser on the captured audio. The first recording downloads the model. The page also shows a browser pitch preview and tracks session attempts. The labels distinguish text recognition, segment evidence and tone evidence. A transcription match cannot pass an unverified pronunciation check. The application is a practice aid. Use it with the guidance of a speech-language professional.

The optional Python analysis service provides real multilingual Whisper, Wav2Vec2 phoneme output, Praat-Parselmouth F0 and Mandarin Montreal Forced Aligner timing. GitHub Pages serves static assets. Run the service on a computer or HTTPS host and set **Advanced analysis → Analysis server URL** to its `/api` endpoint. For a deployment with a shared server, set the repository Actions variable `VST_API_URL` to that endpoint and redeploy. Default practice keeps audio in the browser. Configuring a server sends practice recordings to it. The service processes audio in memory or temporary alignment files and retains no recordings.

The phoneme and tone grading interface reports uncertainty until its contrast-specific acceptance tests pass. The browser preview uses real recorded audio and reports relative pitch. It is a separate diagnostic from the server's Praat output. MFA aligns the known prompt for timing. Corpus validation found weak discrimination for several aspirated contrasts and overlapping tone tokens. These outputs remain diagnostic. On GitHub Pages, advanced segment and forced-alignment results require a configured service.

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

## Demonstration assets

CHIMERA is vendored from Jameson Hodge's MIT-licensed [upstream revision](https://github.com/jamesondh/chimera-vocal-synth/tree/616b9af366ce43d5b41094aee2503e64afb795a0). The app uses the original renderer and Rust engine compiled to WebAssembly. The remapped articulator tracks come from that engine. They are synchronized as illustrations to the playback duration. Exact contact timing and spoken pitch fidelity require target-specific validation. The single-vowel target `o` uses a rounded carrier with a glide. The course names it separately from the sustained target.

Use `public/data/demos.json` for audio attribution, author, license and edit details. Licensed Mandarin reference clips include the `má`, `mǎ`, `mà` and neutral `ma` examples and selected words. The remaining examples use eSpeak NG with an explicit synthesized label. Mandarin uses `cmn`. Audio and third-party code retain their source licenses. Model sources are [Whisper tiny ONNX](https://huggingface.co/onnx-community/whisper-tiny), [Whisper base CTranslate2](https://huggingface.co/Systran/faster-whisper-base), [Wav2Vec2 Phoneme](https://huggingface.co/facebook/wav2vec2-xlsr-53-espeak-cv-ft) and [MFA Mandarin](https://mfa-models.readthedocs.io/en/latest/acoustic/Mandarin/index.html).

## 简体中文

这是言语康复中的发音练习工具，默认打开英文界面。练习语言包括英语、芬兰语、西班牙语和普通话。可以在顶部单独把界面切换到简体中文。先听示范，观察 CHIMERA 三维头像的发音动作，再用麦克风录下自己的发音。普通话的单音练习里可以进入声调训练。摄像头是可选项，只追踪外部可见的面部和嘴唇。

在线版默认在浏览器内运行 Whisper。若要启用 Praat、音素输出和普通话强制对齐，需要在详细分析中连接分析服务。识别出目标文字后，音素和声调仍按各自的证据显示结果。
