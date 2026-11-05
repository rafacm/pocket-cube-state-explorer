// One instanced box per state, stickered by the shaders: the 24 sticker colours (3 bits each) are
// packed into a vec4 per instance, 6 stickers per component (values up to 8^6 - 1 = 262,143).
//
// The packed numbers are decoded in the vertex shader, where WebGL guarantees full float precision,
// and only finished colours reach the fragment shader. Decoding them per pixel failed on iPhones and
// iPads: Apple GPUs may run fragment maths at lower precision, and numbers that large don't survive it,
// so every cube came out without its colours.
import * as THREE from 'three';
import type { Theme } from '../explorer/theme';

const nodeVS = `
attribute vec4 aStick;
uniform vec3 uPal[6];
varying vec2 vUV; varying float vShade;
varying vec3 vC0; varying vec3 vC1; varying vec3 vC2; varying vec3 vC3;
vec3 pal(float c) {
  if (c < 0.5) return uPal[0]; if (c < 1.5) return uPal[1]; if (c < 2.5) return uPal[2];
  if (c < 3.5) return uPal[3]; if (c < 4.5) return uPal[4]; return uPal[5];
}
// sticker s (0..23): 3 bits in component floor(s / 6), at bit 3 * (s mod 6); comparisons, not
// division or exp2, so every step is exact
vec3 sticker(float s) {
  float comp = s < 5.5 ? 0.0 : (s < 11.5 ? 1.0 : (s < 17.5 ? 2.0 : 3.0));
  float idx = s - comp * 6.0;
  float v = floor((comp < 0.5 ? aStick.x : (comp < 1.5 ? aStick.y : (comp < 2.5 ? aStick.z : aStick.w))) + 0.5);
  float d = idx < 0.5 ? 1.0 : (idx < 1.5 ? 8.0 : (idx < 2.5 ? 64.0 : (idx < 3.5 ? 512.0 : (idx < 4.5 ? 4096.0 : 32768.0))));
  return pal(mod(floor(v / d), 8.0));
}
void main() {
  // every vertex of the box belongs to one face: which one, and where it lies on it
  vec3 an = abs(normal); float f;
  if (an.y > 0.5)      { f = normal.y > 0.0 ? 0.0 : 1.0; vUV = position.xz; }
  else if (an.x > 0.5) { f = normal.x > 0.0 ? 2.0 : 3.0; vUV = position.yz; }
  else                 { f = normal.z > 0.0 ? 4.0 : 5.0; vUV = position.xy; }
  vShade = f < 0.5 ? 1.0 : (f < 1.5 ? 0.6 : (f < 2.5 ? 0.8 : (f < 3.5 ? 0.66 : (f < 4.5 ? 0.9 : 0.72))));
  // the face's four stickers, by quadrant: (u < 0, v < 0), (u < 0, v > 0), (u > 0, v < 0), (u > 0, v > 0)
  vC0 = sticker(f * 4.0); vC1 = sticker(f * 4.0 + 1.0); vC2 = sticker(f * 4.0 + 2.0); vC3 = sticker(f * 4.0 + 3.0);
  vec4 p = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    p = instanceMatrix * p;
  #endif
  gl_Position = projectionMatrix * modelViewMatrix * p;
}`;
const nodeFS = `
uniform vec3 uBody;
varying vec2 vUV; varying float vShade;
varying vec3 vC0; varying vec3 vC1; varying vec3 vC2; varying vec3 vC3;
void main() {
  vec3 col = vUV.x > 0.0 ? (vUV.y > 0.0 ? vC3 : vC2) : (vUV.y > 0.0 ? vC1 : vC0);
  vec2 q = abs(vUV); float g = 0.045;
  float edge = step(q.x, g) + step(q.y, g) + step(0.5 - g, q.x) + step(0.5 - g, q.y);
  gl_FragColor = vec4((edge > 0.0 ? uBody : col) * vShade, 1.0);
}`;

export function createCubeMaterial(theme: Theme): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uPal: { value: theme.sticker }, uBody: { value: theme.cubeBody } },
    vertexShader: nodeVS, fragmentShader: nodeFS,
  });
}

/** Packs 24 sticker colours (colour(k) for k = 0..23, each 0..5) into out[i*4 .. i*4+3]. */
export function packStickers(colour: (k: number) => number, out: Float32Array, i: number): void {
  for (let c = 0; c < 4; c++) {
    let v = 0, m = 1;
    for (let k = 0; k < 6; k++) { v += colour(c * 6 + k) * m; m *= 8; }
    out[i * 4 + c] = v;
  }
}
