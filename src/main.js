import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { blockMaterials, blockIconUrls } from './textures.js';
import { initAudio, playStep, playJump, playBreak, playPlace } from './sounds.js';
import {
  hasSave,
  writeSave,
  readSave,
  SAVE_VERSION,
  nextDefaultWorldName,
} from './save.js';

const BLOCK = 1;
const WORLD_SIZE = 24;
const EYE_HEIGHT = 1.6;
const PLAYER_RADIUS = 0.35;
const MOVE_SPEED = 5;
const GROUND_ACCEL = 50;
const AIR_ACCEL = 12;
const GROUND_FRICTION = 14;
const JUMP_SPEED = 8.4;
const GRAVITY = 32;
const AIR_DRAG = 0.98;
const TICKS_PER_SECOND = 20;
const REACH = 6;
const FALL_DEATH_Y = -100;
const MAX_DELTA = 1 / 30;
const _moveDir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _inputDir = new THREE.Vector3();
const horizontalVelocity = new THREE.Vector3();
const SPAWN = new THREE.Vector3(0, BLOCK + EYE_HEIGHT, 4);

const BLOCK_NAMES = {
  grass: 'Grass',
  dirt: 'Dirt',
  stone: 'Stone',
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
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const ambient = new THREE.AmbientLight(0xffffff, 0.55);
const sun = new THREE.DirectionalLight(0xffffff, 0.85);
sun.position.set(12, 20, 8);
scene.add(ambient, sun);

const blockGeo = new THREE.BoxGeometry(BLOCK, BLOCK, BLOCK);

const blocks = new Map();
const solids = [];
const blockMeshes = [];

function blockKey(x, y, z) {
  return `${x},${y},${z}`;
}

function addBlock(x, y, z, type = 'grass') {
  const key = blockKey(x, y, z);
  if (blocks.has(key)) return;

  const mesh = new THREE.Mesh(blockGeo, blockMaterials[type]);
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

const controls = new PointerLockControls(camera, renderer.domElement);
const hint = document.getElementById('hint');
const crosshair = document.getElementById('crosshair');
const restartBtn = document.getElementById('restart');
const hotbarEl = document.getElementById('hotbar');
const inventoryPanel = document.getElementById('inventory-panel');
const inventoryGridEl = document.getElementById('inventory-grid');
const inventoryHotbarEl = document.getElementById('inventory-hotbar');
const itemTooltip = document.getElementById('item-tooltip');
const menuOverlay = document.getElementById('menu-overlay');
const menuTitle = document.getElementById('menu-title');
const pauseMenu = document.getElementById('pause-menu');
const controlsMenu = document.getElementById('controls-menu');
const settingsMenu = document.getElementById('settings-menu');
const mainMenuOverlay = document.getElementById('main-menu-overlay');
const menuLogo = document.getElementById('menu-logo');
const mainMenuButtons = document.getElementById('main-menu-buttons');
const mainNewGameScreen = document.getElementById('main-new-game-screen');
const worldNameInput = document.getElementById('world-name-input');
const mainSettingsScreen = document.getElementById('main-settings-screen');
const playCatcher = document.getElementById('play-catcher');
const raycaster = new THREE.Raycaster();

function blockDisplayName(type) {
  return BLOCK_NAMES[type] ?? type;
}

function showItemTooltip(type, clientX, clientY) {
  itemTooltip.textContent = blockDisplayName(type);
  itemTooltip.style.left = `${clientX}px`;
  itemTooltip.style.top = `${clientY}px`;
  itemTooltip.style.display = 'block';
}

function hideItemTooltip() {
  itemTooltip.style.display = 'none';
}

function bindSlotTooltip(el, index) {
  el.addEventListener('mouseenter', (e) => {
    const { type } = slots[index];
    if (type) showItemTooltip(type, e.clientX, e.clientY);
  });
  el.addEventListener('mousemove', (e) => {
    const { type } = slots[index];
    if (type) showItemTooltip(type, e.clientX, e.clientY);
  });
  el.addEventListener('mouseleave', hideItemTooltip);
}

const slots = Array.from({ length: INVENTORY_SIZE }, () => ({ type: null, count: 0 }));
let selectedSlot = 0;
let inventoryOpen = false;
let menuScreen = null;
let onMainMenu = false;
let currentWorldName = '';

function isMenuOpen() {
  return menuScreen !== null;
}

function isOnMainMenu() {
  return onMainMenu;
}

function isGamePaused() {
  return isMenuOpen() || inventoryOpen || onMainMenu;
}

function updateHudVisibility() {
  const hideHotbar = inventoryOpen || isMenuOpen() || onMainMenu;
  hotbarEl.style.visibility = hideHotbar ? 'hidden' : 'visible';
  restartBtn.style.display = isMenuOpen() || onMainMenu ? 'none' : 'block';
}

function showMenuScreen(screen) {
  menuScreen = screen;
  pauseMenu.classList.toggle('active', screen === 'pause');
  controlsMenu.classList.toggle('active', screen === 'controls');
  settingsMenu.classList.toggle('active', screen === 'settings');
  menuTitle.style.display = screen === 'pause' ? 'block' : 'none';
}

function showMainMenuScreen(screen) {
  mainMenuButtons.classList.toggle('active', screen === 'buttons');
  mainNewGameScreen.classList.toggle('active', screen === 'new-game');
  mainSettingsScreen.classList.toggle('active', screen === 'settings');
  menuLogo.style.display = screen === 'buttons' ? 'block' : 'none';
}

function openNewGameScreen() {
  worldNameInput.value = '';
  showMainMenuScreen('new-game');
  worldNameInput.focus();
}

function resolveWorldName(input) {
  const trimmed = input.trim();
  return trimmed || nextDefaultWorldName();
}

function updateLoadGameButton() {
  const loadBtn = mainMenuButtons.querySelector('[data-main="load-game"]');
  if (!loadBtn) return;
  const data = readSave();
  const saved = Boolean(data);
  loadBtn.disabled = !saved;
  loadBtn.style.opacity = saved ? '1' : '0.55';
  loadBtn.style.cursor = saved ? 'pointer' : 'not-allowed';
  loadBtn.textContent = data?.worldName ? `Load Game: ${data.worldName}` : 'Load Game';
}

function collectSaveState() {
  const blockList = [];
  for (const [key, entry] of blocks) {
    const [x, y, z] = key.split(',').map(Number);
    blockList.push({ x, y, z, type: entry.type });
  }
  return {
    version: SAVE_VERSION,
    worldName: currentWorldName,
    player: {
      position: camera.position.toArray(),
      rotation: [camera.rotation.x, camera.rotation.y, camera.rotation.z],
    },
    velocity: {
      vertical: verticalVelocity,
      horizontal: [horizontalVelocity.x, horizontalVelocity.z],
    },
    blocks: blockList,
    inventory: slots.map((s) => ({ type: s.type, count: s.count })),
    selectedSlot,
  };
}

function applySaveState(data) {
  if (!data || data.version !== SAVE_VERSION || !Array.isArray(data.blocks)) {
    return false;
  }

  clearWorld();
  for (const block of data.blocks) {
    if (!blockMaterials[block.type]) continue;
    addBlock(block.x, block.y, block.z, block.type);
  }

  camera.position.fromArray(data.player.position);
  camera.rotation.set(
    data.player.rotation[0],
    data.player.rotation[1],
    data.player.rotation[2]
  );
  verticalVelocity = data.velocity?.vertical ?? 0;
  horizontalVelocity.set(
    data.velocity?.horizontal?.[0] ?? 0,
    0,
    data.velocity?.horizontal?.[1] ?? 0
  );

  for (let i = 0; i < INVENTORY_SIZE; i++) {
    const slot = data.inventory[i] ?? { type: null, count: 0 };
    slots[i].type = slot.type;
    slots[i].count = slot.count;
  }
  selectedSlot = data.selectedSlot ?? 0;
  currentWorldName = data.worldName ?? 'Saved World';
  renderInventoryUI();
  return true;
}

function saveCurrentGame() {
  writeSave(collectSaveState());
}

function quitAndExit() {
  saveCurrentGame();
  openMainMenu();
}

function loadSavedGame() {
  const data = readSave();
  return data ? applySaveState(data) : false;
}

function clearWorld() {
  for (const key of [...blocks.keys()]) {
    removeBlock(key);
  }
}

function resetInventory() {
  for (let i = 0; i < INVENTORY_SIZE; i++) {
    slots[i].type = null;
    slots[i].count = 0;
  }
  selectedSlot = 0;
  renderInventoryUI();
}

function closeMainMenu() {
  onMainMenu = false;
  mainMenuOverlay.classList.remove('open');
  showMainMenuScreen('buttons');
  updateHudVisibility();
  updatePlayCatcher();
  if (!inventoryOpen && !controls.isLocked) hint.style.display = 'block';
}

function openMainMenu() {
  if (inventoryOpen) closeInventory();
  menuOverlay.classList.remove('open');
  menuScreen = null;
  pauseMenu.classList.remove('active');
  controlsMenu.classList.remove('active');
  settingsMenu.classList.remove('active');

  onMainMenu = true;
  mainMenuOverlay.classList.add('open');
  showMainMenuScreen('buttons');
  controls.unlock();
  crosshair.classList.remove('active');
  hint.style.display = 'none';
  updateLoadGameButton();
  updatePlayCatcher();
  updateHudVisibility();
}

function startNewGame(worldName) {
  currentWorldName = worldName;
  clearWorld();
  buildWorld();
  restartPlayer();
  resetInventory();
  saveCurrentGame();
  closeMainMenu();
}

function closeInventory() {
  if (!inventoryOpen) return;
  inventoryOpen = false;
  inventoryPanel.classList.remove('open');
  if (controls.isLocked) crosshair.classList.add('active');
  updateHudVisibility();
  updatePlayCatcher();
  renderInventoryUI();
}

function openPauseMenu() {
  if (inventoryOpen) closeInventory();
  menuOverlay.classList.add('open');
  showMenuScreen('pause');
  controls.unlock();
  crosshair.classList.remove('active');
  hint.style.display = 'none';
  updatePlayCatcher();
  updateHudVisibility();
}

function resumeGame(lockPointer = false) {
  if (onMainMenu) return;
  menuOverlay.classList.remove('open');
  menuScreen = null;
  pauseMenu.classList.remove('active');
  controlsMenu.classList.remove('active');
  settingsMenu.classList.remove('active');
  updateHudVisibility();
  if (lockPointer) {
    initAudio();
    controls.lock();
  } else {
    updatePlayCatcher();
    if (!inventoryOpen) hint.style.display = 'block';
  }
}

menuOverlay.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-menu]');
  if (!btn) return;
  e.stopPropagation();

  switch (btn.dataset.menu) {
    case 'resume':
      resumeGame(true);
      break;
    case 'controls':
      showMenuScreen('controls');
      break;
    case 'settings':
      showMenuScreen('settings');
      break;
    case 'quit-exit':
      quitAndExit();
      break;
    case 'back':
      showMenuScreen('pause');
      break;
  }
});

