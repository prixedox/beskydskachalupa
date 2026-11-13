import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildHouse } from './build-house.js';
import { blockingFootprints, moveWithCollision } from './geometry.js';

const EYE = 1.6;
const WALK_SPEED = 1.4;
const RADIUS_MM = 250;
// Azimuth is measured from +z (the bottom of the plan) towards +x; plan top is taken as north.
const SUN = { elevation: 38, azimuth: -40 };

const MODES = [
  { id: 'dollhouse', label: 'Shora' },
  { id: 'exterior', label: 'Zvenku' },
  { id: 'walk', label: 'Procházet' },
];

const WALK_HINT = 'Táhněte pro rozhlížení · W A S D / šipky pro chůzi · klikněte na podlahu pro přesun · kroužek otevře 360° fotku';

export function start3d({ container, model, tour, baseUrl, houseId, startRoom }) {
  container.textContent = '';
  container.classList.add('model3d');

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  container.append(renderer.domElement);

  const labels = new CSS2DRenderer();
  labels.domElement.className = 'model3d-labels';
  container.append(labels.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 400);
  camera.rotation.order = 'YXZ';

  // Sky and sun; soft fill light from a neutral studio environment.
  const sunDir = new THREE.Vector3().setFromSphericalCoords(
    1, THREE.MathUtils.degToRad(90 - SUN.elevation), THREE.MathUtils.degToRad(SUN.azimuth),
  );
  const sky = new Sky();
  sky.scale.setScalar(300);
  sky.material.uniforms.turbidity.value = 3;
  sky.material.uniforms.rayleigh.value = 1.2;
  sky.material.uniforms.mieCoefficient.value = 0.004;
  sky.material.uniforms.mieDirectionalG.value = 0.8;
  sky.material.uniforms.sunPosition.value.copy(sunDir);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.3;
  scene.add(sky);
  scene.fog = new THREE.Fog('#cfdbe6', 60, 220);

  const house = buildHouse(model, tour, baseUrl, { maxAnisotropy: renderer.capabilities.getMaxAnisotropy() });
  Object.values(house.groups).forEach((g) => scene.add(g));
  const cx = (house.bounds.min[0] + house.bounds.max[0]) / 2;
  const cz = (house.bounds.min[1] + house.bounds.max[1]) / 2;
  const centre = new THREE.Vector3(cx, 0, cz);

  const sun = new THREE.DirectionalLight('#fff4e0', 4.5);
  sun.position.copy(centre).addScaledVector(sunDir, 40);
  sun.target.position.copy(centre);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 5, far: 90 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight('#e6eef7', '#8f7d5e', 0.3));

  // Warm ceiling light in every room, so interiors are not lit by the sky alone.
  for (const room of house.rooms) {
    const light = new THREE.PointLight('#ffe2bf', 6, 7, 1.6);
    light.position.set(room.centre[0], house.eyeRoomHeight - 0.25, room.centre[1]);
    scene.add(light);
  }

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), house.materials.grass);
  ground.geometry.attributes.uv.array.forEach((v, i, arr) => { arr[i] = v * 400; });
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(cx, model.ground / 1000, cz);
  ground.receiveShadow = true;
  scene.add(ground);

  const go360 = (roomId) => {
    const url = new URL(location.href);
    url.searchParams.delete('view');
    url.searchParams.set('house', houseId);
    url.searchParams.set('room', roomId);
    location.href = url.toString();
  };

  // Room labels (overview modes) and floor rings at the 360° photo spots (walk mode).
  const labelObjects = [];
  const rings = [];
  const ringMaterial = new THREE.MeshBasicMaterial({ color: '#c8a36a', transparent: true, opacity: 0.9 });
  for (const room of house.rooms) {
    const el = document.createElement(room.hasPano ? 'button' : 'span');
    el.className = 'model3d-label';
    el.textContent = room.name;
    if (room.hasPano) {
      el.title = 'Otevřít 360° fotku';
      el.dataset.room = room.id;
      el.addEventListener('click', () => go360(room.id));
      const badge = document.createElement('small');
      badge.textContent = '360°';
      el.append(badge);
    }
    const label = new CSS2DObject(el);
    const at = room.panoPos ?? room.centre;
    label.position.set(at[0], 1.2, at[1]);
    scene.add(label);
    labelObjects.push(label);

    if (room.panoPos) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.3, 48), ringMaterial);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(room.panoPos[0], 0.01, room.panoPos[1]);
      ring.userData.roomId = room.id;
      scene.add(ring);
      rings.push(ring);
    }
  }

  // UI
  const toolbar = document.createElement('div');
  toolbar.className = 'model3d-toolbar';
  for (const m of MODES) {
    const btn = document.createElement('button');
    btn.textContent = m.label;
    btn.dataset.mode = m.id;
    btn.addEventListener('click', () => setMode(m.id));
    toolbar.append(btn);
  }
  const back = document.createElement('button');
  back.textContent = '360° fotky';
  back.dataset.action = 'tour';
  back.addEventListener('click', () => go360(walk.nearestRoom() ?? startRoom));
  toolbar.append(back);
  const hint = document.createElement('div');
  hint.className = 'model3d-hint';
  hint.textContent = WALK_HINT;
  container.append(toolbar, hint);

  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.maxPolarAngle = THREE.MathUtils.degToRad(86);
  orbit.minDistance = 3;
  orbit.maxDistance = 60;

  const walk = createWalk({
    camera, dom: renderer.domElement, house, rings,
    floor: house.groups.floor, onRing: go360,
  });

  let mode = null;
  function setMode(next) {
    mode = next;
    toolbar.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('is-active', b.dataset.mode === next));
    const walking = next === 'walk';
    house.groups.roof.visible = next !== 'dollhouse';
    house.groups.ceiling.visible = walking;
    labelObjects.forEach((l) => { l.visible = !walking && next === 'dollhouse'; });
    rings.forEach((r) => { r.visible = walking; });
    hint.hidden = !walking;
    orbit.enabled = !walking;
    walk.enabled = walking;
    // Indoors the sun barely reaches, so lift the soft fill light there.
    scene.environmentIntensity = walking ? 0.6 : 0.3;
    if (walking) {
      const room = house.rooms.find((r) => r.id === startRoom && r.panoPos);
      // Stand on the room's 360° spot and look towards the middle of the room, or of the
      // house when the spot already is the middle of the room.
      const at = room?.panoPos ?? [cx, cz];
      const roomCentreAhead = room && Math.hypot(room.centre[0] - at[0], room.centre[1] - at[1]) > 1;
      walk.enter(at, roomCentreAhead ? room.centre : [cx, cz - 1]);
    } else {
      camera.up.set(0, 1, 0);
      orbit.target.set(cx, next === 'dollhouse' ? 0 : 1.5, cz);
      if (next === 'dollhouse') camera.position.set(cx + 4, 17, cz + 12);
      else camera.position.set(cx - 13, 5, cz - 19); // front, entrance side
      orbit.update();
    }
  }

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = container;
    renderer.setSize(w, h);
    labels.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  setMode('dollhouse');

  const timer = new THREE.Timer();
  renderer.setAnimationLoop(() => {
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.1);
    if (mode === 'walk') walk.update(dt);
    else orbit.update();
    renderer.render(scene, camera);
    labels.render(scene, camera);
  });

  return {
    setMode,
    get mode() { return mode; },
    camera,
    destroy() {
      renderer.setAnimationLoop(null);
      observer.disconnect();
      walk.dispose();
      orbit.dispose();
      renderer.dispose();
      container.textContent = '';
    },
  };
}

