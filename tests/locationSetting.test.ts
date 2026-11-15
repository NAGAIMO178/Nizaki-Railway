// 設定の「位置情報」: 許可の状態の3通り(+調べられない環境)の表示・ボタンで許可の画面を求める・拒否のときだけ案内
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/accountApi', () => ({ callGas: vi.fn(async () => ({ status: 'success' })) }));

import { LocationSettingView } from '../src/components/LocationSetting';
import { getLocationPermissionState, requestLocationPermission } from '../src/utils/locationPermission';
import { forgetPosition, recentPosition } from '../src/utils/recentPosition';

const root = path.resolve(__dirname, '..');
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), 'utf-8');
const view = (state: 'granted' | 'prompt' | 'denied' | 'unknown' | null, busy = false) =>
  renderToStaticMarkup(React.createElement(LocationSettingView, { state, busy, onRequest: () => undefined }));

const GUIDE = 'ブラウザの設定で、このサイトの位置情報を、許可にしてください';

describe('表示(状態ごと)', () => {
  it('許可されている: 「許可されています」。ボタンは押せない。案内は出ない', () => {
    const html = view('granted');
    expect(html).toContain('許可されています');
    expect(html).not.toContain('まだ許可していません');
    expect(html).not.toContain(GUIDE);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*位置情報を許可する/);
  });

  it('まだ許可していない: 「まだ許可していません」。ボタンは押せる。案内は出ない', () => {
    const html = view('prompt');
    expect(html).toContain('まだ許可していません');
    expect(html).not.toContain(GUIDE);
    expect(html).not.toContain('disabled=""');
    expect(html).toContain('位置情報を許可する');
  });

  it('許可されていない(拒否済み): 「許可されていません」と、ボタンの下に、1行の案内', () => {
    const html = view('denied');
    expect(html).toContain('許可されていません');
    expect(html).toContain(GUIDE);
    expect(html.indexOf(GUIDE)).toBeGreaterThan(html.indexOf('位置情報を許可する'));
    expect(html.split(GUIDE)).toHaveLength(2);
  });

  it('状態が分からない(調べられない環境・調べている最中)は、状態を断定せず、ボタンだけ。案内は出ない', () => {
    for (const st of ['unknown', null] as const) {
      const html = view(st);
      expect(html).toContain('位置情報を許可する');
      expect(html).not.toContain('許可されています');
      expect(html).not.toContain('まだ許可していません');
      expect(html).not.toContain('許可されていません');
      expect(html).not.toContain(GUIDE);
      expect(html).not.toContain('disabled=""');
    }
  });

  it('確認している最中は、ボタンを押せない', () => {
    expect(view('prompt', true)).toContain('disabled=""');
  });

  it('設定の「4. 位置情報」として、通知の項目(3.)のあと・管理者用のボタンの前に置いてある', () => {
    const src = read('src', 'components', 'SettingsTab.tsx');
    expect(view('prompt')).toContain('4. 位置情報');
    const i = src.indexOf('<LocationSetting />');
    expect(i).toBeGreaterThan(src.indexOf('3. Web Push API'));
    expect(i).toBeLessThan(src.indexOf('管理者用設定・システム診断を開くボタン'));
  });
});

describe('状態を調べる(permissions)', () => {
  const setNav = (v: unknown) => Object.defineProperty(globalThis, 'navigator', { value: v, configurable: true });
  afterEach(() => Reflect.deleteProperty(globalThis, 'navigator'));

  it('granted / prompt / denied は、そのまま', async () => {
    for (const st of ['granted', 'prompt', 'denied'] as const) {
      setNav({ permissions: { query: async (d: { name: string }) => (d.name === 'geolocation' ? { state: st } : { state: 'x' }) } });
      expect(await getLocationPermissionState()).toBe(st);
    }
  });

  it('使えない・失敗・知らない値のときは、unknown(断定しない)', async () => {
    setNav({});
    expect(await getLocationPermissionState()).toBe('unknown');
    setNav({ permissions: {} });
    expect(await getLocationPermissionState()).toBe('unknown');
    setNav({ permissions: { query: async () => { throw new Error('x'); } } });
    expect(await getLocationPermissionState()).toBe('unknown');
    setNav({ permissions: { query: async () => ({ state: 'maybe' }) } });
    expect(await getLocationPermissionState()).toBe('unknown');
  });
});

