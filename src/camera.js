export async function createCamera(video, report) {
  const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:320}},audio:false});
  let tracker, running=true, handle=0;
  const stop=()=>{ running=false;cancelAnimationFrame(handle);tracker?.close();stream.getTracks().forEach(track=>track.stop());video.srcObject=null;video.hidden=true; };
  try {
    video.srcObject=stream;video.hidden=false;await video.play();
    const {FaceLandmarker,FilesetResolver}=await import('@mediapipe/tasks-vision');
    const files=await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm');
    tracker=await FaceLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'},runningMode:'VIDEO',numFaces:1});
  } catch(error) {stop();throw error;}
  let previous=0;
  const detect=timestamp=>{
    if(!running)return;
    if(timestamp-previous>150 && video.readyState>=2){
      previous=timestamp;
      try {const face=tracker.detectForVideo(video,timestamp).faceLandmarks[0];report(Boolean(face?.[13] && face?.[14]));}
      catch {report(false);}
    }
    handle=requestAnimationFrame(detect);
  };
  handle=requestAnimationFrame(detect);
  return stop;
}
