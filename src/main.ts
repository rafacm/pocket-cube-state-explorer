// The standalone page: the explorer fills the window.
import './styles.css';
import { createExplorer } from './explorer';

createExplorer(document.getElementById('app')!, { keyboard: 'page' });
