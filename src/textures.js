import * as THREE from 'three';

const TEX_SIZE = 16;

function clamp(v, min = 0, max = 255) {
  return Math.max(min, Math.min(max, Math.round(v)));
}

function rgb([r, g, b], variance = 0) {
  const n = (Math.random() - 0.5) * variance;
  return `rgb(${clamp(r + n)}, ${clamp(g + n)}, ${clamp(b + n)})`;
}

function fillNoise(ctx, size, base, variance) {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      ctx.fillStyle = rgb(base, variance);
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

function makeTexture(drawFn) {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx = canvas.getContext('2d');
  drawFn(ctx, TEX_SIZE);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeMaterial(map) {
  return new THREE.MeshLambertMaterial({ map });
}

const grassTopTex = makeTexture((ctx, size) => {
  fillNoise(ctx, size, [74, 150, 48], 28);
  for (let i = 0; i < 18; i++) {
    ctx.fillStyle = rgb([58, 130, 38], 18);
    ctx.fillRect((Math.random() * size) | 0, (Math.random() * size) | 0, 1, 1);
  }
});

const grassSideTex = makeTexture((ctx, size) => {
  const grassRows = 5;
  fillNoise(ctx, size, [74, 150, 48], 24);
  for (let y = 0; y < grassRows; y++) {
    for (let x = 0; x < size; x++) {
      ctx.fillStyle = rgb([58, 130, 38], 20);
      ctx.fillRect(x, y, 1, 1);
    }
  }
  for (let y = grassRows; y < size; y++) {
    for (let x = 0; x < size; x++) {
      ctx.fillStyle = rgb([134, 96, 67], 22);
      ctx.fillRect(x, y, 1, 1);
    }
  }
});

const dirtTex = makeTexture((ctx, size) => {
  fillNoise(ctx, size, [134, 96, 67], 26);
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = rgb([110, 78, 52], 16);
    ctx.fillRect((Math.random() * size) | 0, (Math.random() * size) | 0, 1, 2);
  }
});

const stoneTex = makeTexture((ctx, size) => {
  fillNoise(ctx, size, [125, 125, 125], 22);
  for (let i = 0; i < 20; i++) {
    ctx.fillStyle = rgb([95, 95, 95], 14);
    ctx.fillRect((Math.random() * size) | 0, (Math.random() * size) | 0, 1, 1);
  }
});

const dirtMat = makeMaterial(dirtTex);
const stoneMat = makeMaterial(stoneTex);
const grassSideMat = makeMaterial(grassSideTex);
const grassTopMat = makeMaterial(grassTopTex);

export const blockMaterials = {
  grass: [grassSideMat, grassSideMat, grassTopMat, dirtMat, grassSideMat, grassSideMat],
  dirt: [dirtMat, dirtMat, dirtMat, dirtMat, dirtMat, dirtMat],
  stone: [stoneMat, stoneMat, stoneMat, stoneMat, stoneMat, stoneMat],
};

export const blockIconUrls = {
  grass: grassTopTex.image.toDataURL(),
  dirt: dirtTex.image.toDataURL(),
  stone: stoneTex.image.toDataURL(),
};