function createWalk({ camera, dom, house, rings, floor, onRing }) {
  const footprints = blockingFootprints(house.solids);
  const keys = new Set();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let yaw = 0;
  let pitch = 0;
  let pos = [0, 0];
  let target = null;
  let drag = null;

  const state = { enabled: false };

  const apply = () => {
    camera.position.set(pos[0], EYE, pos[1]);
    camera.rotation.set(pitch, yaw, 0);
  };

  const step = (dx, dz) => {
    const next = moveWithCollision([pos[0] * 1000, pos[1] * 1000], [dx * 1000, dz * 1000], RADIUS_MM, footprints);
    const moved = Math.hypot(next[0] / 1000 - pos[0], next[1] / 1000 - pos[1]);
    pos = [next[0] / 1000, next[1] / 1000];
    return moved;
  };

  const hitTest = (e, objects) => {
    const rect = dom.getBoundingClientRect();
    pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(objects, true)[0];
  };

  const onDown = (e) => {
    if (!state.enabled) return;
    drag = { x: e.clientX, y: e.clientY, moved: 0 };
    dom.setPointerCapture(e.pointerId);
  };
  const onMove = (e) => {
    if (!state.enabled) return;
    if (!drag) {
      dom.style.cursor = hitTest(e, rings) ? 'pointer' : '';
      return;
    }
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    drag.x = e.clientX;
    drag.y = e.clientY;
    yaw += dx * 0.004;
    pitch = Math.max(-1.3, Math.min(1.3, pitch + dy * 0.004));
  };
  const onUp = (e) => {
    if (!state.enabled || !drag) return;
    const click = drag.moved < 6;
    drag = null;
    if (!click) return;
    const ring = hitTest(e, rings);
    if (ring) {
      onRing(ring.object.userData.roomId);
      return;
    }
    const hit = hitTest(e, [floor, ...rings]);
    if (hit) target = [hit.point.x, hit.point.z];
  };
  const onKey = (e) => {
    if (!state.enabled) return;
    const k = e.key.toLowerCase();
    if (!['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) return;
    e.preventDefault();
    if (e.type === 'keydown') keys.add(k);
    else keys.delete(k);
    target = null;
  };
  const onBlur = () => keys.clear();

  dom.addEventListener('pointerdown', onDown);
  dom.addEventListener('pointermove', onMove);
  dom.addEventListener('pointerup', onUp);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  window.addEventListener('blur', onBlur);

  return Object.assign(state, {
    enter(at, lookAt) {
      pos = [...at];
      yaw = Math.atan2(-(lookAt[0] - pos[0]), -(lookAt[1] - pos[1]));
      pitch = -0.05;
      target = null;
      apply();
    },
    update(dt) {
      const speed = WALK_SPEED * (keys.has('shift') ? 2 : 1) * dt;
      const fwd = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
      const side = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
      const turn = (keys.has('arrowleft') ? 1 : 0) - (keys.has('arrowright') ? 1 : 0);
      yaw += turn * 1.6 * dt;
      // Camera looks down -z at yaw 0.
      const sin = Math.sin(yaw);
      const cos = Math.cos(yaw);
      if (fwd || side) step((-sin * fwd + cos * side) * speed, (-cos * fwd - sin * side) * speed);
      if (target) {
        const dx = target[0] - pos[0];
        const dz = target[1] - pos[1];
        const dist = Math.hypot(dx, dz);
        if (dist < 0.05) target = null;
        else {
          const s = Math.min(dist, speed * 1.5);
          if (step((dx / dist) * s, (dz / dist) * s) < s * 0.2) target = null;
        }
      }
      apply();
    },
    nearestRoom() {
      if (!state.enabled) return null;
      let best = null;
      for (const r of house.rooms) {
        if (!r.panoPos) continue;
        const d = Math.hypot(r.panoPos[0] - pos[0], r.panoPos[1] - pos[1]);
        if (!best || d < best.d) best = { id: r.id, d };
      }
      return best?.id ?? null;
    },
    dispose() {
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onBlur);
    },
  });
}
