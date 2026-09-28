import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerServiceWorker } from './utils/pushNotification';
import { systemLogger } from './utils/systemLogger';

// Initialize System Error Logger & Diagnostics
systemLogger.init();

// Register Service Worker for Web Push notifications
registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

