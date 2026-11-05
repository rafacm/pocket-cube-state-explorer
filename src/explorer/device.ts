// What the device can probably handle. Browsers say little, and unevenly: navigator.deviceMemory
// exists in Chrome and Edge only (and is capped at 8 GB), iPhones report no memory at all, and the
// WebGL renderer name tells whether 3D runs in software. So these are hints for a heads-up before
// the heavy outer layers, never a reason to refuse.
import { fmt, fullMax, totals } from './settings';
import type { Explorer } from './types';

export interface DeviceProfile {
  /** little memory or few CPU cores */
  constrained: boolean;
  /** a touch screen of phone size */
  phone: boolean;
  /** WebGL without a graphics card (SwiftShader, llvmpipe, ...) */
  software: boolean;
}

/** Memory for the outer layers: allocated together when the first one is added (src/outer/dots.ts). */
export const OUTER_LAYERS_MB = 120;

let profile: DeviceProfile | null = null;

export function deviceProfile(gl: WebGLRenderingContext | WebGL2RenderingContext | null): DeviceProfile {
  if (profile) return profile;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const memory = nav.deviceMemory, cores = nav.hardwareConcurrency;
  const constrained = (memory !== undefined && memory <= 4) || (cores !== undefined && cores > 0 && cores <= 4);
  const coarse = !!window.matchMedia?.('(pointer: coarse)').matches;
  const phone = coarse && Math.min(screen.width, screen.height) < 600;
  let software = false;
  try {
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    const name = info && gl ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
  } catch { /* renderer name not available */ }
  profile = { constrained, phone, software };
  return profile;
}

/**
 * The heads-up before adding layer nd, or null when none is needed: before the first dot layer
 * (when the outer layers' memory is set aside) and before the very large layers, on a device that
 * looks constrained, a phone, or software 3D.
 */
export function headsUpFor(x: Explorer, nd: number): string | null {
  const p = deviceProfile(x.gs.renderer.getContext());
  if (!p.constrained && !p.phone && !p.software) return null;
  const n = totals(x.halfTurns)[nd], first = nd === fullMax(x.halfTurns) + 1;
  if (!first && n < 300000) return null;
  const why = p.software ? 'This browser draws 3D without a graphics card here, so it will be slow.'
    : p.phone ? 'On a phone this may be slow, and the browser may close the page if memory runs short.'
    : 'This device may slow down.';
  return first
    ? `From layer ${nd} on, states are drawn as dots: adding them sets aside about ${OUTER_LAYERS_MB} MB of memory. ${why}`
    : `Layer ${nd} adds ${fmt(n)} states, and arranging them takes a while. ${why}`;
}