describe('ボタンを押したとき', () => {
  let calls = 0;
  const setNav = (v: unknown) => Object.defineProperty(globalThis, 'navigator', { value: v, configurable: true });
  beforeEach(() => {
    calls = 0;
    forgetPosition();
  });
  afterEach(() => {
    forgetPosition();
    Reflect.deleteProperty(globalThis, 'navigator');
  });

  it('許可の画面を求める呼び出し(getCurrentPosition)が走り、許可されたら granted。取れた位置は、最寄り駅の使い回し用に覚える', async () => {
    setNav({
      geolocation: { getCurrentPosition: (ok: (p: unknown) => void) => { calls++; ok({ coords: { latitude: 35.6815, longitude: 139.7675 } }); } },
      permissions: { query: async () => ({ state: 'prompt' }) },
    });
    expect(await requestLocationPermission()).toBe('granted');
    expect(calls).toBe(1);
    expect(recentPosition()).toEqual({ lat: 35.6815, lng: 139.7675 });
  });

  it('調べられない環境でも、許可されたら granted', async () => {
    setNav({ geolocation: { getCurrentPosition: (ok: (p: unknown) => void) => { calls++; ok({ coords: { latitude: 35.9, longitude: 139.6 } }); } } });
    expect(await requestLocationPermission()).toBe('granted');
  });

  it('拒否済みのときは、画面は出ず(失敗で返る)、denied のまま。位置は覚えない', async () => {
    setNav({
      geolocation: { getCurrentPosition: (_ok: unknown, ng: () => void) => { calls++; ng(); } },
      permissions: { query: async () => ({ state: 'denied' }) },
    });
    expect(await requestLocationPermission()).toBe('denied');
    expect(calls).toBe(1);
    expect(recentPosition()).toBeNull();
  });

  it('画面を閉じただけ(許可も拒否もしない)のときは、prompt のまま。調べられない環境では、unknown のまま', async () => {
    setNav({
      geolocation: { getCurrentPosition: (_ok: unknown, ng: () => void) => ng() },
      permissions: { query: async () => ({ state: 'prompt' }) },
    });
    expect(await requestLocationPermission()).toBe('prompt');
    setNav({ geolocation: { getCurrentPosition: (_ok: unknown, ng: () => void) => ng() } });
    expect(await requestLocationPermission()).toBe('unknown');
  });

  it('位置情報が使えない端末でも、落ちない', async () => {
    setNav({});
    expect(await requestLocationPermission()).toBe('unknown');
  });
});

describe('守ること', () => {
  it('位置は、画面に出さない・サーバーへ送らない・保存しない(設定の部品と、状態の部品)', () => {
    for (const f of [['src', 'components', 'LocationSetting.tsx'], ['src', 'utils', 'locationPermission.ts']]) {
      const src = read(...f);
      expect(src, f.join('/')).not.toMatch(/localStorage|sessionStorage|indexedDB|fetch\(|callGas|latitude|longitude|coords/);
    }
  });

  it('版 4.6.2・お知らせ5行(5行目が位置情報)・showAfter そのまま', () => {
    expect(JSON.parse(read('package.json')).version).toBe('4.6.2');
    const notes = JSON.parse(read('release-notes.json')) as { notes: string[]; showAfter: string };
    expect(notes.notes).toHaveLength(5);
    expect(notes.notes[4]).toBe('設定から、位置情報を許可できるようにしました');
    expect(notes.showAfter).toBe('2026-11-20T08:00:00+09:00');
  });
});
