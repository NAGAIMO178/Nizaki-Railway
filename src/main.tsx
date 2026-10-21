import {StrictMode, lazy, useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { UpdatePrompt } from './components/UpdatePrompt';
import './index.css';
import { registerServiceWorker } from './utils/pushNotification';
import { sendAccessPing } from './utils/accountApi';
import { systemLogger } from './utils/systemLogger';
import { installPreloadErrorReload } from './utils/preloadReload';
import { LazyBoundary } from './components/LazyBoundary';
import { ticketRouteToken } from './utils/ticketToken';

// QR乗車券を読み取って開いたリンク(公開後だけ)は、検札用の画面だけを出す
const TicketCheckPage = lazy(() => import('./components/TicketCheckPage'));

const Root = () => {
  const [ticketToken, setTicketToken] = useState(() => ticketRouteToken());
  useEffect(() => {
    const onHashChange = () => setTicketToken(ticketRouteToken());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  if (ticketToken) {
    return (
      <LazyBoundary fallback={<div className="text-center text-xs text-[#857D99] py-10">読み込み中…</div>}>
        <TicketCheckPage token={ticketToken} />
      </LazyBoundary>
    );
  }
  return (
    <>
      <App />
      <UpdatePrompt />
    </>
  );
};

// 画面のファイルが取れなかったとき(更新の直後など)、1回だけ自動で再読み込みする
installPreloadErrorReload();

// Initialize System Error Logger & Diagnostics
systemLogger.init();

// 検札の画面だけを開いたときは、アプリ本体の起動処理(通知の登録・アクセス記録)は行わない
if (!ticketRouteToken()) {
  // Register Service Worker for Web Push notifications
  registerServiceWorker();

  // アクセス数の記録(端末ごとの乱数IDのみ)
  sendAccessPing();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);

