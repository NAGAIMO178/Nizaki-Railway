// GAS 側の高宮線: 公開の日時(TK_LAUNCH_AT_MS)になるまで、LINE の運行情報の返信・運行支障のデータに、高宮線を出さない。
// GAS の時計は全員同じなので、時計を作りものにして、前(1ミリ秒前)・ちょうど・後を確かめる。
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { TK_LAUNCH_AT } from '../src/utils/tkLine';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Gas = Record<string, any>;
const source = fs.readFileSync(path.resolve(__dirname, '..', 'gas', 'Code.gs'), 'utf-8');

// 時計を決められる GAS(GAS の中の Date.now() と new Date() が、clock.now を返す)
const PRELUDE = `(function () {
  var RealDate = Date;
  var clock = (globalThis.__clock = { now: 0 });
  function FakeDate() {
    var a = Array.prototype.slice.call(arguments);
    return a.length ? new (Function.prototype.bind.apply(RealDate, [null].concat(a)))() : new RealDate(clock.now);
  }
  FakeDate.now = function () { return clock.now; };
  FakeDate.parse = RealDate.parse;
  FakeDate.UTC = RealDate.UTC;
  FakeDate.prototype = RealDate.prototype;
  globalThis.Date = FakeDate;
})();`;

const loadGas = (stored: Record<string, unknown> | null) => {
  const props = new Map<string, string>();
  if (stored) props.set('OPERATION_DISRUPTIONS', JSON.stringify(stored));
  const replies: { type: string; text: string }[][] = [];
  const ctx: Gas = {
    Logger: { log: () => undefined },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props.get(k) ?? null, setProperty: (k: string, v: string) => void props.set(k, v) }) },
    ContentService: {},
  };
  vm.createContext(ctx);
  vm.runInContext(PRELUDE, ctx);
  vm.runInContext(source, ctx);
  // 外へ出る部分(返信・応答の形)だけを、作りものにする(スクリプトの中の定義を、あとから上書きする)
  ctx.createJsonResponse = (d: unknown) => d;
  ctx.replyToLine = (_t: string, messages: { type: string; text: string }[]) => void replies.push(messages);
  return { gas: ctx, clock: ctx.__clock as { now: number }, replies };
};

const AT = Date.parse(TK_LAUNCH_AT as string);
const FOUR_IDS = ['kanzaki', 'kanzaki_kosoku', 'saichi', 'tsuchiura'];
const FOUR_NAMES = ['神埼線', '神埼高速線', '埼千環状線', '土浦線'];

// 運行支障が出ている状態(4路線のうち2路線 + 高宮線)
const stored = {
  disruptions: {
    saichi_loop: { statusType: 'delayed', maxDelayMinutes: 15, section: '全線', reason: '車両点検' },
    tsuchiura: { statusType: 'suspended', section: '全線', reason: '強風' },
    takamiya: { statusType: 'delayed', maxDelayMinutes: 10, section: '大宮 〜 宇都宮 間', reason: '信号確認' },
  },
  forecasts: [],
};

describe('公開の日時(GAS とアプリで同じ)', () => {
  it('GAS の TK_LAUNCH_AT は、アプリ側の TK_LAUNCH_AT と、同じ文字列(ずれたら落ちる)', () => {
    const { gas } = loadGas(null);
    expect(vm.runInContext('TK_LAUNCH_AT', gas)).toBe(TK_LAUNCH_AT);
    expect(vm.runInContext('TK_LAUNCH_AT_MS', gas)).toBe(AT);
  });

  it('GAS の高宮線の路線ID・名前は、アプリの運行支障の路線(takamiya・高宮線)と同じ', () => {
    const { gas } = loadGas(null);
    expect(vm.runInContext('DISRUPTION_LINE_TK', gas)).toEqual({ id: 'takamiya', name: '高宮線' });
    const app = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'utils', 'disruptionManager.ts'), 'utf-8');
    expect(app).toMatch(/\{ id: 'takamiya', name: '高宮線', code: 'TK'/);
  });
});

