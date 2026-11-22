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
import { startPcLayout } from './utils/pcLayout';
import { surveyParamFromSearch } from './utils/survey';

// QR乗車券を読み取って開いたリンク(公開後だけ)は、検札用の画面だけを出す
const TicketCheckPage = lazy(() => import('./components/TicketCheckPage'));
// お知らせのリンク(?survey=アンケートID)を開いたときは、アンケートに答える画面だけを出す
const SurveyPage = lazy(() => import('./components/SurveyPage'));

const Root = () => {
  const [ticketToken, setTicketToken] = useState(() => ticketRouteToken());
  useEffect(() => {
    const onHashChange = () => setTicketToken(ticketRouteToken());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  const surveyId = surveyParamFromSearch();
  if (surveyId !== null) {
    return (
      <LazyBoundary fallback={<div className="text-center text-xs text-[#857D99] py-10">読み込み中…</div>}>
        <SurveyPage surveyId={surveyId} />
      </LazyBoundary>
    );
  }
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

// PC 表示(日時が来るまで隠す)の印を、描くより先に付ける
startPcLayout();

// 画面のファイルが取れなかったとき(更新の直後など)、1回だけ自動で再読み込みする
installPreloadErrorReload();

// Initialize System Error Logger & Diagnostics
systemLogger.init();

// 検札・アンケートの画面だけを開いたときは、アプリ本体の起動処理(通知の登録・アクセス記録)は行わない
if (!ticketRouteToken() && surveyParamFromSearch() === null) {
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

