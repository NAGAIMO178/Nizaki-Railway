import { describe, expect, it } from 'vitest';
import { CHAT_MINUTES, ACT1, ACT2, ACT3_BEFORE_RESERVATION, ACT3_RESERVED, ACT3_RESERVED_FATHER_NOT_YET, CHAT_WHERE_FATHER_NOT_YET, ACT5, ACT6, CHAT_CHOICES, CLEAR, COMMANDER, EPILOGUE, UI } from '../src/data/eventTareScript';
import { act3ReservedLines, fatherDeparted, minutesToFatherDeparture, commanderUpdates, chatReply, positionText, showsChat, VISIBLE_CHOICES, EXTRA_CHOICES } from '../src/utils/eventTareChat';
import type { EventTareState } from '../src/utils/eventTare';

const base: EventTareState = {
  phase: 'riding',
  orderId: 'EQ-1',
  minutesToFatherArrival: 30,
  minutesToPlayerArrival: 36,
  fatherPosition: { atStation: '松戸' },
  delayMinutes: { player: 0, father: 0 },
  playerTrain: { trainNo: '285091', departAt: new Date(2026, 10, 2, 9, 6), scheduledDepartAt: new Date(2026, 10, 2, 9, 6) },
};
const st = (o: Partial<EventTareState>): EventTareState => ({ ...base, ...o });
const at = (min: number) => new Date(2026, 10, 2, 9, 6 + min); // 発車から min 分後

describe('指令員の位置の文', () => {
  it('10分より先は位置(駅・駅間)、10分以内は「あと約○分」、3分以内は「もうすぐ」、着いたら「降りた」', () => {
    expect(positionText(st({ minutesToFatherArrival: 11 }))).toBe(COMMANDER.atStation('松戸'));
    expect(positionText(st({ minutesToFatherArrival: 11, fatherPosition: { between: ['柏', '土浦'] } }))).toBe(COMMANDER.between('柏', '土浦'));
    expect(positionText(st({ minutesToFatherArrival: 10 }))).toBe(COMMANDER.near(10));
    expect(positionText(st({ minutesToFatherArrival: 4 }))).toBe(COMMANDER.near(4));
    expect(positionText(st({ minutesToFatherArrival: 3 }))).toBe(COMMANDER.soon);
    expect(positionText(st({ minutesToFatherArrival: 1 }))).toBe(COMMANDER.soon);
    // 親父さんが着いたあと: 自分の列車が、まだなら、自分の残りも伝える。自分も着いたら、着いたことだけ
    expect(positionText(st({ minutesToFatherArrival: 0, minutesToPlayerArrival: 30 }))).toBe(COMMANDER.arrivedPlayerLeft(30));
    expect(positionText(st({ minutesToFatherArrival: -5, minutesToPlayerArrival: 25 }))).toBe(COMMANDER.arrivedPlayerLeft(25));
    expect(positionText(st({ minutesToFatherArrival: -35, minutesToPlayerArrival: 0 }))).toBe(COMMANDER.arrived);
    expect(positionText(st({ minutesToFatherArrival: -35, minutesToPlayerArrival: -2 }))).toBe(COMMANDER.arrived);
  });

  it('位置が分からないときは null', () => {
    expect(positionText(st({ minutesToFatherArrival: null, fatherPosition: null }))).toBeNull();
  });
});

