import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

const BLOCK = 1;
const WORLD_SIZE = 24;
const EYE_HEIGHT = 1.6;
const PLAYER_RADIUS = 0.35;
const MOVE_SPEED = 5;
const JUMP_SPEED = 8.4;
const GRAVITY = 32;
const AIR_DRAG = 0.98;
const TICKS_PER_SECOND = 20;
const REACH = 6;
const FALL_DEATH_Y = -100;
const MAX_DELTA = 1 / 30;
const _moveDir = new THREE.Vector3();
const _right = new THREE.Vector3();
const SPAWN = new THREE.Vector3(0, BLOCK + EYE_HEIGHT, 4);

const COLORS = {
  grass: 0x5a9e3a,
  dirt: 0x8b6914,
  stone: 0x888888,
};
const STACK_MAX = 64;
const HOTBAR_SIZE = 9;
const BACKPACK_SIZE = 27;
const INVENTORY_SIZE = HOTBAR_SIZE + BACKPACK_SIZE;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6eb5ff);
scene.fog = new THREE.Fog(0x6eb5ff, 30, 80);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  200
);
camera.position.copy(SPAWN);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const ambient = new THREE.AmbientLight(0xffffff, 0.55);
const sun = new THREE.DirectionalLight(0xffffff, 0.85);
sun.position.set(12, 20, 8);
scene.add(ambient, sun);

const blockGeo = new THREE.BoxGeometry(BLOCK, BLOCK, BLOCK);
const materials = {
  grass: new THREE.MeshLambertMaterial({ color: COLORS.grass }),
  dirt: new THREE.MeshLambertMaterial({ color: COLORS.dirt }),
  stone: new THREE.MeshLambertMaterial({ color: COLORS.stone }),
};

const blocks = new Map();
const solids = [];
const blockMeshes = [];

function blockKey(x, y, z) {
  return `${x},${y},${z}`;
}

function addBlock(x, y, z, type = 'grass') {
  const key = blockKey(x, y, z);
  if (blocks.has(key)) return;

  const mesh = new THREE.Mesh(blockGeo, materials[type]);
  mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
  mesh.userData = { key, x, y, z, type };
  scene.add(mesh);

  blocks.set(key, { mesh, type });
  blockMeshes.push(mesh);
  solids.push({
    minX: x,
    maxX: x + BLOCK,
    minY: y,
    maxY: y + BLOCK,
    minZ: z,
    maxZ: z + BLOCK,
    key,
  });
}

function removeBlock(key) {
  const entry = blocks.get(key);
  if (!entry) return null;

  const { type, mesh } = entry;
  scene.remove(mesh);
  blocks.delete(key);

  const meshIdx = blockMeshes.indexOf(mesh);
  if (meshIdx !== -1) blockMeshes.splice(meshIdx, 1);

  const solidIdx = solids.findIndex((s) => s.key === key);
  if (solidIdx !== -1) solids.splice(solidIdx, 1);
  return type;
}

function buildWorld() {
  const half = WORLD_SIZE / 2;
  for (let x = -half; x < half; x++) {
    for (let z = -half; z < half; z++) {
      addBlock(x, 0, z, 'grass');
    }
  }

  // Level 2: a few blocks in front of the player to jump on
  const platforms = [
    [0, 1, -2, 'dirt'],
    [1, 1, -3, 'dirt'],
    [2, 2, -4, 'stone'],
    [-1, 1, -3, 'dirt'],
    [0, 2, -5, 'stone'],
  ];
  for (const [x, y, z, type] of platforms) {
    addBlock(x, y, z, type);
  }
}

buildWorld();

const controls = new PointerLockControls(camera, document.body);
const hint = document.getElementById('hint');
const crosshair = document.getElementById('crosshair');
const restartBtn = document.getElementById('restart');
const hotbarEl = document.getElementById('hotbar');
const inventoryPanel = document.getElementById('inventory-panel');
const inventoryGridEl = document.getElementById('inventory-grid');
const inventoryHotbarEl = document.getElementById('inventory-hotbar');
const raycaster = new THREE.Raycaster();

const slots = Array.from({ length: INVENTORY_SIZE }, () => ({ type: null, count: 0 }));
let selectedSlot = 0;
let inventoryOpen = false;

function swapSlots(a, b) {
  const temp = { ...slots[a] };
  slots[a] = { ...slots[b] };
  slots[b] = temp;
  renderInventoryUI();
}

function addToInventory(type) {
  for (let i = 0; i < INVENTORY_SIZE; i++) {
    const slot = slots[i];
    if (slot.type === type && slot.count < STACK_MAX) {
      slot.count++;
      renderInventoryUI();
      return;
    }
  }
  for (let i = 0; i < INVENTORY_SIZE; i++) {
    const slot = slots[i];
    if (!slot.type) {
      slot.type = type;
      slot.count = 1;
      renderInventoryUI();
      return;
    }
  }
}

