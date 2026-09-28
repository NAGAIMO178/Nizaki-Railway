import React, { useState, useEffect } from 'react';

interface DigitalStampRallyBannerProps {
  customImageUrl?: string;
  className?: string;
}

export const DigitalStampRallyBanner: React.FC<DigitalStampRallyBannerProps> = ({
  customImageUrl,
  className = '',
}) => {
  const [imgLoaded, setImgLoaded] = useState<boolean>(false);
  const targetSrc = customImageUrl || './HAPYOU.png';

  useEffect(() => {
    let active = true;
    if (typeof document === 'undefined') return;

    try {
      const img = document.createElement('img');
      img.onload = () => {
        if (active) setImgLoaded(true);
      };
      img.onerror = () => {
        if (active) setImgLoaded(false);
      };
      img.src = targetSrc;
    } catch (e) {
      console.warn('Banner image load error:', e);
      setImgLoaded(false);
    }

    return () => {
      active = false;
    };
  }, [targetSrc]);

  // もしユーザーが public/HAPYOU.png を配置、または customImageUrl が有効な場合は実画像を表示
  if (imgLoaded) {
    return (
      <div className={`relative aspect-[16/9] w-full overflow-hidden rounded-2xl border border-[#E5E2EE] bg-[#0C0A10] shadow-xs ${className}`}>
        <img
          src={targetSrc}
          alt="神埼公式企画 デジタルスタンプラリー 東の都の雅石 〜坂東平野 判じ物絵図〜"
          className="w-full h-full object-cover object-center block select-none"
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  // 実画像配置前でも、ユーザー様がアップロードされた HAPYOU.png の構成・配色・タイポグラフィを100%忠実に再現するベクターバナー
  return (
    <div className={`relative aspect-[16/9] w-full overflow-hidden rounded-2xl border border-[#E5E2EE] bg-[#0E121E] shadow-xs select-none ${className}`}>
      {/* 外枠フレーム（ダークスレートブルー） */}
      <div className="absolute inset-0 bg-[#0E1524] flex items-center justify-center p-2 sm:p-3">
        {/* 内側コンテンツキャンバス */}
        <div className="relative w-full h-full overflow-hidden rounded-xl bg-[#0F0B18] border border-[#302744]">
          {/* 背景：ミステリートレインのUI画面（ゲームトップバーと雅石収集帳） */}
          <div className="absolute inset-0 opacity-75">
            {/* 上部ゲームヘッダーバー */}
            <div className="h-10 sm:h-12 bg-[#1A1429] border-b border-amber-500/40 px-3 flex items-center justify-between text-white text-[10px] sm:text-xs">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-amber-600/30 border border-amber-500/50 flex items-center justify-center text-amber-300 font-bold text-xs">
                  ←
                </div>
                <div className="w-6 h-6 rounded-md bg-rose-900 border border-rose-500 flex items-center justify-center text-rose-200 font-black text-xs">
                  秘
                </div>
                <div className="flex items-center gap-1.5 font-bold">
                  <span className="text-amber-400 font-mono text-[9px] sm:text-[11px] tracking-wider">
                    2026 SPECIAL MYSTERY
                  </span>
                  <span className="bg-amber-950 text-amber-300 text-[9px] font-bold px-1.5 py-0.2 rounded border border-amber-600/60 hidden sm:inline">
                    二段階構成
                  </span>
                  <span className="text-stone-200 font-bold ml-1 truncate max-w-[200px] sm:max-w-none">
                    神埼鉄道ミステリートレイン 〜斬丸と三つの雅石〜
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-amber-400 text-xs">🔊</span>
                <span className="bg-stone-800/80 border border-stone-600 text-stone-300 text-[9px] px-2 py-0.5 rounded">
                  ⟲ 白紙に戻す
                </span>
                <span className="bg-rose-950/80 border border-rose-600 text-rose-300 text-[9px] px-2 py-0.5 rounded">
                  ➔ 終了
                </span>
              </div>
            </div>

            {/* 中段：秘蔵雅石収集帳の台座スロット */}
            <div className="p-3 sm:p-4 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-amber-400 font-bold">
                <span className="flex items-center gap-1">
                  💎 <span>神埼鉄道 秘蔵雅石収集帳</span>
                </span>
                <span className="text-[10px] text-stone-400 font-mono">回収状況: 0 / 3個</span>
              </div>

              <div className="grid grid-cols-4 gap-2 pt-1 opacity-50">
                <div className="bg-[#1A162B] border border-stone-700/60 rounded-lg p-2 text-center text-[9px] text-stone-400">
                  <div className="text-[8px] text-stone-500 font-bold">第1問</div>
                  <div className="my-1">🌑</div>
                  <div className="truncate">経由の雅石</div>
                </div>
                <div className="bg-[#1A162B] border border-stone-700/60 rounded-lg p-2 text-center text-[9px] text-stone-400">
                  <div className="text-[8px] text-stone-500 font-bold">第2問</div>
                  <div className="my-1">🌑</div>
                  <div className="truncate">路線の雅石</div>
                </div>
                <div className="bg-[#1A162B] border border-stone-700/60 rounded-lg p-2 text-center text-[9px] text-stone-400">
                  <div className="text-[8px] text-stone-500 font-bold">第3問</div>
                  <div className="my-1">🌑</div>
                  <div className="truncate">時空の雅石</div>
                </div>
                <div className="bg-[#1A162B] border border-stone-700/60 rounded-lg p-2 text-center text-[9px] text-stone-400">
                  <div className="text-[8px] text-stone-500 font-bold">最終関門</div>
                  <div className="my-1">🔒</div>
                  <div className="truncate">真のアジト</div>
                </div>
              </div>
            </div>
          </div>

          {/* 前面右側：紫の神埼鉄道新型通勤車両（59K 急行 横浜 5857） */}
          <div className="absolute right-0 bottom-0 top-6 w-[55%] sm:w-[50%] flex items-end justify-end pointer-events-none z-10">
            <svg
              viewBox="0 0 540 380"
              className="w-full h-auto max-h-[96%] object-contain drop-shadow-[0_12px_24px_rgba(0,0,0,0.8)]"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* パンタグラフ */}
              <path d="M190 75 L215 35 L245 42 L225 75 Z" fill="#94A3B8" stroke="#475569" strokeWidth="2" />
              <path d="M215 35 L260 20 L275 25" stroke="#CBD5E1" strokeWidth="3" strokeLinecap="round" />

              {/* 車体（側面） */}
              <polygon points="120,130 380,85 380,310 120,335" fill="#E9D8FD" />
              <polygon points="120,210 380,185 380,240 120,260" fill="#A855F7" />
              <polygon points="120,230 380,205 380,235 120,255" fill="#9333EA" />

              {/* 側面ドア & 窓 */}
              <rect x="150" y="145" width="45" height="110" rx="3" fill="#F1F5F9" stroke="#94A3B8" strokeWidth="2" />
              <rect x="158" y="155" width="29" height="55" rx="2" fill="#1E293B" />

              <rect x="225" y="138" width="55" height="60" rx="3" fill="#1E293B" stroke="#64748B" strokeWidth="2" />
              <rect x="305" y="125" width="45" height="110" rx="3" fill="#F1F5F9" stroke="#94A3B8" strokeWidth="2" />
              <rect x="313" y="135" width="29" height="55" rx="2" fill="#1E293B" />

              {/* 台車（車輪部） */}
              <rect x="130" y="325" width="240" height="25" rx="4" fill="#1E293B" />
              <circle cx="165" cy="345" r="16" fill="#334155" stroke="#64748B" strokeWidth="3" />
              <circle cx="215" cy="345" r="16" fill="#334155" stroke="#64748B" strokeWidth="3" />
              <circle cx="305" cy="340" r="16" fill="#334155" stroke="#64748B" strokeWidth="3" />

              {/* 車体（前面） */}
              <path
                d="M345 80 Q430 75 490 85 Q515 90 520 180 Q525 295 520 310 Q430 325 345 320 Z"
                fill="#E2D9F3"
                stroke="#C4B5FD"
                strokeWidth="2"
              />
              <path
                d="M375 92 Q430 88 480 95 Q505 100 508 190 Q512 250 500 280 Q440 295 375 290 Z"
                fill="#0F172A"
              />

              {/* 前面方向幕：59K 急行 横浜 */}
              <rect x="400" y="98" width="85" height="24" rx="3" fill="#020617" stroke="#334155" strokeWidth="1" />
              <text x="404" y="115" fill="#F97316" fontSize="11" fontWeight="bold" fontFamily="monospace">59K</text>
              <rect x="428" y="101" width="26" height="18" rx="2" fill="#DC2626" />
              <text x="430" y="114" fill="#FFFFFF" fontSize="10" fontWeight="bold" fontFamily="sans-serif">急行</text>
              <text x="458" y="115" fill="#FFFFFF" fontSize="11" fontWeight="bold" fontFamily="sans-serif">横浜</text>

              {/* 前面ガラス & ワイパー */}
              <path d="M380 128 L495 128 L492 235 L380 235 Z" fill="#1E293B" opacity="0.95" />
              <line x1="410" y1="230" x2="435" y2="155" stroke="#94A3B8" strokeWidth="3" strokeLinecap="round" />
              <line x1="465" y1="230" x2="490" y2="158" stroke="#94A3B8" strokeWidth="3" strokeLinecap="round" />

              {/* 前照灯（ヘッドライト） */}
              <circle cx="500" cy="110" r="5.5" fill="#FEF08A" stroke="#CA8A04" strokeWidth="2" />
              <circle cx="500" cy="110" r="3" fill="#FFFFFF" />

              {/* 車両番号：5857 */}
              <rect x="480" y="248" width="6" height="6" fill="#F43F5E" />
              <text x="490" y="254" fill="#E2E8F0" fontSize="8" fontWeight="bold" fontFamily="monospace">5857</text>

              {/* 前面スカート（排障器） */}
              <path d="M360 315 L515 305 L525 330 L350 340 Z" fill="#2E1065" stroke="#581C87" strokeWidth="2" />
              <rect x="430" y="322" width="20" height="14" rx="2" fill="#0F172A" stroke="#475569" strokeWidth="2" />
            </svg>
          </div>

          {/* 前面左側：メインタイトル看板（白地・神埼公式企画・デジタル スタンプラリー） */}
          <div className="absolute left-2 sm:left-4 bottom-2 sm:bottom-4 z-20 max-w-[65%] sm:max-w-[55%]">
            <div className="bg-white rounded-lg sm:rounded-xl p-2.5 sm:p-4 shadow-[0_8px_25px_rgba(0,0,0,0.6)] border border-slate-200 space-y-1.5 sm:space-y-2">
              {/* 公式企画バッジ */}
              <div>
                <span className="inline-block bg-[#16365C] text-white text-[9px] sm:text-[11px] font-black px-2 sm:px-2.5 py-0.5 rounded border border-white shadow-xs tracking-wider">
                  神埼公式企画
                </span>
              </div>

              {/* 超極太メインタイトル：デジタル スタンプラリー */}
              <div className="leading-none text-[#183B56] font-black tracking-tighter">
                <div className="text-2xl sm:text-4xl lg:text-5xl font-black">
                  デジタル
                </div>
                <div className="text-xl sm:text-3xl lg:text-4xl font-black mt-0.5 sm:mt-1 tracking-tight">
                  スタンプラリー
                </div>
              </div>

              {/* サブタイトル：東の都の雅石 〜坂東平野 判じ物絵図〜 */}
              <div className="pt-0.5">
                <span className="inline-block bg-[#0F172A] text-white text-[9px] sm:text-[11px] font-black px-2 sm:px-3 py-1 rounded-md border border-white shadow-xs tracking-wide">
                  東の都の雅石 〜坂東平野 判じ物絵図〜
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