describe('指令員の報告(新しいものだけ)', () => {
  it('乗車中でなければ、出さない', () => {
    expect(commanderUpdates(new Set(), st({ phase: 'before_departure' }), at(0))).toEqual([]);
    expect(commanderUpdates(new Set(), st({ phase: 'no_reservation' }), at(0))).toEqual([]);
  });

  it('発車と位置を、1回ずつ出す。同じ状態では、2回目は出ない', () => {
    const known = new Set<string>();
    const first = commanderUpdates(known, st({}), at(1));
    expect(first.map((u) => u.text)).toEqual([COMMANDER.departed, COMMANDER.atStation('松戸')]);
    first.forEach((u) => known.add(u.key));
    expect(commanderUpdates(known, st({}), at(2))).toEqual([]);
  });

  it('位置が変わる・10分以内・3分以内・着いたとき、新しく出す', () => {
    const known = new Set<string>();
    const run = (s: EventTareState, n: number) => {
      const ups = commanderUpdates(known, s, at(n));
      ups.forEach((u) => known.add(u.key));
      return ups.map((u) => u.text);
    };
    run(st({}), 1);
    expect(run(st({ minutesToFatherArrival: 20, fatherPosition: { atStation: '柏' } }), 3)).toEqual([COMMANDER.atStation('柏')]);
    expect(run(st({ minutesToFatherArrival: 8 }), 5)).toEqual([COMMANDER.near(8)]);
    expect(run(st({ minutesToFatherArrival: 7 }), 6)).toEqual([]); // 10分以内は、1回だけ
    expect(run(st({ minutesToFatherArrival: 2 }), 8)).toEqual([COMMANDER.soon]);
    expect(run(st({ minutesToFatherArrival: 0 }), 10)).toEqual([COMMANDER.arrivedPlayerLeft(36)]);
  });

  it('遅れがあるときは、遅れの報告(遅れの分が変わったら、また出す)', () => {
    const known = new Set<string>();
    const a = commanderUpdates(known, st({ delayMinutes: { player: 0, father: 4 } }), at(1)).map((u) => u.text);
    expect(a).toContain(COMMANDER.delay(4));
    const b = commanderUpdates(new Set(['departed', 'pos:at:松戸', 'delay:4']), st({ delayMinutes: { player: 0, father: 6 } }), at(2)).map((u) => u.text);
    expect(b).toEqual([COMMANDER.delay(6)]);
  });

  it('乗客の位置の一言: 松戸(12分後)・柏(20分後)・土浦の手前(あと3分以内)', () => {
    const t = (min: number, left: number | null) => commanderUpdates(new Set(['departed', 'pos:at:松戸']), st({ minutesToPlayerArrival: left }), at(min)).map((u) => u.text);
    expect(t(5, 30)).toEqual([]);
    expect(t(12, 24)).toEqual([COMMANDER.sceneMatsudo]);
    expect(t(20, 16)).toEqual([COMMANDER.sceneKashiwa]);
    expect(t(34, 3)).toEqual([COMMANDER.sceneTsuchiura]);
  });
});

describe('チャット', () => {
  it('最初の3つは、位置・あと何分・どんな人。「…」で、広報・店主', () => {
    expect(VISIBLE_CHOICES.map((c) => c.id)).toEqual(['where', 'minutes', 'who']);
    expect(EXTRA_CHOICES.map((c) => c.id)).toEqual(['pr', 'shop']);
    expect(CHAT_CHOICES.length).toBe(5);
  });

  it('位置と時間の返事は、状態から作る', () => {
    expect(chatReply('where', 1, st({ minutesToFatherArrival: 25 }))).toBe(COMMANDER.atStation('松戸'));
    expect(chatReply('minutes', 1, st({ minutesToFatherArrival: 6, minutesToPlayerArrival: 31 }))).toContain('あと約6分');
    expect(chatReply('minutes', 1, st({ minutesToFatherArrival: 6, minutesToPlayerArrival: 31 }))).toContain('あと約31分');

  });

  it('固定の返事: 2回目は2つ目、3回目以降は最後のまま', () => {
    const [a, b] = CHAT_CHOICES.find((c) => c.id === 'who')!.replies;
    expect(chatReply('who', 1, base)).toBe(a);
    expect(chatReply('who', 2, base)).toBe(b);
    expect(chatReply('who', 3, base)).toBe(b);
    expect(chatReply('who', 9, base)).toBe(b);
  });

  it('広報への連絡は、発車前と乗車中で、返事が変わる', () => {
    const before = chatReply('pr', 1, st({ phase: 'before_departure' }));
    const riding = chatReply('pr', 1, st({ phase: 'riding' }));
    expect(before).not.toBe(riding);
    expect(before).toContain('発車の5分前まで');
  });

  it('チャットを出すのは、発車前と乗車中だけ', () => {
    expect(showsChat('before_departure')).toBe(true);
    expect(showsChat('riding')).toBe(true);
    ['not_joined', 'no_reservation', 'arrived', 'cleared'].forEach((p) => expect(showsChat(p as EventTareState['phase'])).toBe(false));
  });
});

describe('台本', () => {
  const all = [...ACT1, ...ACT2, ...ACT3_BEFORE_RESERVATION, ...ACT3_RESERVED, ...ACT5, ...ACT6, ...EPILOGUE].map((l) => l.text).concat(CLEAR.delivered, UI.cardTagline);
  it('日付を書かない(無期限)。「受付開始」と書かない', () => {
    all.forEach((t) => {
      expect(t, t).not.toMatch(/\d+月\d+日|\d{4}年|11\/1/);
      expect(t, t).not.toContain('受付開始');
    });
  });
  it('どの文も、空ではない', () => {
    all.forEach((t) => expect(t.trim().length).toBeGreaterThan(0));
  });
});

