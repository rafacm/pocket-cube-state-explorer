// The unfolded cube (net), the facelet strings and the orientation note under it.
import { FACE_NAME, NET_SLOTS, faceletString, type Move } from '../model';
import type { Explorer } from '../explorer/types';
import { listen } from '../explorer/events';

const NET_POS: Record<number, [number, number]> = { 0: [2, 1], 3: [1, 2], 4: [2, 2], 2: [3, 2], 5: [4, 2], 1: [2, 3] };
const netEls = new WeakMap<Explorer, HTMLElement[][]>();

export function buildNet(x: Explorer): void {
  const net = x.el.net, els: HTMLElement[][] = [];
  net.innerHTML = '';
  for (const f of [0, 3, 4, 2, 5, 1]) {
    const fd = document.createElement('div'); fd.className = 'face f-' + FACE_NAME[f];
    fd.style.gridColumn = String(NET_POS[f][0]); fd.style.gridRow = String(NET_POS[f][1]);
    fd.title = FACE_NAME[f] + ' face';
    const face: HTMLElement[] = [];
    for (let i = 0; i < 4; i++) { const st = document.createElement('span'); st.className = 'st'; fd.appendChild(st); face.push(st); }
    els[f] = face; net.appendChild(fd);
  }
  netEls.set(x, els);
}

export function renderNet(x: Explorer): void {
  const els = netEls.get(x); if (!els) return;
  const key = x.cube.key;
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++)
    els[f][i].style.background = 'var(--c-' + FACE_NAME[key.charCodeAt(NET_SLOTS[f][i]) - 48] + ')';
}

export function renderOrientation(x: Explorer, c: { key: string; seq: Move[] }): void {
  const el = x.el, held = faceletString(x.cube.key), canon = faceletString(c.key);
  el.flHeld.textContent = held;
  el.flCanon.textContent = canon;
  el.flCanon.classList.toggle('same', held === canon);
  const std = c.seq.length === 0;
  el.orientTag.classList.toggle('off', !std);
  el.orientText.textContent = std ? 'Standard orientation' : 'Held in another orientation';
  el.orientNote.innerHTML = std
    ? 'The yellow-orange-blue corner sits at down-left-back with yellow down, so the held and canonical strings match.'
    : 'Rotating the whole cube with <b>' + c.seq.map(m => m.name).join(' ') + '</b> brings the yellow-orange-blue corner back to down-left-back. The canonical string is what the graph uses, so both strings name the same state.';
  el.btnNorm.disabled = std;
}

/** Copy string: the held facelet string to the clipboard, or selected for Ctrl+C where that is not allowed. */
export function bindCopy(x: Explorer): void {
  const el = x.el.flHeld, b = x.el.btnCopy;
  listen(x, b, 'click', () => {
    const txt = el.textContent || '';
    const done = () => { b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy string'; }, 1400); };
    const fallback = () => {
      const r = document.createRange(); r.selectNodeContents(el);
      const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r);
      b.textContent = 'Selected, press Ctrl+C'; setTimeout(() => { b.textContent = 'Copy string'; }, 2200);
    };
    try { navigator.clipboard.writeText(txt).then(done, fallback); } catch { fallback(); }
  });
}
