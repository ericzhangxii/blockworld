let audioCtx = null;

const STEP = {
  grass: { filter: 900, q: 0.9, gain: 0.22, duration: 0.06, attack: 0.004 },
  dirt: { filter: 420, q: 1.1, gain: 0.28, duration: 0.08, attack: 0.003 },
  stone: { filter: 280, q: 1.4, gain: 0.32, duration: 0.05, attack: 0.002 },
};

const JUMP = {
  grass: { filter: 700, q: 0.8, gain: 0.2, duration: 0.1, attack: 0.005 },
  dirt: { filter: 380, q: 1.0, gain: 0.24, duration: 0.11, attack: 0.004 },
  stone: { filter: 240, q: 1.2, gain: 0.26, duration: 0.09, attack: 0.003 },
};

const BREAK = {
  grass: { filter: 620, q: 1.0, gain: 0.36, duration: 0.12, attack: 0.002 },
  dirt: { filter: 360, q: 1.2, gain: 0.4, duration: 0.14, attack: 0.002 },
  stone: { filter: 190, q: 1.6, gain: 0.42, duration: 0.1, attack: 0.001 },
};

const PLACE = {
  grass: { filter: 480, q: 1.1, gain: 0.3, duration: 0.07, attack: 0.003 },
  dirt: { filter: 300, q: 1.2, gain: 0.32, duration: 0.08, attack: 0.003 },
  stone: { filter: 210, q: 1.4, gain: 0.34, duration: 0.06, attack: 0.002 },
};

export function initAudio() {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function playBurst(config) {
  if (!audioCtx) return;

  const { filter, q, gain, duration, attack } = config;
  const now = audioCtx.currentTime;
  const sampleRate = audioCtx.sampleRate;
  const length = Math.floor(sampleRate * duration);
  const buffer = audioCtx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = audioCtx.createBufferSource();
  source.buffer = buffer;

  const bandpass = audioCtx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = filter;
  bandpass.Q.value = q;

  const gainNode = audioCtx.createGain();
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(gain, now + attack);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

  source.connect(bandpass);
  bandpass.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  source.start(now);
  source.stop(now + duration + 0.02);
}

export function playStep(blockType) {
  initAudio();
  playBurst(STEP[blockType] ?? STEP.grass);
}

export function playJump(blockType) {
  initAudio();
  playBurst(JUMP[blockType] ?? JUMP.grass);
}

export function playBreak(blockType) {
  initAudio();
  playBurst(BREAK[blockType] ?? BREAK.grass);
}

export function playPlace(blockType) {
  initAudio();
  playBurst(PLACE[blockType] ?? PLACE.grass);
}