describe('親父さんの列車が、発車前か、発車後か', () => {
  // 自分の発車が約38分後・親父さんの発車が約8分後 → 親父さんが土浦に着くまで 45分
  const before = st({ phase: 'before_departure', minutesToFatherArrival: 45, minutesToPlayerArrival: 75, fatherPosition: null });
  const after = st({ phase: 'before_departure', minutesToFatherArrival: 20, minutesToPlayerArrival: 50, fatherPosition: { between: ['松戸', '柏'] } });

  it('位置が出ていなければ発車前、出ていれば発車ずみ(着いたあとも発車ずみ)', () => {
    expect(fatherDeparted(before)).toBe(false);
    expect(fatherDeparted(after)).toBe(true);
    expect(fatherDeparted(st({ minutesToFatherArrival: -3, fatherPosition: null }))).toBe(true);
  });

  it('「親父さんは、今どこ？」: 発車前は「まだ東京にいる。あと約○分で発車」、発車後は位置', () => {
    expect(minutesToFatherDeparture(before)).toBe(9);
    expect(chatReply('where', 1, before)).toBe(CHAT_WHERE_FATHER_NOT_YET(9));
    expect(chatReply('where', 1, before)).toContain('まだ東京にいる');
    expect(chatReply('where', 1, after)).toBe(COMMANDER.between('松戸', '柏'));
  });

  it('発車の直前でも、0分とは言わない(1分以上)', () => {
    expect(minutesToFatherDeparture(st({ minutesToFatherArrival: 37, fatherPosition: null }))).toBe(1);
  });

  it('第3幕(予約したあと): 発車前は1行にまとめる。発車後は、今の文のまま', () => {
    expect(act3ReservedLines(after)).toBe(ACT3_RESERVED);
    expect(act3ReservedLines(before)).toBe(ACT3_RESERVED_FATHER_NOT_YET);
    const t = (ls: { text: string }[]) => ls.map((l) => l.text);
    expect(t(ACT3_RESERVED)).toContain('もう出発している。同じ列車には乗れない');
    expect(t(ACT3_RESERVED_FATHER_NOT_YET)).not.toContain('もう出発している。同じ列車には乗れない');
    expect(t(ACT3_RESERVED_FATHER_NOT_YET)).toContain('同じ列車には乗れない。1本、遅れて追いかける形になる');
    expect(ACT3_RESERVED_FATHER_NOT_YET.length).toBe(ACT3_RESERVED.length);
  });
});

describe('親父さんが先に着いたあとの返事: 自分の残りも伝える', () => {
  const fatherFirst = st({ minutesToFatherArrival: 0, minutesToPlayerArrival: 28 });
  const bothArrived = st({ phase: 'arrived', minutesToFatherArrival: -40, minutesToPlayerArrival: 0 });

  it('「あと何分で土浦？」: 親父さんが先に着いた・自分はまだ・自分も着いた', () => {
    expect(chatReply('minutes', 1, fatherFirst)).toBe(CHAT_MINUTES.fatherGonePlayerLeft(28));
    expect(chatReply('minutes', 1, fatherFirst)).toContain('あと約28分');
    expect(chatReply('minutes', 1, fatherFirst)).toContain('もう降りている');
    expect(chatReply('minutes', 1, bothArrived)).toBe(CHAT_MINUTES.fatherGone);
    // 親父さんが着く前は、これまでどおり、両方
    expect(chatReply('minutes', 1, st({ minutesToFatherArrival: 6, minutesToPlayerArrival: 31 }))).toBe(CHAT_MINUTES.both(6, 31));
  });

  it('「親父さんは、今どこ？」: 親父さんが着いたあとも、自分の残りを伝える。自分も着いたら、着いたことだけ', () => {
    expect(chatReply('where', 1, fatherFirst)).toBe(COMMANDER.arrivedPlayerLeft(28));
    expect(chatReply('where', 1, bothArrived)).toBe(COMMANDER.arrived);
  });

  it('司令員のログ: 親父さんが着いたとき、自分の列車がまだなら、残りも出す', () => {
    const out = commanderUpdates(new Set(['departed']), fatherFirst, at(20)).map((u) => u.text);
    expect(out).toContain(COMMANDER.arrivedPlayerLeft(28));
  });
});
