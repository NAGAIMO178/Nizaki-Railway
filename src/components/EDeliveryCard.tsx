import React from 'react';
import { UtensilsCrossed, Sparkles, ChevronRight, ShoppingBag, Clock, CheckCircle, ShieldCheck } from 'lucide-react';
import { ActiveOrder } from '../types';
import hidaMatsutakeImg from '../assets/images/item_hida_matsutake_1785713876633.jpg';
import craftbeerImg from '../assets/images/item_craftbeer_1785713851365.jpg';
import parfaitImg from '../assets/images/item_parfait_1785713839429.jpg';

interface EDeliveryCardProps {
  onOpenBookingModal: () => void;
  activeOrder?: ActiveOrder | null;
}

export const EDeliveryCard: React.FC<EDeliveryCardProps> = ({
  onOpenBookingModal,
  activeOrder,
}) => {
  return (
    <div className="bg-[#1A1B2F]/85 backdrop-blur-md rounded-2xl p-4 text-white shadow-xl border border-[#A78BFA]/20 relative overflow-hidden group">
      {/* Visual Ambient Glow */}
      <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-[#3B82F6]/15 rounded-full blur-2xl pointer-events-none group-hover:bg-[#3B82F6]/25 transition-all duration-500" />

      {/* Header Tag */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-gradient-to-r from-[#A78BFA] to-[#3B82F6] text-[#0F111E] shadow-sm flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-[#0F111E]" />
            E-DELIVERY （エキップ座席配送）
          </span>
          <span className="text-[10px] font-bold text-[#C4B5FD] bg-[#0F111E] px-2 py-0.5 rounded-md border border-[#A78BFA]/25">
            特急めぐり限定
          </span>
        </div>

        <span className="text-[10px] text-[#FBBF24] font-extrabold flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5" />
          温かいままお届け
        </span>
      </div>

      {/* Card Title & Service Description */}
      <div className="mt-2.5">
        <h3 className="text-base sm:text-lg font-black tracking-tight text-white leading-snug">
          特急「めぐり」の「めぐシート」へ <br />
          <span className="bg-gradient-to-r from-[#C4B5FD] via-[#FBBF24] to-[#60A5FA] bg-clip-text text-transparent">
            厳選の極上駅弁・クラフトビールを直送！
          </span>
        </h3>
        <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
          ご乗車予定の「めぐシート（1号車）」や指定席へ、沿線の有名老舗が手がける出来立て駅弁やドリンクを乗務員が直接お届けします。
        </p>
      </div>

      {/* Active Order Banner if existing */}
      {activeOrder ? (
        <div className="mt-3 bg-[#0F111E]/80 backdrop-blur-md rounded-xl p-3 border border-[#A78BFA]/30 text-xs">
          <div className="flex items-center justify-between text-[#C4B5FD] font-bold mb-1">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-[#A78BFA] animate-pulse" />
              座席配送の予約中：{activeOrder.trainName}
            </span>
            <span className="text-[10px] bg-[#A78BFA] text-[#0F111E] px-2 py-0.5 rounded-full font-black">
              {activeOrder.status === 'confirmed' ? '受付完了' : '調達中'}
            </span>
          </div>
          <div className="text-white font-extrabold flex justify-between items-baseline mt-1">
            <span>
              {activeOrder.carNo}号車 {activeOrder.seatNo}番席 ({activeOrder.items.length}点)
            </span>
            <span className="text-[#FBBF24] font-mono text-sm font-black">
              ¥{activeOrder.totalPrice.toLocaleString()}
            </span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            配送予定駅：{activeOrder.deliveryStation}発車後すぐ
          </div>
        </div>
      ) : (
        /* Featured Food Preview Strip */
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="bg-[#0F111E]/80 rounded-xl p-2 border border-white/5 text-center">
            <img
              src={hidaMatsutakeImg}
              alt=""
              referrerPolicy="no-referrer"
              className="w-full h-12 object-cover rounded-lg mb-1 block text-[0px]"
              onError={(e) => {
                const target = e.currentTarget;
                target.onerror = null;
                target.src = 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=400&q=80';
              }}
            />
            <div className="text-[10px] font-bold text-white truncate">A5和牛・松茸御膳</div>
            <div className="text-[9px] text-[#FBBF24] font-mono font-bold">¥2,850</div>
          </div>

          <div className="bg-[#0F111E]/80 rounded-xl p-2 border border-white/5 text-center">
            <img
              src={craftbeerImg}
              alt=""
              referrerPolicy="no-referrer"
              className="w-full h-12 object-cover rounded-lg mb-1 block text-[0px]"
              onError={(e) => {
                const target = e.currentTarget;
                target.onerror = null;
                target.src = 'https://images.unsplash.com/photo-1608270586620-248524c67de9?auto=format&fit=crop&w=400&q=80';
              }}
            />
            <div className="text-[10px] font-bold text-white truncate">クラフト生ビール極</div>
            <div className="text-[9px] text-[#FBBF24] font-mono font-bold">¥1,250</div>
          </div>

          <div className="bg-[#0F111E]/80 rounded-xl p-2 border border-white/5 text-center">
            <img
              src={parfaitImg}
              alt=""
              referrerPolicy="no-referrer"
              className="w-full h-12 object-cover rounded-lg mb-1 block text-[0px]"
              onError={(e) => {
                const target = e.currentTarget;
                target.onerror = null;
                target.src = 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=400&q=80';
              }}
            />
            <div className="text-[10px] font-bold text-white truncate">抹茶極パフェ</div>
            <div className="text-[9px] text-[#FBBF24] font-mono font-bold">¥650</div>
          </div>
        </div>
      )}

      {/* Required Prominent CTA Button: 特急券・駅弁を予約する */}
      <div className="mt-4">
        <button
          onClick={onOpenBookingModal}
          className="w-full bg-gradient-to-r from-[#F59E0B] via-[#D97706] to-[#B45309] hover:brightness-110 text-slate-950 font-black text-sm py-3.5 px-4 rounded-xl shadow-lg border border-[#FBBF24]/80 flex items-center justify-center gap-2 transform active:scale-98 transition-all group"
        >
          <UtensilsCrossed className="w-4.5 h-4.5 text-slate-950 group-hover:rotate-12 transition-transform" />
          {/* Required exact text */}
          <span className="text-base tracking-wide font-black text-slate-950">特急券・駅弁を予約する</span>
          <ChevronRight className="w-5 h-5 text-slate-950 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    </div>
  );
};
