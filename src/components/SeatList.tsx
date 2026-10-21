import React from 'react';
import { ActiveOrder } from '../types';
import { deliveryBySeat, seatDisplayName, splitSeats } from '../utils/seatUtils';

// 複数席の一覧。席が多いと縦に伸びるので、高さを抑えて、中でスクロールできるようにする。usedSeats の席は、利用済みの見た目にする
export const SeatList: React.FC<{ seatNo: string; usedSeats?: string[]; className?: string }> = ({ seatNo, usedSeats = [], className = '' }) => (
  <span className={`flex flex-wrap gap-1 max-h-[4.75rem] overflow-y-auto ${className}`}>
    {splitSeats(seatNo).map((seat) => {
      const used = usedSeats.includes(seat);
      return (
        <span
          key={seat}
          className={`font-mono font-bold text-[11px] px-1.5 py-0.5 rounded border ${
            used ? 'bg-[#F4F3F8] text-[#857D99] border-[#E6E2EE] line-through' : 'bg-white text-[#5B21B6] border-[#D1C9E3]'
          }`}
        >
          {seatDisplayName(seat)}
        </span>
      );
    })}
  </span>
);

// 複数席の予約で、どの席に何を届けるか(席ごとの一覧。多いときは中でスクロール)
export const DeliverySeatList: React.FC<{ order: Pick<ActiveOrder, 'seatNo' | 'items' | 'itemSeats'>; className?: string }> = ({ order, className = '' }) => {
  if (splitSeats(order.seatNo).length < 2) return null;
  const rows = deliveryBySeat(order);
  if (rows.length === 0) return null;
  return (
    <div className={`max-h-28 overflow-y-auto space-y-1 ${className}`}>
      {rows.map((row) => (
        <div key={row.seat} className="flex items-baseline gap-2 text-[11px]">
          <span className="font-mono font-bold text-[#5B21B6] shrink-0">{seatDisplayName(row.seat)}</span>
          <span className="text-[#221C35] min-w-0 break-words">{row.items.map((it) => `${it.name}×${it.quantity}`).join('、')}</span>
        </div>
      ))}
    </div>
  );
};
