// Keyboard: turn the cube (and so walk through the graph) and move the camera.
//   U R F D L B   turn that face clockwise; with Shift counter-clockwise (U', R', ...)
//   X Y Z         turn the whole cube (Shift: x', y', z')
//   Backspace     undo the last turn made by hand
//   arrows        orbit the camera; + and - zoom; 0 the whole graph; Enter fly to the selected state
//   ?             help
// Letters are read by the character typed, so they follow the keyboard layout. Keys are left alone
// while typing in a field and with Ctrl, Cmd or Alt held (browser shortcuts), and in an embed they act
// only with the pointer or the focus inside the explorer.
import { moveByName } from '../model';
import type { Explorer } from './types';
import { listen } from './events';
import { currentPoint } from './locate';
import { queueMove, undoTurn } from '../cube/walks';
import { flyHome, flyTo, isTyping, orbitBy, origin, ownsKey, zoomBy, type NavigationOptions } from '../render/navigation';

const STEP = Math.PI / 18; // 10 degrees per arrow press

export function bindKeyboard(x: Explorer, opts: NavigationOptions): void {
  listen(x, window, 'keydown', (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || isTyping(origin(e)) || !ownsKey(x, e, opts)) return;
    const t = origin(e) as HTMLElement | null;
    // keys that buttons and links already use for themselves
    if ((e.key === 'Enter' || e.key === ' ') && t && (t.tagName === 'BUTTON' || t.tagName === 'A')) return;
    const k = e.key;
    let handled = true;
    if (/^[urfdlbxyz]$/i.test(k)) {
      if (e.repeat) { e.preventDefault(); return; }
      const face = k.toLowerCase(), name = 'xyz'.includes(face) ? face : face.toUpperCase();
      const mv = moveByName(e.shiftKey ? name + "'" : name);
      if (mv) queueMove(x, mv);
    } else if (k === 'Backspace') { if (!e.repeat) undoTurn(x); }
    else if (k === 'ArrowLeft') orbitBy(x, -STEP, 0);
    else if (k === 'ArrowRight') orbitBy(x, STEP, 0);
    else if (k === 'ArrowUp') orbitBy(x, 0, -STEP);
    else if (k === 'ArrowDown') orbitBy(x, 0, STEP);
    else if (k === '+' || k === '=') zoomBy(x, 0.8);
    else if (k === '-' || k === '_') zoomBy(x, 1.25);
    else if (k === '0') flyHome(x);
    else if (k === 'Enter') { const P = currentPoint(x); if (P) flyTo(x, P); }
    else if (k === '?') x.el.btnHelp.click();
    else handled = false;
    if (handled) { e.preventDefault(); x.lastEventAt = performance.now(); }
  });
}
