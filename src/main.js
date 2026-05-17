import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6eb5ff);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 1.6, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshBasicMaterial({ color: 0xffffff })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshBasicMaterial({ color: 0x333333 })
);
cube.position.set(0, 0.5, -5);
scene.add(cube);

const cubeBounds = new THREE.Box3().setFromObject(cube);
const solids = [
  {
    minX: cubeBounds.min.x,
    maxX: cubeBounds.max.x,
    minY: cubeBounds.min.y,
    maxY: cubeBounds.max.y,
    minZ: cubeBounds.min.z,
    maxZ: cubeBounds.max.z,
  },
];

const playerRadius = 0.35;
const controls = new PointerLockControls(camera, document.body);
const hint = document.getElementById('hint');

renderer.domElement.addEventListener('click', () => {
  controls.lock();
});

controls.addEventListener('lock', () => {
  hint.style.display = 'none';
});

controls.addEventListener('unlock', () => {
  hint.style.display = 'block';
});

const keys = { w: false, a: false, s: false, d: false };
const moveSpeed = 5;
const eyeHeight = 1.6;
const jumpSpeed = 6;
const gravity = 20;
let verticalVelocity = 0;
const clock = new THREE.Clock();

function feetY() {
  return camera.position.y - eyeHeight;
}

function overlapsXZ(x, z, solid) {
  return (
    x + playerRadius > solid.minX &&
    x - playerRadius < solid.maxX &&
    z + playerRadius > solid.minZ &&
    z - playerRadius < solid.maxZ
  );
}

function onGround() {
  const feet = feetY();
  if (feet <= 0.01) return true;
  for (const solid of solids) {
    if (Math.abs(feet - solid.maxY) < 0.05 && overlapsXZ(camera.position.x, camera.position.z, solid)) {
      return true;
    }
  }
  return false;
}

function resolveCollisions(prev) {
  let feet = feetY();
  const prevFeet = prev.y - eyeHeight;

  if (feet < 0) {
    camera.position.y = eyeHeight;
    verticalVelocity = 0;
    feet = 0;
  }

  for (const solid of solids) {
    const px = camera.position.x;
    const pz = camera.position.z;
    const headY = camera.position.y;

    if (
      verticalVelocity <= 0 &&
      prevFeet >= solid.maxY - 0.05 &&
      feet <= solid.maxY + 0.05 &&
      overlapsXZ(px, pz, solid)
    ) {
      camera.position.y = solid.maxY + eyeHeight;
      verticalVelocity = 0;
      continue;
    }

    const pMinX = px - playerRadius;
    const pMaxX = px + playerRadius;
    const pMinZ = pz - playerRadius;
    const pMaxZ = pz + playerRadius;

    const overlapX = Math.min(pMaxX - solid.minX, solid.maxX - pMinX);
    const overlapY = Math.min(headY - solid.minY, solid.maxY - feet);
    const overlapZ = Math.min(pMaxZ - solid.minZ, solid.maxZ - pMinZ);

    if (overlapX <= 0 || overlapY <= 0 || overlapZ <= 0) continue;

    if (overlapX < overlapZ) {
      const solidCenterX = (solid.minX + solid.maxX) / 2;
      camera.position.x =
        px > solidCenterX ? solid.maxX + playerRadius : solid.minX - playerRadius;
    } else {
      const solidCenterZ = (solid.minZ + solid.maxZ) / 2;
      camera.position.z =
        pz > solidCenterZ ? solid.maxZ + playerRadius : solid.minZ - playerRadius;
    }
  }
}

document.addEventListener('keydown', (e) => {
  const key = e.code;
  if (key === 'KeyW') keys.w = true;
  if (key === 'KeyA') keys.a = true;
  if (key === 'KeyS') keys.s = true;
  if (key === 'KeyD') keys.d = true;
  if (key === 'Space' && controls.isLocked && onGround()) {
    verticalVelocity = jumpSpeed;
    e.preventDefault();
  }
});

document.addEventListener('keyup', (e) => {
  const key = e.code;
  if (key === 'KeyW') keys.w = false;
  if (key === 'KeyA') keys.a = false;
  if (key === 'KeyS') keys.s = false;
  if (key === 'KeyD') keys.d = false;
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const prev = camera.position.clone();

  verticalVelocity -= gravity * delta;
  camera.position.y += verticalVelocity * delta;

  if (controls.isLocked) {
    if (keys.w) controls.moveForward(moveSpeed * delta);
    if (keys.s) controls.moveForward(-moveSpeed * delta);
    if (keys.a) controls.moveRight(-moveSpeed * delta);
    if (keys.d) controls.moveRight(moveSpeed * delta);
  }

  resolveCollisions(prev);

  renderer.render(scene, camera);
}

animate();