worldNameInput.addEventListener('keydown', (e) => {
  if (e.code === 'Enter') {
    e.preventDefault();
    startNewGame(resolveWorldName(worldNameInput.value));
  }
});

mainMenuOverlay.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-main]');
  if (!btn) return;
  e.stopPropagation();

  switch (btn.dataset.main) {
    case 'new-game':
      openNewGameScreen();
      break;
    case 'start-game':
      startNewGame(resolveWorldName(worldNameInput.value));
      break;
    case 'load-game':
      if (!hasSave()) return;
      if (loadSavedGame()) closeMainMenu();
      break;
    case 'settings':
      showMainMenuScreen('settings');
      break;
    case 'quit':
      window.close();
      break;
    case 'back':
      showMainMenuScreen('buttons');
      break;
  }
});

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

  bindSlotTooltip(el, index);

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
  icon.style.backgroundImage = `url(${blockIconUrls[slot.type]})`;
  icon.style.backgroundSize = 'cover';

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
  if (isMenuOpen() || onMainMenu) return;
  if (inventoryOpen) {
    closeInventory();
    return;
  }
  inventoryOpen = true;
  inventoryPanel.classList.add('open');
  controls.unlock();
  crosshair.classList.remove('active');
  updateHudVisibility();
  updatePlayCatcher();
  renderInventoryUI();
}

