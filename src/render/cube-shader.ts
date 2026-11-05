// One instanced box per state, stickered in the fragment shader: the 24 sticker colours (3 bits each)
// are packed into a vec4 per instance, 6 stickers per component.
import * as THREE from 'three';
import type { Theme } from '../explorer/theme';

const nodeVS = `
attribute vec4 aStick;
varying vec3 vPos; varying vec3 vN; varying vec4 vStick;
void main() {
  vPos = position; vN = normal; vStick = aStick;
  vec4 p = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    p = instanceMatrix * p;
  #endif
  gl_Position = projectionMatrix * modelViewMatrix * p;
}`;
const nodeFS = `
uniform vec3 uPal[6]; uniform vec3 uBody;
varying vec3 vPos; varying vec3 vN; varying vec4 vStick;
vec3 pal(float c) {
  if (c < 0.5) return uPal[0]; if (c < 1.5) return uPal[1]; if (c < 2.5) return uPal[2];
  if (c < 3.5) return uPal[3]; if (c < 4.5) return uPal[4]; return uPal[5];
}
void main() {
  vec3 an = abs(vN); float f; vec2 uv;
  if (an.y > 0.5)      { f = vN.y > 0.0 ? 0.0 : 1.0; uv = vPos.xz; }
  else if (an.x > 0.5) { f = vN.x > 0.0 ? 2.0 : 3.0; uv = vPos.yz; }
  else                 { f = vN.z > 0.0 ? 4.0 : 5.0; uv = vPos.xy; }
  float s = f * 4.0 + (uv.x > 0.0 ? 2.0 : 0.0) + (uv.y > 0.0 ? 1.0 : 0.0);
  float comp = floor(s / 6.0 + 0.001); float idx = s - comp * 6.0;
  float v = comp < 0.5 ? vStick.x : (comp < 1.5 ? vStick.y : (comp < 2.5 ? vStick.z : vStick.w));
  v = floor(v + 0.5);
  float d = exp2(3.0 * idx);
  float c = mod(floor((v + 0.5) / d), 8.0);
  vec2 q = abs(uv); float g = 0.045;
  float edge = step(q.x, g) + step(q.y, g) + step(0.5 - g, q.x) + step(0.5 - g, q.y);
  vec3 col = edge > 0.0 ? uBody : pal(c);
  float sh = f < 0.5 ? 1.0 : (f < 1.5 ? 0.6 : (f < 2.5 ? 0.8 : (f < 3.5 ? 0.66 : (f < 4.5 ? 0.9 : 0.72))));
  gl_FragColor = vec4(col * sh, 1.0);
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
