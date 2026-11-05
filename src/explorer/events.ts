// Event listeners that destroy() removes again.
import type { Explorer } from './types';

/** DOM targets and Three.js event dispatchers (OrbitControls) alike. */
interface Target {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addEventListener(type: string, fn: (e: any) => void, opts?: AddEventListenerOptions): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  removeEventListener(type: string, fn: (e: any) => void, opts?: AddEventListenerOptions): void;
}

export function listen<E = Event>(x: Explorer, target: Target, type: string, fn: (e: E) => void, opts?: AddEventListenerOptions): void {
  target.addEventListener(type, fn, opts);
  x.cleanup.push(() => target.removeEventListener(type, fn, opts));
}