renderInventoryUI();

function restartPlayer() {
  camera.position.copy(SPAWN);
  camera.rotation.set(0, 0, 0);
  verticalVelocity = 0;
  horizontalVelocity.set(0, 0, 0);
  keys.w = false;
  keys.a = false;
  keys.s = false;
  keys.d = false;
}

restartBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  restartPlayer();
});

function canLockPointer() {
  return !controls.isLocked && !inventoryOpen && !isMenuOpen() && !onMainMenu;
}

function updatePlayCatcher() {
  playCatcher.classList.toggle('visible', canLockPointer());
}

function tryLockPointer() {
  if (!canLockPointer()) return;
  initAudio();
  controls.lock();
}

playCatcher.addEventListener('click', (e) => {
  e.stopPropagation();
  tryLockPointer();
});

renderer.domElement.addEventListener('click', () => {
  tryLockPointer();
});

document.addEventListener('mousedown', (e) => {
  if (inventoryOpen || isMenuOpen() || onMainMenu || !controls.isLocked) return;
  if (e.button === 0) breakTargetedBlock();
  if (e.button === 2) placeTargetedBlock();
});

renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

controls.addEventListener('lock', () => {
  hint.style.display = 'none';
  crosshair.classList.add('active');
  updatePlayCatcher();
});

