import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { UpdatePrompt } from './components/UpdatePrompt';
import './index.css';
import { registerServiceWorker } from './utils/pushNotification';
import { sendAccessPing } from './utils/accountApi';
import { systemLogger } from './utils/systemLogger';

// Initialize System Error Logger & Diagnostics
systemLogger.init();

// Register Service Worker for Web Push notifications
registerServiceWorker();

// アクセス数の記録(端末ごとの乱数IDのみ)
sendAccessPing();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <UpdatePrompt />
  </StrictMode>,
);