function createSlotEl(index, showKey) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'inv-slot';
  el.dataset.index = String(index);
  if (index === selectedSlot && index < HOTBAR_SIZE) el.classList.add('selected');
  if (showKey && index < HOTBAR_SIZE) el.title = `Slot ${index + 1}`;

  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (inventoryOpen && index >= HOTBAR_SIZE) {
      swapSlots(selectedSlot, index);
    } else if (index < HOTBAR_SIZE) {
      selectedSlot = index;
      renderInventoryUI();
    }
  });

  return el;
}

function fillSlotEl(el, slot) {
  el.replaceChildren();
  if (!slot.type) return;

  const icon = document.createElement('div');
  icon.className = 'block-icon';
  icon.style.background = `#${COLORS[slot.type].toString(16).padStart(6, '0')}`;

  const count = document.createElement('span');
  count.className = 'count';
  count.textContent = slot.count > 1 ? String(slot.count) : '';

  el.append(icon, count);
}

function renderInventoryUI() {
  hotbarEl.replaceChildren();
  for (let i = 0; i < HOTBAR_SIZE; i++) {
    const el = createSlotEl(i, true);
    fillSlotEl(el, slots[i]);
    hotbarEl.appendChild(el);
  }

  inventoryGridEl.replaceChildren();
  for (let i = HOTBAR_SIZE; i < INVENTORY_SIZE; i++) {
    const el = createSlotEl(i, false);
    fillSlotEl(el, slots[i]);
    inventoryGridEl.appendChild(el);
  }

  inventoryHotbarEl.replaceChildren();
  for (let i = 0; i < HOTBAR_SIZE; i++) {
    const el = createSlotEl(i, true);
    fillSlotEl(el, slots[i]);
    inventoryHotbarEl.appendChild(el);
  }
}

function toggleInventory() {
  inventoryOpen = !inventoryOpen;
  inventoryPanel.classList.toggle('open', inventoryOpen);
  hotbarEl.style.visibility = inventoryOpen ? 'hidden' : 'visible';
  if (inventoryOpen) {
    controls.unlock();
    crosshair.classList.remove('active');
  } else if (controls.isLocked) {
    crosshair.classList.add('active');
  }
  renderInventoryUI();
}

renderInventoryUI();

function restartPlayer() {
  camera.position.copy(SPAWN);
  camera.rotation.set(0, 0, 0);
  verticalVelocity = 0;
  keys.w = false;
  keys.a = false;
  keys.s = false;
  keys.d = false;
}

restartBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  restartPlayer();
});

renderer.domElement.addEventListener('click', () => {
  if (!controls.isLocked) controls.lock();
});

document.addEventListener('mousedown', (e) => {
  if (inventoryOpen || !controls.isLocked) return;
  if (e.button === 0) breakTargetedBlock();
  if (e.button === 2) placeTargetedBlock();
});

renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

controls.addEventListener('lock', () => {
  hint.style.display = 'none';
  crosshair.classList.add('active');
});

controls.addEventListener('unlock', () => {
  hint.style.display = 'block';
  crosshair.classList.remove('active');
});

const keys = { w: false, a: false, s: false, d: false };
let verticalVelocity = 0;
const clock = new THREE.Clock();

function feetY() {
  return camera.position.y - EYE_HEIGHT;
}

function overlapsXZ(x, z, solid) {
  return (
    x + PLAYER_RADIUS > solid.minX &&
    x - PLAYER_RADIUS < solid.maxX &&
    z + PLAYER_RADIUS > solid.minZ &&
    z - PLAYER_RADIUS < solid.maxZ
  );
}

function onGround() {
  const feet = feetY();
  for (const solid of solids) {
    if (
      Math.abs(feet - solid.maxY) < 0.05 &&
      overlapsXZ(camera.position.x, camera.position.z, solid)
    ) {
      return true;
    }
  }
  return false;
}

function resolveVertical(prev) {
  const feet = feetY();
  const prevFeet = prev.y - EYE_HEIGHT;

  for (const solid of solids) {
    if (
      verticalVelocity <= 0 &&
      prevFeet >= solid.maxY - 0.05 &&
      feet <= solid.maxY + 0.05 &&
      overlapsXZ(camera.position.x, camera.position.z, solid)
    ) {
      camera.position.y = solid.maxY + EYE_HEIGHT;
      verticalVelocity = 0;
    }
  }
}