controls.addEventListener('unlock', () => {
  crosshair.classList.remove('active');
  updatePlayCatcher();
  if (!isMenuOpen() && !inventoryOpen && !onMainMenu) hint.style.display = 'block';
});

document.addEventListener('pointerlockchange', () => {
  updatePlayCatcher();
});

updatePlayCatcher();

const keys = { w: false, a: false, s: false, d: false };
let verticalVelocity = 0;
let footstepTimer = 0;
const FOOTSTEP_INTERVAL = 0.42;
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
  return getGroundBlockType() !== null;
}

function getGroundBlockType() {
  const feet = feetY();
  for (const solid of solids) {
    if (
      Math.abs(feet - solid.maxY) < 0.05 &&
      overlapsXZ(camera.position.x, camera.position.z, solid)
    ) {
      const entry = blocks.get(solid.key);
      if (entry) return entry.type;
    }
  }
  return null;
}

function isMoving() {
  return Math.hypot(horizontalVelocity.x, horizontalVelocity.z) > 0.35;
}

function updateFootsteps(delta) {
  if (!onGround() || !isMoving()) {
    footstepTimer = 0;
    return;
  }
  footstepTimer -= delta;
  if (footstepTimer <= 0) {
    playStep(getGroundBlockType() ?? 'grass');
    footstepTimer = FOOTSTEP_INTERVAL;
  }
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
      const newX =
        px > solidCenterX ? solid.maxX + PLAYER_RADIUS : solid.minX - PLAYER_RADIUS;
      if (newX !== px) horizontalVelocity.x = 0;
      camera.position.x = newX;
    } else {
      const solidCenterZ = (solid.minZ + solid.maxZ) / 2;
      const newZ =
        pz > solidCenterZ ? solid.maxZ + PLAYER_RADIUS : solid.minZ - PLAYER_RADIUS;
      if (newZ !== pz) horizontalVelocity.z = 0;
      camera.position.z = newZ;
    }
  }
}

function applyMovement(delta) {
  if (!controls.isLocked || isGamePaused()) return;

  camera.getWorldDirection(_moveDir);
  _moveDir.y = 0;
  if (_moveDir.lengthSq() < 1e-8) _moveDir.set(0, 0, -1);
  else _moveDir.normalize();

  _right.crossVectors(_moveDir, camera.up).normalize();

  _inputDir.set(0, 0, 0);
  if (keys.w) _inputDir.add(_moveDir);
  if (keys.s) _inputDir.sub(_moveDir);
  if (keys.d) _inputDir.add(_right);
  if (keys.a) _inputDir.sub(_right);

  const grounded = onGround();
  const hasInput = _inputDir.lengthSq() > 0;

  if (hasInput) {
    _inputDir.normalize();
    const accel = grounded ? GROUND_ACCEL : AIR_ACCEL;
    horizontalVelocity.x += _inputDir.x * accel * delta;
    horizontalVelocity.z += _inputDir.z * accel * delta;

    const speed = Math.hypot(horizontalVelocity.x, horizontalVelocity.z);
    if (speed > MOVE_SPEED) {
      const scale = MOVE_SPEED / speed;
      horizontalVelocity.x *= scale;
      horizontalVelocity.z *= scale;
    }
  } else if (grounded) {
    const damp = Math.max(0, 1 - GROUND_FRICTION * delta);
    horizontalVelocity.x *= damp;
    horizontalVelocity.z *= damp;
    if (Math.abs(horizontalVelocity.x) < 0.02) horizontalVelocity.x = 0;
    if (Math.abs(horizontalVelocity.z) < 0.02) horizontalVelocity.z = 0;
  }

  camera.position.x += horizontalVelocity.x * delta;
  camera.position.z += horizontalVelocity.z * delta;
}

function raycastBlock() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  raycaster.far = REACH;
  raycaster.firstHitOnly = true;
  return raycaster.intersectObjects(blockMeshes, false);
}

function canPlaceAt(x, y, z) {
  const maxY = y + BLOCK;
  const feet = feetY();
  const px = camera.position.x;
  const pz = camera.position.z;
  const headY = camera.position.y;

  const xzOverlap =
    px + PLAYER_RADIUS > x &&
    px - PLAYER_RADIUS < x + BLOCK &&
    pz + PLAYER_RADIUS > z &&
    pz - PLAYER_RADIUS < z + BLOCK;

  if (!xzOverlap) return true;

  // Allow pillar/clutch: block top is at or below feet
  if (maxY <= feet + 0.05) return true;

  return !(headY > y && feet < maxY);
}

