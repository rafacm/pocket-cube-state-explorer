// The standalone page: the explorer fills the window.
import './styles/explorer.css';
import './styles/page.css';
import { createExplorer } from './explorer';

createExplorer(document.getElementById('app')!, { keyboard: 'page' });
