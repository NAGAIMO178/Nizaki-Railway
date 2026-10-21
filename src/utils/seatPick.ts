// 座席選択の、席の選び方(画面の部品から切り出して、テストで確かめる)

const rowsOf = (special: boolean) => (special ? 8 : 10);
export const colsOf = (special: boolean) => (special ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D']);

// 初期選択席: 既定席が埋まっていれば、その号車の最初の空席を選ぶ(満席なら空文字)
export function pickDefaultSeat(occupied: string[], special: boolean): string {
  const preferred = special ? '3A' : '4B';
  if (!occupied.includes(preferred)) return preferred;
  for (let r = 1; r <= rowsOf(special); r++) {
    for (const c of colsOf(special)) {
      if (!occupied.includes(`${r}${c}`)) return `${r}${c}`;
    }
  }
  return '';
}

// 席を押したとき。max=1 は、押した席に置き換える。複数席は、選択/解除。いっぱいのときは、いちばん前に選んだ席が外れる
export function toggleSeat(selected: string[], seat: string, max: number): string[] {
  if (max <= 1) return [seat];
  if (selected.includes(seat)) return selected.filter((s) => s !== seat);
  const next = [...selected, seat];
  return next.length > max ? next.slice(next.length - max) : next;
}

// 列(前の席から)→ 席(A, B, C, D)の順に並べる
export function sortSeats(seats: string[], special: boolean): string[] {
  const cols = colsOf(special);
  const key = (seat: string) => {
    const m = /^(\d+)([A-D])$/.exec(seat);
    return m ? Number(m[1]) * 10 + cols.indexOf(m[2]) : 9999;
  };
  return [...seats].sort((a, b) => key(a) - key(b));
}