function tryPlaceBelowFeet(type) {
  const feet = feetY();
  const bx = Math.floor(camera.position.x);
  const bz = Math.floor(camera.position.z);
  const by = Math.floor(feet - 0.001) - 1;

  if (by < 0) return false;
  if (blocks.has(blockKey(bx, by, bz))) return false;
  if (!canPlaceAt(bx, by, bz)) return false;

  addBlock(bx, by, bz, type);
  return true;
}

function isLookingDown() {
  return camera.rotation.x > 0.45;
}

function breakTargetedBlock() {
  const hits = raycastBlock();
  if (hits.length === 0) return;

  const { key } = hits[0].object.userData;
  const removed = removeBlock(key);
  if (removed) {
    addToInventory(removed);
    playBreak(removed);
  }
}

function consumeSlotItem() {
  const slot = slots[selectedSlot];
  slot.count--;
  if (slot.count <= 0) {
    slot.type = null;
    slot.count = 0;
  }
  renderInventoryUI();
}

function placeTargetedBlock() {
  const slot = slots[selectedSlot];
  if (!slot.type || slot.count <= 0) return;

  if (!onGround() && isLookingDown() && tryPlaceBelowFeet(slot.type)) {
    playPlace(slot.type);
    consumeSlotItem();
    return;
  }

  const hits = raycastBlock();
  if (hits.length === 0) return;

  const hit = hits[0];
  const n = hit.face.normal;
  const { x, y, z } = hit.object.userData;
  const bx = x + Math.round(n.x);
  const by = y + Math.round(n.y);
  const bz = z + Math.round(n.z);

  if (blocks.has(blockKey(bx, by, bz))) return;
  if (!canPlaceAt(bx, by, bz)) return;

  addBlock(bx, by, bz, slot.type);
  playPlace(slot.type);
  consumeSlotItem();
}

function isTypingInUI() {
  const el = document.activeElement;
  return (
    el &&
    (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
  );
}

document.addEventListener(
  'keydown',
  (e) => {
  if (e.code === 'Escape') {
    e.preventDefault();
    if (onMainMenu) {
      if (
        mainSettingsScreen.classList.contains('active') ||
        mainNewGameScreen.classList.contains('active')
      ) {
        showMainMenuScreen('buttons');
      }
      return;
    }
    if (inventoryOpen) {
      closeInventory();
      return;
    }
    if (menuScreen === 'controls' || menuScreen === 'settings') {
      showMenuScreen('pause');
      return;
    }
    if (menuScreen === 'pause') {
      resumeGame(false);
      return;
    }
    openPauseMenu();
    return;
  }

  if (isTypingInUI()) return;

  if (e.code === 'KeyE') {
    toggleInventory();
    e.preventDefault();
    return;
  }
  if (inventoryOpen || isMenuOpen() || onMainMenu) return;

  if (e.code === 'KeyW') keys.w = true;
  if (e.code === 'KeyA') keys.a = true;
  if (e.code === 'KeyS') keys.s = true;
  if (e.code === 'KeyD') keys.d = true;
  if (e.code === 'Space' && controls.isLocked && onGround()) {
    playJump(getGroundBlockType() ?? 'grass');
    verticalVelocity = JUMP_SPEED;
    footstepTimer = FOOTSTEP_INTERVAL * 0.5;
    e.preventDefault();
  }
  const digit = e.code.match(/^Digit([1-9])$/);
  if (digit && controls.isLocked) {
    selectedSlot = Number(digit[1]) - 1;
    renderInventoryUI();
  }
  },
  true
);

document.addEventListener('wheel', (e) => {
  if (inventoryOpen || isMenuOpen() || onMainMenu || !controls.isLocked) return;
  selectedSlot = (selectedSlot + (e.deltaY > 0 ? 1 : -1) + HOTBAR_SIZE) % HOTBAR_SIZE;
  renderInventoryUI();
  e.preventDefault();
}, { passive: false });

document.addEventListener('keyup', (e) => {
  if (isTypingInUI()) return;
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
  if (isGamePaused()) {
    clock.getDelta();
    renderer.render(scene, camera);
    return;
  }

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
  updateFootsteps(delta);

  if (feetY() < FALL_DEATH_Y) restartPlayer();

  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);
