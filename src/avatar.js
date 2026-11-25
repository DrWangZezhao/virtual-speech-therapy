import {mouthAtTime} from './mouth-timeline.js';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {initChimera} from './chimera/wasm/chimera.ts';
import {V} from './chimera/ui/colors.ts';

const palette = {
  [V.blue]: '#a5a8ba',
  [V.blueMid]: '#656a80',
  [V.blueDim]: '#4a4d61',
  [V.frame]: '#2a2b39',
  [V.green]: '#97adba',
  [V.red]: '#9f8194',
  [V.pink]: '#f2a2b7',
};

export async function createAvatar(container) {
  await initChimera();
  const [{Anatomy3D, REST_ARTIC}, {VoiceModel}] = await Promise.all([
    import('./chimera/ui/render/anatomy3d.ts'), import('./chimera/ui/analysis.ts')
  ]);
  const {planUtterance} = await import('./chimera/wasm/engine.ts');
  const head = new Anatomy3D(palette, true);
  const model = new VoiceModel({female:0, child:0}, 48000);
  const gl = new THREE.WebGLRenderer({antialias:true, alpha:false, powerPreference:'low-power'});
  gl.outputColorSpace = THREE.LinearSRGBColorSpace;
  gl.setClearColor(0x000000, 1);
  head.centred = true;
  head.drawing = {...head.drawing, shell:0.9, inner:0.52, bone:0.68, features:1.13, lipSkin:false,
    fade:{y:-3.25,band:6}};
  container.replaceChildren(gl.domElement);
  gl.domElement.setAttribute('aria-hidden','true');
  const controls = new OrbitControls(head.camera, gl.domElement);
  controls.enablePan = false;
  controls.minDistance = 20;
  controls.maxDistance = 150;
  const view = {pressure:false, particles:false, grid:false, calipers:false};
  const up = new THREE.Vector3(0,1,0);
  let animation;
  let currentAudio;
  let last = 0;
  let handle;
  let redraw = true;
  let wasPlaying = false;
  let liveMouth;
  let speaking = false;
  let heldPose;
  const invalidate=()=>{redraw=true;};
  controls.addEventListener('change',()=>{redraw=true;});

  const reset = () => {
    const pose = head.poses(model);
    controls.target.copy(pose.target);
    head.camera.position.copy(pose.home).sub(pose.target).applyAxisAngle(up,.25).multiplyScalar(.96).add(pose.target);
    controls.update();
    redraw = true;
  };
  const resize = () => {
    const {width, height} = container.getBoundingClientRect();
    if (width === 0 || height === 0) return;
    gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
    gl.setSize(width, height, false);
    head.resize(width,height);
    reset();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  const frame = now => {
    handle = requestAnimationFrame(frame);
    if (document.hidden || now - last < 26) return;
    const playing = Boolean(animation && currentAudio && !currentAudio.paused && !currentAudio.ended);
    if (!redraw && !playing && !wasPlaying && !speaking) return;
    redraw = false;
    wasPlaying = playing;
    const dt = Math.min((now - last) / 1000, .06);
    last = now;
    let artic = REST_ARTIC;
    let tongueSide;
    if (heldPose) {
      artic=heldPose;
    } else if (animation && currentAudio) {
      const position = Math.min(1, currentAudio.currentTime / animation.duration) * (animation.frames.length - 1);
      const index = Math.floor(position);
      const a = animation.frames[index];
      const b = animation.frames[Math.min(index + 1, animation.frames.length - 1)];
      artic = {...REST_ARTIC};
      for (const [i, key] of animation.keys.entries()) artic[key] = a[i] + (b[i] - a[i]) * (position - index);
      Object.assign(artic,mouthAtTime(animation.mouthCues,currentAudio.currentTime));
    } else if (speaking) {
      const opening = Math.max(0,Math.sin(now/91)+.45*Math.sin(now/53)) * .65;
      artic = {...REST_ARTIC,jaw:opening,lipAp:opening*.68,lipWidth:.50+.09*Math.sin(now/113)};
    } else if (liveMouth) {
      const {tongue,...mouth} = liveMouth;
      artic = {...REST_ARTIC,...mouth};
      if (tongue) {
        artic.ttX = 8.2+1.6*tongue.extension;
        artic.ttY = 7.75-.40*mouth.jaw-.7*tongue.extension;
        tongueSide = -tongue.side;
      }
    }
    head.update(model, model.frame(artic), artic, null, view, dt, tongueSide);
    gl.render(head.scene, head.camera);
  };
  handle = requestAnimationFrame(frame);
  return {
    reset,
    demonstrate(track, audio) {
      for(const event of ['seeked','timeupdate','pause','ended']) currentAudio?.removeEventListener(event,invalidate);
      animation=track; currentAudio=audio; heldPose=null;
      for(const event of ['seeked','timeupdate','pause','ended']) audio.addEventListener(event,invalidate);
      head.resetMotion(); redraw=true;
    },
    showSound(ipa) {
      const plan=planUtterance([{ipa,dur:.6}],{body:{female:0,child:0},t0:0,intonation:'flat'});
      if(!plan.segments.length)return false;
      const at=plan.segments[0].t0+(plan.segments[0].t1-plan.segments[0].t0)*.4;
      heldPose={...REST_ARTIC};
      for(const gesture of plan.gestures) if(gesture.t0<=at && gesture.t1>=at) {
        for(const key of Object.keys(REST_ARTIC)) if(gesture.targets[key]!==undefined)heldPose[key]=gesture.targets[key];
      }
      head.resetMotion(); redraw=true;
      return true;
    },
    setSpeaking(value) { speaking=value; redraw=true; },
    setLiveMouth(pose) { if (pose || liveMouth) redraw=true; liveMouth=pose; },
    clear() { heldPose=null; animation = null; currentAudio = null; redraw=true; },
    dispose() { cancelAnimationFrame(handle);observer.disconnect();controls.dispose();head.dispose();gl.dispose();model.dispose(); }
  };
}
