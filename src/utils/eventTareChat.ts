// 公開記念イベントの、指令員の報告(状態から作る文)と、チャットの返事。画面の文は、src/data/eventTareScript.ts にある。
// すべて、決まった文を選ぶだけ(AIではない)。
import { CHAT_CHOICES, CHAT_MINUTES, CHAT_PR_RIDING, CHAT_WHERE_NO_POSITION, COMMANDER } from '../data/eventTareScript';
import type { ChatChoice } from '../data/eventTareScript';
import type { EventTareState } from './eventTare';

export const NEAR_MINUTES = 10; // これ以内なら、「あと約○分」
export const SOON_MINUTES = 3; // これ以内なら、「もうすぐ」

// 乗客の位置の一言を出す目安(発車から何分後か。めぐりの東京発は、どの便も同じ走り方)
export const SCENE_MATSUDO_MIN = 12;
export const SCENE_KASHIWA_MIN = 20;

// 親父さんの列車の位置の文(いまの状態から)。位置が分からないときは null
export const positionText = (s: EventTareState): string | null => {
  const m = s.minutesToFatherArrival;
  if (m !== null) {
    if (m <= 0) return COMMANDER.arrived;
    if (m <= SOON_MINUTES) return COMMANDER.soon;
    if (m <= NEAR_MINUTES) return COMMANDER.near(m);
  }
  const p = s.fatherPosition;
  if (p?.atStation) return COMMANDER.atStation(p.atStation);
  if (p?.between) return COMMANDER.between(p.between[0], p.between[1]);
  return null;
};

// 指令員の報告のうち、新しく出すもの。known は、すでに出した報告の印(呼ぶたびに、新しい印を足して返す)
export interface CommanderUpdate {
  key: string;
  text: string;
}

const stageKey = (s: EventTareState): string | null => {
  const m = s.minutesToFatherArrival;
  if (m !== null) {
    if (m <= 0) return 'arrived';
    if (m <= SOON_MINUTES) return 'soon';
    if (m <= NEAR_MINUTES) return 'near';
  }
  const p = s.fatherPosition;
  if (p?.atStation) return `at:${p.atStation}`;
  if (p?.between) return `between:${p.between[0]}-${p.between[1]}`;
  return null;
};

export const commanderUpdates = (known: ReadonlySet<string>, s: EventTareState, now: Date): CommanderUpdate[] => {
  const out: CommanderUpdate[] = [];
  const add = (key: string, text: string) => {
    if (!known.has(key)) out.push({ key, text });
  };
  if (s.phase !== 'riding' && s.phase !== 'arrived') return out;
  add('departed', COMMANDER.departed);
  const delay = s.delayMinutes.father > 0 ? s.delayMinutes.father : s.delayMinutes.player;
  if (delay > 0) add(`delay:${delay}`, COMMANDER.delay(delay));
  const key = stageKey(s);
  const text = positionText(s);
  if (key && text) add(`pos:${key}`, text);
  // 場面の一言(乗客の位置)
  const dep = s.playerTrain?.departAt;
  if (dep && s.phase === 'riding') {
    const elapsed = (now.getTime() - dep.getTime()) / 60000;
    const left = s.minutesToPlayerArrival;
    if (left !== null && left > 0 && left <= SOON_MINUTES) add('scene:土浦', COMMANDER.sceneTsuchiura);
    else if (elapsed >= SCENE_KASHIWA_MIN) add('scene:柏', COMMANDER.sceneKashiwa);
    else if (elapsed >= SCENE_MATSUDO_MIN) add('scene:松戸', COMMANDER.sceneMatsudo);
  }
  return out;
};

// チャットの選択肢(最初に見える3つと、「…」で出る2つ)
export const VISIBLE_CHOICES: ChatChoice[] = CHAT_CHOICES.slice(0, 3);
export const EXTRA_CHOICES: ChatChoice[] = CHAT_CHOICES.slice(3);

// n 回目に押したときの返事。同じ選択肢を2回押したら、2つ目。3回目以降は、最後の返事のまま
export const chatReply = (choice: ChatChoice['id'], nth: number, s: EventTareState): string => {
  const def = CHAT_CHOICES.find((c) => c.id === choice)!;
  const pick = (list: string[]) => list[Math.min(Math.max(nth, 1), list.length) - 1];
  switch (choice) {
    case 'where':
      return positionText(s) ?? CHAT_WHERE_NO_POSITION;
    case 'minutes': {
      const f = s.minutesToFatherArrival;
      const p = s.minutesToPlayerArrival;
      if (f !== null && f <= 0) return CHAT_MINUTES.fatherGone;
      if (f === null || p === null) return CHAT_MINUTES.noTrain;
      return CHAT_MINUTES.both(f, Math.max(p, 0));
    }
    case 'pr':
      return pick(s.phase === 'riding' || s.phase === 'arrived' ? CHAT_PR_RIDING : def.replies);
    default:
      return pick(def.replies);
  }
};

// チャットの選択肢を出す段階(発車前と乗車中)
export const showsChat = (phase: EventTareState['phase']): boolean => phase === 'before_departure' || phase === 'riding';
