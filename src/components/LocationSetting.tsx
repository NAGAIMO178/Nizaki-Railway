import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MapPin, ShieldCheck, AlertCircle } from 'lucide-react';
import { getLocationPermissionState, requestLocationPermission, watchLocationPermission } from '../utils/locationPermission';
import type { LocationPermissionState } from '../utils/locationPermission';

// 設定の「位置情報」: 許可の状態と、「位置情報を許可する」ボタン(見た目は、通知の項目と同じ)
export const LocationSettingView: React.FC<{ state: LocationPermissionState | null; busy?: boolean; onRequest: () => void }> = ({ state, busy = false, onRequest }) => (
  <section className="space-y-2">
    <div className="flex items-center justify-between px-1">
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-md bg-[#EFE8FA] flex items-center justify-center shrink-0">
          <MapPin className="w-3.5 h-3.5 text-[#5B21B6]" />
        </div>
        <h3 className="text-xs font-black text-[#221C35]">4. 位置情報</h3>
      </div>

      {state === 'granted' ? (
        <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full flex items-center gap-1">
          <ShieldCheck className="w-3 h-3 text-emerald-600" />
          <span>許可されています</span>
        </span>
      ) : state === 'denied' ? (
        <span className="text-[10px] font-bold px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-full flex items-center gap-1">
          <AlertCircle className="w-3 h-3 text-rose-600" />
          <span>許可されていません</span>
        </span>
      ) : state === 'prompt' ? (
        <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full">まだ許可していません</span>
      ) : null}
    </div>

    <div className="bg-white rounded-2xl p-4 border border-[#E6E2EE] shadow-xs space-y-2">
      <button
        type="button"
        onClick={onRequest}
        disabled={busy || state === 'granted'}
        aria-busy={busy}
        className="w-full px-3 py-2 bg-[#5B21B6] hover:bg-[#4C1D95] text-white font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-default disabled:hover:bg-[#5B21B6]"
      >
        <MapPin className="w-3.5 h-3.5 text-[#FBBF24]" />
        <span>位置情報を許可する</span>
      </button>
      {state === 'denied' && <p className="text-[10px] text-[#857D99] leading-relaxed">ブラウザの設定で、このサイトの位置情報を、許可にしてください</p>}
    </div>
  </section>
);

export const LocationSetting: React.FC = () => {
  const [state, setState] = useState<LocationPermissionState | null>(null);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    getLocationPermissionState().then((s) => alive.current && setState(s));
    const stop = watchLocationPermission((s) => alive.current && setState(s));
    return () => {
      alive.current = false;
      stop();
    };
  }, []);

  const request = useCallback(async () => {
    setBusy(true);
    const s = await requestLocationPermission();
    if (!alive.current) return;
    setState(s);
    setBusy(false);
  }, []);

  return <LocationSettingView state={state} busy={busy} onRequest={request} />;
};
