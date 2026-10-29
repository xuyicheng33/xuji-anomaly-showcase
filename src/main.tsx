import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

import './report/report.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

import './report/refinements.css';
import './report/loading.css';
