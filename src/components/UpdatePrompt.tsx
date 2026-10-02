import React, { useEffect, useState } from 'react';

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

export const UpdatePrompt: React.FC = () => {
  const [notes, setNotes] = useState<string[] | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (typeof data.version === 'string' && data.version !== __APP_VERSION__) {
          setNotes(Array.isArray(data.notes) ? data.notes : []);
        }
      } catch {
        // オフラインや開発環境(version.jsonなし)では何もしない
      }
    };

    check();
    const timer = setInterval(check, CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (notes === null) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-[#131a27] p-6 text-white shadow-2xl">
        <h2 className="text-center text-lg font-bold">新しいバージョンが利用できます</h2>
        <p className="mt-4 text-sm leading-relaxed">
          最新の機能を反映するには更新が必要です。「今すぐ更新」ボタンを押してください。
        </p>
        {notes.length > 0 && (
          <div className="mt-4">
            <div className="text-xs text-white/50">更新内容</div>
            <ul className="mt-1 space-y-0.5 text-sm">
              {notes.map((note) => (
                <li key={note}>・{note}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="cursor-pointer rounded-md bg-[#5B21B6] px-4 py-2 text-sm font-bold text-white hover:bg-[#4C1D95]"
          >
            今すぐ更新
          </button>
        </div>
      </div>
    </div>
  );
};
