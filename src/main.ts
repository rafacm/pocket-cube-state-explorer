// The standalone page: the explorer fills the window, and remembers the theme chosen with its
// Appearance control (light, dark, or the system's).
import './styles/explorer.css';
import './styles/page.css';
import { createExplorer } from './explorer';
import { THEME_MODES, type ThemeMode } from './explorer/theme';

const KEY = 'pocket-cube-explorer.theme';
let saved: ThemeMode = 'system';
try { const v = localStorage.getItem(KEY); if (THEME_MODES.includes(v as ThemeMode)) saved = v as ThemeMode; } catch { /* storage blocked */ }

createExplorer(document.getElementById('app')!, {
  keyboard: 'page',
  theme: saved,
  onThemeChange(mode, scheme) {
    document.documentElement.dataset.theme = scheme; // the page behind the explorer follows it (page.css)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', scheme === 'dark' ? '#12151B' : '#F6F4EF');
    try { if (mode === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, mode); } catch { /* storage blocked */ }
  },
});
