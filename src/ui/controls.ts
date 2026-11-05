// The controls on the stage: help and Key pop-ups, the Tools drawer and its tabs, the selection card,
// the first-run coach mark, and the heads-up and slow-drawing notes.
import type { Explorer, ToolsTab } from '../explorer/types';
import { deselect } from '../explorer/selection';
import { listen } from '../explorer/events';

const TABS: readonly ToolsTab[] = ['find', 'turn', 'view', 'data', 'about'];

function setPop(btn: HTMLElement, pop: HTMLElement, open: boolean): void {
  pop.hidden = !open;
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

/** Opens or closes the Tools drawer, optionally on a tab. */
export function setTools(x: Explorer, open: boolean, tab?: ToolsTab): void {
  const el = x.el;
  if (tab) setTab(x, tab);
  x.ui.toolsOpen = open;
  el.tools.hidden = !open;
  el.appRoot.classList.toggle('tools-open', open);
  el.btnTools.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) { setPop(el.btnHelp, el.help, false); setPop(el.btnKey, el.legend, false); }
  updateCoach(x);
  x.renderDirty = true;
}

export function setTab(x: Explorer, tab: ToolsTab): void {
  x.ui.tab = tab;
  for (const b of x.el.tabButtons) {
    const on = b.dataset.tab === tab;
    b.setAttribute('aria-selected', on ? 'true' : 'false');
    b.tabIndex = on ? 0 : -1;
  }
  for (const p of x.el.panes) p.hidden = p.dataset.pane !== tab;
}

/** The selection card shows while a state is selected that the user picked or moved to. */
export function updateCard(x: Explorer): void {
  const show = x.sel.on && x.ui.cardWanted;
  if (x.el.card.hidden === !show) return;
  x.el.card.hidden = !show;
  x.cubeDirty = true;
}

export function setCardCollapsed(x: Explorer, collapsed: boolean): void {
  x.ui.cardCollapsed = collapsed;
  x.el.card.classList.toggle('collapsed', collapsed);
  x.el.btnCardToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  x.el.btnCardToggle.setAttribute('aria-label', collapsed ? 'Expand' : 'Collapse');
  x.cubeDirty = true;
}

/** "Start here" points at the growth bar until the first layer is added (or it is dismissed). */
export function updateCoach(x: Explorer): void {
  x.el.coach.hidden = x.ui.coachDismissed || x.graph.depthShown > 0 || x.growth.growing || x.ui.toolsOpen || !x.el.heads.hidden;
}

/** Shows a heads-up next to the growth bar; `yes` null means a notice with only an OK button. */
export function showHeads(x: Explorer, text: string, yes: (() => void) | null): void {
  const el = x.el;
  el.headsText.textContent = text;
  el.btnHeadsYes.hidden = !yes;
  el.btnHeadsNo.textContent = yes ? 'Stop here' : 'OK';
  x.ui.headsYes = yes;
  el.heads.hidden = false;
  updateCoach(x);
  (yes ? el.btnHeadsYes : el.btnHeadsNo).focus();
}
function hideHeads(x: Explorer): void { x.el.heads.hidden = true; x.ui.headsYes = null; updateCoach(x); }

/** Esc: closes the topmost pop-up or the drawer; returns false when there was none (then Esc deselects). */
export function closeTopmost(x: Explorer): boolean {
  const el = x.el;
  if (!el.heads.hidden) { hideHeads(x); return true; }
  if (!el.help.hidden) { setPop(el.btnHelp, el.help, false); el.btnHelp.focus(); return true; }
  if (!el.legend.hidden) { setPop(el.btnKey, el.legend, false); el.btnKey.focus(); return true; }
  if (x.ui.toolsOpen) { setTools(x, false); el.btnTools.focus(); return true; }
  return false;
}

export function bindControls(x: Explorer): void {
  const el = x.el;
  listen(x, el.btnHelp, 'click', () => { setPop(el.btnHelp, el.help, el.help.hidden !== false); setPop(el.btnKey, el.legend, false); });
  listen(x, el.btnKey, 'click', () => { setPop(el.btnKey, el.legend, el.legend.hidden !== false); setPop(el.btnHelp, el.help, false); });
  listen(x, el.btnTools, 'click', () => setTools(x, !x.ui.toolsOpen));
  listen(x, el.btnToolsClose, 'click', () => { setTools(x, false); el.btnTools.focus(); });
  el.tabButtons.forEach(b => listen(x, b, 'click', () => setTab(x, b.dataset.tab as ToolsTab)));
  // arrow keys move between tabs (the tablist pattern)
  el.tabButtons.forEach(b => listen(x, b, 'keydown', (e: KeyboardEvent) => {
    const i = TABS.indexOf(x.ui.tab), step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const t = TABS[(i + step + TABS.length) % TABS.length];
    setTab(x, t);
    el.tabButtons.find(c => c.dataset.tab === t)?.focus();
  }));
  listen(x, el.btnCardToggle, 'click', () => setCardCollapsed(x, !x.ui.cardCollapsed));
  listen(x, el.btnDeselect, 'click', () => deselect(x));
  listen(x, el.btnCoachClose, 'click', () => { x.ui.coachDismissed = true; updateCoach(x); });
  listen(x, el.btnHeadsYes, 'click', () => { const yes = x.ui.headsYes; hideHeads(x); yes?.(); });
  listen(x, el.btnHeadsNo, 'click', () => hideHeads(x));
  listen(x, el.btnSlowOff, 'click', () => { el.optPace.checked = false; el.slowTip.hidden = true; });
  listen(x, el.btnSlowKeep, 'click', () => { el.slowTip.hidden = true; });
  // using the stage closes the help and the key, as clicking outside a menu would
  listen(x, el.graph, 'pointerdown', () => { setPop(el.btnHelp, el.help, false); setPop(el.btnKey, el.legend, false); });
}
