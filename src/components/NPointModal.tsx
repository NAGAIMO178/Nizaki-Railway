import React, { useState } from 'react';
import { X, Award, CreditCard, Sparkles, Gift, Download } from 'lucide-react';
import { PointHistoryItem, UserProfile } from '../types';
import { isLaunched } from '../utils/launch';
import { memberBarcode } from '../utils/memberBarcode';
import { EAN13_MODULES, EAN13_QUIET, ean13DigitCells } from '../utils/ean13';
import { renderMemberCardPng } from '../utils/memberCard';
import { saveImage } from '../utils/imageSave';
import { ImagePreview } from './ImagePreview';

interface NPointModalProps {
  isOpen: boolean;
  onClose: () => void;
  balance: number;
  pointHistory?: PointHistoryItem[];
  currentUser?: UserProfile | null;
  // クラウドが基準の会員は、サーバーの返事を待つので、返事が遅れて届くこともある
  onRedeemCode?: (code: string) => { ok: boolean; message: string } | Promise<{ ok: boolean; message: string }>;
}

// 会員証の EAN-13 の画面での大きさ(モジュールを1とした単位。バーの高さ・ガードの延び・数字の大きさ)
const EAN_BAR_HEIGHT = 34;
const EAN_GUARD_EXTRA = 4;
const EAN_DIGIT_SIZE = 8;
const EAN_VIEW_HEIGHT = EAN_BAR_HEIGHT + EAN_DIGIT_SIZE + 2;

// 会員ランクの英字表記(カードに表示)
const RANK_LABEL_EN: Record<string, string> = { レギュラー: 'REGULAR', ゴールド: 'GOLD', プレミアム: 'PREMIUM' };

