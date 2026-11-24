import {findTongue, readMouth, TONGUE_CROP} from './mouth-tracking.js';

export async function createCamera(video, report, signal) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video:{facingMode:'user',width:{ideal:640},height:{ideal:480},frameRate:{ideal:24,max:30}}, audio:false,
  });
  let tracker, running=true, frameId=0;
  const useVideoFrames = typeof video.requestVideoFrameCallback === 'function';
  const cancelFrame = useVideoFrames ? video.cancelVideoFrameCallback.bind(video) : cancelAnimationFrame;
  const nextFrame = useVideoFrames ? video.requestVideoFrameCallback.bind(video) : requestAnimationFrame;
  const stop = () => {
    if (!running) return;
    running=false;
    signal?.removeEventListener('abort',stop);
    cancelFrame(frameId);
    tracker?.close();
    stream.getTracks().forEach(track=>track.stop());
    video.srcObject=null;
    video.hidden=true;
  };
  if (signal?.aborted) { stop(); throw signal.reason; }
  signal?.addEventListener('abort',stop,{once:true});
  try {
    video.srcObject=stream;
    video.hidden=false;
    await video.play();
    const {FaceLandmarker,FilesetResolver} = await import('@mediapipe/tasks-vision');
    const files = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm');
    tracker = await FaceLandmarker.createFromOptions(files,{
      baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'},
      runningMode:'VIDEO',numFaces:1,outputFaceBlendshapes:true,
      minFaceDetectionConfidence:.55,minFacePresenceConfidence:.55,minTrackingConfidence:.55,
    });
    if (!running) { tracker.close(); throw signal.reason; }
  } catch (error) { stop(); throw error; }

  const crop = document.createElement('canvas');
  crop.width=TONGUE_CROP.width;
  crop.height=TONGUE_CROP.height;
  const ctx = crop.getContext('2d',{willReadFrequently:true});
  let previous=0, lastVideoTime=-1, tongueFrames=0, filtered=null;

  function detect(timestamp) {
    if (!running) return;
    if (timestamp-previous>=40 && video.readyState>=2 && video.currentTime!==lastVideoTime) {
      previous=timestamp;
      lastVideoTime=video.currentTime;
      let mouth = null;
      try {
        mouth = readMouth(tracker.detectForVideo(video,timestamp),video.videoWidth,video.videoHeight);
      } catch { /* Skip frames the tracker cannot read. */ }
      if (mouth) {
        let tongue = null;
        try { tongue = findTongue(ctx,video,mouth.crop); }
        catch { /* Lip tracking still works if pixel readback fails. */ }
        tongueFrames = tongue ? tongueFrames+1 : 0;
        const {crop:_,...pose} = mouth;
        for (const key of Object.keys(pose)) {
          if (filtered) pose[key] = filtered[key]+.49*(pose[key]-filtered[key]);
        }
        filtered = pose;
        report({...pose,tongue:tongueFrames>=2 ? tongue : null});
      } else {
        tongueFrames=0;
        filtered=null;
        report(null);
      }
    }
    frameId=nextFrame(detect);
  }
  stream.getVideoTracks().forEach(track=>track.addEventListener('ended',()=>{stop();report(null,true);},{once:true}));
  frameId=nextFrame(detect);
  return stop;
}
