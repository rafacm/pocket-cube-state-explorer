// The progress line in the stage's corner (growing, arranging, measuring).
import type { Explorer } from '../explorer/types';

/** Shows `text` with a progress bar at `frac` (0..1), or hides the line when text is null. */
export function showBusy(x: Explorer, text: string | null, frac = 0): void {
  const el = x.el.statBusy;
  const sig = text == null ? '' : text + '|' + Math.round(frac * 50);
  if (sig === x.growth.busyShown) return;
  x.growth.busyShown = sig;
  if (text == null) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = text + '<i><b style="width:' + Math.round(frac * 100) + '%"></b></i>';
}