export const NPointModal: React.FC<NPointModalProps> = ({
  isOpen,
  onClose,
  balance,
  pointHistory = [],
  currentUser = null,
  onRedeemCode,
}) => {
  const [redeemInput, setRedeemInput] = useState('');
  const [redeemResult, setRedeemResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<string | null>(null); // ダウンロードできない場所(LINE 内など)で、画像を表示する

  if (!isOpen) return null;

  // 公開後は、会員証のバーコードが本物(置ける幅は、カードの内側から余白を引いた分)
  const launched = isLaunched();
  const barcode = launched ? memberBarcode(currentUser?.memberId, 250) : null;

  // 会員証のバーコードを、画像(PNG)として保存する(公開後)
  const handleSaveBarcode = async () => {
    const memberId = currentUser?.memberId;
    if (!memberId || saving) return;
    setSaving(true);
    try {
      setPreview(await saveImage(await renderMemberCardPng(memberId), `nizaki-card-${memberId}.png`));
    } finally {
      setSaving(false);
    }
  };

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onRedeemCode) return;
    const result = await onRedeemCode(redeemInput);
    setRedeemResult(result);
    if (result.ok) setRedeemInput('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/40 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white text-[#221C35] w-full max-w-lg rounded-3xl border border-[#E6E2EE] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="bg-[#F9F8FD] p-4 border-b border-[#E6E2EE] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#FEF3C7] text-[#D97706] flex items-center justify-center font-bold">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] text-[#5B21B6] font-extrabold uppercase tracking-wider">神埼鉄道グループ</div>
              <h3 className="text-base font-black text-[#221C35]">N-POINT デジタル会員証</h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-[#EFE8FA] text-[#6B6380] hover:text-[#221C35] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Card Visual - Matte Lavender Charcoal Premium Card */}
          <div className="bg-gradient-to-br from-[#272233] via-[#211C2B] to-[#181421] text-white rounded-2xl p-5 border border-white/10 shadow-lg relative overflow-hidden">
            {/* Header / Brand & Gold Member Tag */}
            <div className="flex justify-between items-center relative z-10">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center border border-white/10">
                  <CreditCard className="w-3.5 h-3.5 text-[#E2D5B7]" />
                </div>
                <span className="text-xs font-bold tracking-wider text-slate-200 uppercase">
                  NIZAKI Card
                </span>
              </div>
              <span className="text-[10px] tracking-widest font-mono font-semibold text-[#E2D5B7] bg-[#E2D5B7]/10 px-2.5 py-0.5 rounded-full border border-[#E2D5B7]/25">
                {currentUser ? `${RANK_LABEL_EN[currentUser.rank] ?? ''} MEMBER` : 'GUEST'}
              </span>
            </div>

            {/* Main Focus: Clean White Barcode Card Container */}
            <div className="my-5 text-center bg-white p-4 rounded-xl shadow-inner relative z-10">
              {launched ? (
                // 公開後: 会員番号から作った13桁の、本物の EAN-13(JAN)バーコード。下の数字は、バーコードの中身(読み取りアプリで読める)
                barcode && (
                  <svg
                    viewBox={`0 0 ${EAN13_MODULES + EAN13_QUIET * 2} ${EAN_VIEW_HEIGHT}`}
                    shapeRendering="crispEdges"
                    role="img"
                    aria-label={`会員証のバーコード ${barcode.ean.digits}`}
                    className="block mx-auto"
                    style={{ width: (EAN13_MODULES + EAN13_QUIET * 2) * barcode.unit, height: EAN_VIEW_HEIGHT * barcode.unit }}
                  >
                    {barcode.ean.bars.map((b) => (
                      <rect key={b.x} x={EAN13_QUIET + b.x} y={0} width={b.width} height={EAN_BAR_HEIGHT + (b.guard ? EAN_GUARD_EXTRA : 0)} fill="#0F172A" />
                    ))}
                    {ean13DigitCells(barcode.ean, EAN13_QUIET, 1).map((c, i) => (
                      <text key={i} x={c.cx} y={EAN_BAR_HEIGHT + EAN_DIGIT_SIZE} textAnchor="middle" fontSize={EAN_DIGIT_SIZE} fontFamily="ui-monospace, Menlo, Consolas, monospace" fontWeight={600} fill="#0F172A">
                        {c.digit}
                      </text>
                    ))}
                  </svg>
                )
              ) : (
                <div className="h-14 w-full bg-white flex items-center justify-center gap-1 font-mono text-[10px] text-slate-900 tracking-widest select-none overflow-hidden p-1">
                  <div className="w-1.5 h-12 bg-slate-950" />
                  <div className="w-3 h-12 bg-slate-950" />
                  <div className="w-1 h-12 bg-slate-950" />
                  <div className="w-2 h-12 bg-slate-950" />
                  <div className="w-1 h-12 bg-slate-950" />
                  <div className="w-3.5 h-12 bg-slate-950" />
                  <div className="w-1.5 h-12 bg-slate-950" />
                  <div className="w-1 h-12 bg-slate-950" />
                  <div className="w-3 h-12 bg-slate-950" />
                  <div className="w-1.5 h-12 bg-slate-950" />
                  <div className="w-2.5 h-12 bg-slate-950" />
                  <div className="w-1 h-12 bg-slate-950" />
                  <div className="w-3 h-12 bg-slate-950" />
                  <div className="w-1.5 h-12 bg-slate-950" />
                  <div className="w-2 h-12 bg-slate-950" />
                  <div className="w-1 h-12 bg-slate-950" />
                  <div className="w-3.5 h-12 bg-slate-950" />
                  <div className="w-1.5 h-12 bg-slate-950" />
                </div>
              )}
              {!(launched && barcode) && (
                <div className="text-xs font-mono font-bold text-slate-800 mt-2 tracking-widest">
                  {currentUser?.memberId || '未ログイン'}
                </div>
              )}
              {!launched && <div className="text-[9px] text-slate-400 mt-1">※バーコードは表示イメージです（読み取りはできません）</div>}
            </div>

            {/* Card Footer Info */}
            <div className="flex justify-between items-end text-xs relative z-10">
              <div>
                <div className="text-[10px] text-slate-400 font-medium">N-POINT 保有残高</div>
                <div className="text-xl font-mono font-bold text-[#F5F2EB] mt-0.5">
                  {balance.toLocaleString()} <span className="text-xs text-slate-300 font-sans font-normal">pt</span>
                </div>
              </div>

              <div className="text-right">
                <div className="text-[9px] text-slate-400 font-mono">
                  {currentUser ? `神埼ID: ${currentUser.memberId}` : '未ログイン'}
                </div>
                <div className="text-[9px] text-slate-400 font-mono mt-0.5 truncate max-w-[140px]">
                  {currentUser?.email || 'ログインしてご利用ください'}
                </div>
              </div>
            </div>
          </div>

          {barcode && (
            <button
              type="button"
              onClick={handleSaveBarcode}
              disabled={saving}
              className="w-full bg-[#EFE8FA] hover:bg-[#E0D5F5] disabled:opacity-50 text-[#5B21B6] font-bold text-xs py-3 rounded-xl border border-[#DDD6FE] transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Download className="w-4 h-4" />
              <span>{saving ? '作っています…' : '画像で保存'}</span>
            </button>
          )}

          {/* コードでポイントを受け取る */}
          {onRedeemCode && (
            <form onSubmit={handleRedeem} className="bg-[#F9F8FD] p-4 rounded-2xl border border-[#E6E2EE] space-y-2">
              <div className="font-extrabold text-[#221C35] flex items-center gap-1.5 text-xs">
                <Gift className="w-3.5 h-3.5 text-[#5B21B6]" />
                <span>コードでポイントを受け取る</span>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={redeemInput}
                  onChange={(e) => {
                    setRedeemInput(e.target.value);
                    if (redeemResult) setRedeemResult(null);
                  }}
                  placeholder="ポイントコードを入力"
                  className="flex-1 bg-white border border-[#D1C9E3] rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-[#221C35] focus:outline-none focus:border-[#5B21B6] placeholder:text-gray-400"
                />
                <button
                  type="submit"
                  className="bg-[#5B21B6] hover:bg-[#4C1D95] text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-all cursor-pointer shrink-0 shadow-2xs"
                >
                  受け取る
                </button>
              </div>
              {redeemResult && (
                <div className={`text-[11px] font-bold px-1 ${redeemResult.ok ? 'text-emerald-700' : 'text-rose-600'}`}>
                  {redeemResult.message}
                </div>
              )}
            </form>
          )}

          {/* Point History & Benefits */}
          <div className="bg-[#F9F8FD] p-4 rounded-2xl border border-[#E6E2EE] space-y-3">
            <div className="font-extrabold text-[#221C35] flex justify-between items-center text-xs">
              <span>直近のポイント獲得履歴</span>
              <span className="text-[10px] text-[#5B21B6] font-bold bg-[#EFE8FA] px-2 py-0.5 rounded">
                {pointHistory.length > 0 ? `${pointHistory.length}件` : '履歴なし'}
              </span>
            </div>

            {pointHistory.length === 0 ? (
              <div className="p-4 rounded-xl bg-white border border-[#E6E2EE] text-center text-[#6B6380]">
                <Sparkles className="w-5 h-5 mx-auto mb-1.5 text-purple-300" />
                <p className="font-medium text-xs">直近のポイント獲得履歴はありません</p>
                <p className="text-[10px] text-gray-400 mt-0.5">特急予約やスタンプラリー達成でポイントが加算されます</p>
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                {pointHistory.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between items-center p-3 rounded-xl bg-white border border-[#E6E2EE]"
                  >
                    <div>
                      <div className="font-bold text-[#221C35]">{item.title}</div>
                      <div className="text-[10px] text-[#6B6380]">{item.date}</div>
                    </div>
                    <span className={`font-mono font-black text-sm ${item.points < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {item.points < 0 ? '−' : '+'}{Math.abs(item.points).toLocaleString()} pt
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {preview && <ImagePreview url={preview} onClose={() => setPreview(null)} />}
    </div>
  );
};

