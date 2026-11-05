// <pocket-cube-explorer>: the explorer as a custom element, for embedding in any page.
//
//   <script type="module" src="https://pocket-cube-state-explorer.vercel.app/embed/pocket-cube-explorer.js"></script>
//   <pocket-cube-explorer></pocket-cube-explorer>
//
// It renders into a shadow root, so the page's styles and the explorer's do not mix. Attributes:
//   no-header           hide the explorer's own title bar
//   eager               start at once (default: when it first comes within 200 px of the viewport)
//   data-theme="dark"   or "light": the panel's colour scheme (default: follows the system)
// Size it with CSS: its height is --explorer-height (default 720px); when it is narrower than 860 px
// the panel goes below the stage and it grows to fit.
import css from './styles/explorer.css?inline';
import { createExplorer, type ExplorerHandle } from './explorer';

export { createExplorer } from './explorer';
export type { ExplorerHandle, ExplorerOptions } from './explorer';

const FONTS = 'https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;600&family=Unbounded:wght@500;600&display=swap';
const HOST_CSS = `
:host { display: block; position: relative; min-height: var(--explorer-height, 720px); }
:host([hidden]) { display: none; }
.mount { height: 100%; }
:host([no-header]) .bar { display: none; }
:host([no-header]) .app { grid-template-rows: minmax(0, 1fr); }
`;

// @font-face rules only work in the document, not inside a shadow root: add the fonts there once.
function ensureFonts(): void {
  if (document.querySelector('link[data-pocket-cube-fonts]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = FONTS; link.dataset.pocketCubeFonts = '';
  document.head.appendChild(link);
}

export class PocketCubeExplorer extends HTMLElement {
  #handle: ExplorerHandle | null = null;
  #mount: HTMLDivElement | null = null;
  #io: IntersectionObserver | null = null;

  connectedCallback(): void {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    if (!root.querySelector('style')) {
      const style = document.createElement('style');
      style.textContent = css + HOST_CSS;
      root.append(style);
    }
    ensureFonts();
    if (this.hasAttribute('eager') || !('IntersectionObserver' in window)) { this.#start(); return; }
    this.#io = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) { this.#io?.disconnect(); this.#io = null; this.#start(); }
    }, { rootMargin: '200px' });
    this.#io.observe(this);
  }

  disconnectedCallback(): void {
    this.#io?.disconnect(); this.#io = null;
    this.#handle?.destroy(); this.#handle = null;
    this.#mount?.remove(); this.#mount = null;
  }

  #start(): void {
    if (this.#handle || !this.isConnected) return;
    this.#mount = document.createElement('div');
    this.#mount.className = 'mount';
    this.shadowRoot!.append(this.#mount);
    this.#handle = createExplorer(this.#mount, { keyboard: 'explorer' });
  }
}

if (!customElements.get('pocket-cube-explorer')) customElements.define('pocket-cube-explorer', PocketCubeExplorer);

declare global {
  interface HTMLElementTagNameMap { 'pocket-cube-explorer': PocketCubeExplorer }
}
