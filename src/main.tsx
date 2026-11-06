import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ReportFailure from './report/ReportFailure';
import './report/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ReportFailure>
      <App />
    </ReportFailure>
  </StrictMode>,
);
