import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {initChimera} from './chimera/wasm/chimera.ts';

export async function createAvatar(container) {
  await initChimera();
  const [{Anatomy3D, REST_ARTIC}, {VoiceModel}] = await Promise.all([
    import('./chimera/ui/render/anatomy3d.ts'), import('./chimera/ui/analysis.ts')
  ]);
  const head = new Anatomy3D();
  const model = new VoiceModel({female:0, child:0}, 48000);
  const gl = new THREE.WebGLRenderer({antialias:true, alpha:false, powerPreference:'low-power'});
  gl.outputColorSpace = THREE.LinearSRGBColorSpace;
  gl.setClearColor(0x062521, 1);
  head.scene.fog.color.set(0x062521);
  head.centred = true;
  head.drawing = {...head.drawing, shell:0.83, inner:1.12};
  container.replaceChildren(gl.domElement);
  gl.domElement.setAttribute('aria-hidden','true');
  const controls = new OrbitControls(head.camera, gl.domElement);
  controls.enablePan = false;
  controls.minDistance = 20;
  controls.maxDistance = 150;
  const view = {pressure:false, particles:false, grid:false, calipers:true};
  const focusMarker = new THREE.Mesh(new THREE.SphereGeometry(0.23, 14, 10), new THREE.MeshBasicMaterial({color:0xffcc79, depthTest:false}));
  focusMarker.visible = false;
  focusMarker.renderOrder = 10;
  head.headGroup.add(focusMarker);
  let animation;
  let currentAudio;
  let last = 0;
  let handle;
  let activeGesture = false;

  const reset = () => {
    const pose = head.poses(model);
    controls.target.copy(pose.target);
    head.camera.position.copy(pose.home);
    controls.update();
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
    const dt = Math.min((now - last) / 1000, .06);
    last = now;
    let artic = REST_ARTIC;
    if (animation && currentAudio) {
      const position = Math.min(1, currentAudio.currentTime / animation.duration) * (animation.frames.length - 1);
      const index = Math.floor(position);
      const a = animation.frames[index];
      const b = animation.frames[Math.min(index + 1, animation.frames.length - 1)];
      artic = {...REST_ARTIC};
      for (const [i, key] of animation.keys.entries()) artic[key] = a[i] + (b[i] - a[i]) * (position - index);
    }
    head.update(model, model.frame(artic), artic, null, view, dt);
    focusMarker.visible = Boolean(activeGesture && currentAudio && !currentAudio.paused && head.caliper);
    if (focusMarker.visible) focusMarker.position.set(head.caliper.x, head.caliper.y, head.caliper.z);
    gl.render(head.scene, head.camera);
  };
  handle = requestAnimationFrame(frame);
  return {
    reset,
    demonstrate(track, audio, focus) { animation = track; currentAudio = audio; activeGesture = focus; head.resetMotion(); },
    clear() { animation = null; currentAudio = null; },
    dispose() { cancelAnimationFrame(handle);observer.disconnect();controls.dispose();gl.dispose();model.dispose(); }
  };
}