function resolveHorizontal() {
  const px = camera.position.x;
  const pz = camera.position.z;
  const feet = feetY();
  const headY = camera.position.y;

  for (const solid of solids) {
    const pMinX = px - PLAYER_RADIUS;
    const pMaxX = px + PLAYER_RADIUS;
    const pMinZ = pz - PLAYER_RADIUS;
    const pMaxZ = pz + PLAYER_RADIUS;

    const overlapY = Math.min(headY - solid.minY, solid.maxY - feet);
    if (overlapY <= 0) continue;

    // Standing on top of a block — no sideways push from its sides
    if (Math.abs(feet - solid.maxY) < 0.05) continue;

    const overlapX = Math.min(pMaxX - solid.minX, solid.maxX - pMinX);
    const overlapZ = Math.min(pMaxZ - solid.minZ, solid.maxZ - pMinZ);
    if (overlapX <= 0 || overlapZ <= 0) continue;

    if (overlapX < overlapZ) {
      const solidCenterX = (solid.minX + solid.maxX) / 2;
      camera.position.x =
        px > solidCenterX ? solid.maxX + PLAYER_RADIUS : solid.minX - PLAYER_RADIUS;
    } else {
      const solidCenterZ = (solid.minZ + solid.maxZ) / 2;
      camera.position.z =
        pz > solidCenterZ ? solid.maxZ + PLAYER_RADIUS : solid.minZ - PLAYER_RADIUS;
    }
  }
}

function applyMovement(delta) {
  if (!controls.isLocked || inventoryOpen) return;

  camera.getWorldDirection(_moveDir);
  _moveDir.y = 0;
  if (_moveDir.lengthSq() < 1e-8) return;
  _moveDir.normalize();

  _right.crossVectors(_moveDir, camera.up).normalize();
  const step = MOVE_SPEED * delta;

  if (keys.w) camera.position.addScaledVector(_moveDir, step);
  if (keys.s) camera.position.addScaledVector(_moveDir, -step);
  if (keys.d) camera.position.addScaledVector(_right, step);
  if (keys.a) camera.position.addScaledVector(_right, -step);
}

function raycastBlock() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  raycaster.far = REACH;
  raycaster.firstHitOnly = true;
  return raycaster.intersectObjects(blockMeshes, false);
}

function blockOverlapsPlayer(x, y, z) {
  const minX = x;
  const maxX = x + BLOCK;
  const minY = y;
  const maxY = y + BLOCK;
  const minZ = z;
  const maxZ = z + BLOCK;
  const px = camera.position.x;
  const py = feetY();
  const pz = camera.position.z;
  const headY = camera.position.y;

  return (
    px + PLAYER_RADIUS > minX &&
    px - PLAYER_RADIUS < maxX &&
    pz + PLAYER_RADIUS > minZ &&
    pz - PLAYER_RADIUS < maxZ &&
    headY > minY &&
    py < maxY
  );
}

function breakTargetedBlock() {
  const hits = raycastBlock();
  if (hits.length === 0) return;

  const { key } = hits[0].object.userData;
  const removed = removeBlock(key);
  if (removed) addToInventory(removed);
}

function placeTargetedBlock() {
  const slot = slots[selectedSlot];
  if (!slot.type || slot.count <= 0) return;

  const hits = raycastBlock();
  if (hits.length === 0) return;

  const hit = hits[0];
  const n = hit.face.normal;
  const { x, y, z } = hit.object.userData;
  const bx = x + Math.round(n.x);
  const by = y + Math.round(n.y);
  const bz = z + Math.round(n.z);

  if (blocks.has(blockKey(bx, by, bz))) return;
  if (blockOverlapsPlayer(bx, by, bz)) return;

  addBlock(bx, by, bz, slot.type);
  slot.count--;
  if (slot.count <= 0) {
    slot.type = null;
    slot.count = 0;
  }
  renderInventoryUI();
}

document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyE') {
    toggleInventory();
    e.preventDefault();
    return;
  }
  if (inventoryOpen) return;

  if (e.code === 'KeyW') keys.w = true;
  if (e.code === 'KeyA') keys.a = true;
  if (e.code === 'KeyS') keys.s = true;
  if (e.code === 'KeyD') keys.d = true;
  if (e.code === 'Space' && controls.isLocked && onGround()) {
    verticalVelocity = JUMP_SPEED;
    e.preventDefault();
  }
  const digit = e.code.match(/^Digit([1-9])$/);
  if (digit && controls.isLocked) {
    selectedSlot = Number(digit[1]) - 1;
    renderInventoryUI();
  }
});

document.addEventListener('wheel', (e) => {
  if (inventoryOpen || !controls.isLocked) return;
  selectedSlot = (selectedSlot + (e.deltaY > 0 ? 1 : -1) + HOTBAR_SIZE) % HOTBAR_SIZE;
  renderInventoryUI();
  e.preventDefault();
}, { passive: false });

document.addEventListener('keyup', (e) => {
  if (e.code === 'KeyW') keys.w = false;
  if (e.code === 'KeyA') keys.a = false;
  if (e.code === 'KeyS') keys.s = false;
  if (e.code === 'KeyD') keys.d = false;
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  const delta = Math.min(clock.getDelta(), MAX_DELTA);
  const prev = camera.position.clone();

  applyMovement(delta);
  resolveHorizontal();

  verticalVelocity -= GRAVITY * delta;
  if (!onGround()) {
    verticalVelocity *= Math.pow(AIR_DRAG, delta * TICKS_PER_SECOND);
  }
  camera.position.y += verticalVelocity * delta;
  resolveVertical(prev);

  if (feetY() < FALL_DEATH_Y) restartPlayer();

  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);