describe('公開の 1 ミリ秒前まで: 運行情報は、これまでと同じ4路線。高宮線は、どこにも出ない', () => {
  it.each([['1ミリ秒前', AT - 1], ['1週間前', AT - 7 * 24 * 3600 * 1000]])('%s', (_l, t) => {
    const { gas, clock } = loadGas(stored);
    clock.now = t;
    const s = gas.buildDisruptionSummary();
    expect(s.lines.map((l: { id: string }) => l.id)).toEqual(FOUR_IDS);
    expect(s.lines.map((l: { lineName: string }) => l.lineName)).toEqual(FOUR_NAMES);
    expect(s.lines.map((l: { status: string }) => l.status)).toEqual(['平常運転', '平常運転', '遅延 (最大約15分)', '運転見合わせ']);
    expect(s.summary).toBe('【運行支障情報】埼千環状線(遅延)、土浦線(見合わせ)が発生しております。');
    expect(JSON.stringify(s)).not.toContain('高宮');
    expect(Object.keys(gas.handleGetDisruptions().disruptions).sort()).toEqual(['saichi_loop', 'tsuchiura']);
  });

  it('高宮線だけに支障があっても、返信は「平常」(高宮線の支障を、先に見せない)', () => {
    const { gas, clock, replies } = loadGas({ disruptions: { takamiya: stored.disruptions.takamiya }, forecasts: [] });
    clock.now = AT - 1;
    const s = gas.buildDisruptionSummary();
    expect(s.hasDelay).toBe(false);
    gas.handleOperationStatus('tok');
    expect(replies).toHaveLength(1);
    expect(replies[0][0].text).not.toContain('高宮');
    expect(replies[0][0].text).toContain('現在、神埼鉄道グループ全線でほぼ平常通り運転しております。');
  });

  it('LINE の返信の文面(支障なし・あり)が、これまでと同じ形', () => {
    const none = loadGas(null);
    none.clock.now = AT - 1;
    none.gas.handleOperationStatus('tok');
    expect(none.replies[0][0].text).toBe(
      '🚆【神埼鉄道 運行情報】\n\n・神埼線：平常運転 (現在、全線でほぼ平常通り運転しております。)\n・神埼高速線：平常運転 (現在、全線でほぼ平常通り運転しております。)\n・埼千環状線：平常運転 (現在、全線でほぼ平常通り運転しております。)\n・土浦線：平常運転 (現在、全線でほぼ平常通り運転しております。)\n\n現在、神埼鉄道グループ全線でほぼ平常通り運転しております。\n(列車ごとの数分程度の遅れは、アプリの「列車位置」でご確認いただけます)'
    );
    const some = loadGas(stored);
    some.clock.now = AT - 1;
    some.gas.handleOperationStatus('tok');
    expect(some.replies[0][0].text).toContain('・埼千環状線：遅延 (最大約15分) (現在、全線での車両点検の影響により、最大約15分の遅延が発生しております。)');
    expect(some.replies[0][0].text).toContain('・土浦線：運転見合わせ (現在、全線での強風の影響により、運転を見合わせております。)');
    expect(some.replies[0][0].text).not.toContain('高宮');
  });
});

describe('公開の時刻ちょうどから: 高宮線が、いちばん下に加わる', () => {
  it.each([['ちょうど', AT], ['1時間後', AT + 3600 * 1000]])('%s', (_l, t) => {
    const { gas, clock, replies } = loadGas(stored);
    clock.now = t;
    const s = gas.buildDisruptionSummary();
    expect(s.lines.map((l: { id: string }) => l.id)).toEqual([...FOUR_IDS, 'takamiya']);
    expect(s.lines[4]).toMatchObject({ lineName: '高宮線', status: '遅延 (最大約10分)', message: '現在、大宮 〜 宇都宮 間での信号確認の影響により、最大約10分の遅延が発生しております。' });
    expect(s.summary).toBe('【運行支障情報】埼千環状線(遅延)、土浦線(見合わせ)、高宮線(遅延)が発生しております。');
    expect(Object.keys(gas.handleGetDisruptions().disruptions).sort()).toEqual(['saichi_loop', 'takamiya', 'tsuchiura']);
    gas.handleOperationStatus('tok');
    expect(replies[0][0].text).toContain('・高宮線：遅延 (最大約10分)');
  });

  it('高宮線に支障が無ければ、「平常運転」で載る。4路線の行は、公開の前と同じ', () => {
    const before = loadGas(null);
    before.clock.now = AT - 1;
    const after = loadGas(null);
    after.clock.now = AT;
    const a = before.gas.buildDisruptionSummary();
    const b = after.gas.buildDisruptionSummary();
    expect(b.lines.slice(0, 4)).toEqual(a.lines);
    expect(b.lines[4]).toEqual({ id: 'takamiya', lineName: '高宮線', status: '平常運転', message: '現在、全線でほぼ平常通り運転しております。' });
    expect(b.summary).toBe(a.summary);
  });
});
