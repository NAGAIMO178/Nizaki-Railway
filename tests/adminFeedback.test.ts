// 管理者コンソールの「ご意見」: 一覧(新しい順のまま)・返信先ありの印・LINEで返信・状態の切り替え
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FEEDBACK_REPLY_MAX, normalizeFeedbackRows } from '../src/components/AdminFeedbackPanel';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf-8');

describe('一覧の整え(normalizeFeedbackRows)', () => {
  it('サーバーが返す項目を、そのまま使う(順番も、そのまま)。LINE のIDの入れ物は無い', () => {
    const rows = normalizeFeedbackRows([
      { id: 'f000000000002', receivedAt: '2026-11-20 08:12', entry: 'app', screen: '時刻表', kind: 'バグ・不具合', message: '新しい', wantReply: true, codeState: 'matched', canReply: true, env: '版: 4.7.0', status: '未対応', repliedAt: '' },
      { id: 'f000000000001', receivedAt: '2026-11-19 10:00', entry: 'form', screen: 'ホーム', kind: '要望・感想', message: '古い', wantReply: false, codeState: '', canReply: false, env: '', status: '対応済', repliedAt: '2026-11-19 12:00', lineUserId: 'Uxxxx' },
    ]);
    expect(rows.map((r) => r.id)).toEqual(['f000000000002', 'f000000000001']);
    expect(rows[0]).toMatchObject({ canReply: true, wantReply: true, entry: 'app', status: '未対応' });
    expect(rows[1].canReply).toBe(false);
    expect(Object.keys(rows[0])).not.toContain('lineUserId');
    expect(Object.keys(rows[1])).not.toContain('lineUserId');
  });
  it('形の合わないものは捨てる。配列でなければ空', () => {
    expect(normalizeFeedbackRows([null, 5, 'x', {}, { id: 1 }, { id: 'f1' }]).map((r) => r.id)).toEqual(['f1']);
    [undefined, null, {}, 'x'].forEach((v) => expect(normalizeFeedbackRows(v)).toEqual([]));
  });
});

describe('つなぎ込み', () => {
  const src = read('src/components/AdminFeedbackPanel.tsx');
  it('管理者コンソールに「ご意見」のタブ(通知のタブと同じ作り)', () => {
    const m = read('src/components/AdminConsoleModal.tsx');
    expect(m).toContain("{activeTab === 'feedback' && <AdminFeedbackPanel />}");
    expect(m).toContain("onClick={() => setActiveTab('feedback')}");
    expect(m).toContain('<span>ご意見</span>');
  });
  it('一覧・返信・状態の3つの action。管理トークンを付けて送る。返信は 1000 文字まで', () => {
    ['adminListFeedback', 'adminReplyFeedback', 'adminSetFeedbackStatus'].forEach((a) => expect(src).toContain(a));
    expect(src).toContain('adminToken: getAdminToken()');
    expect(FEEDBACK_REPLY_MAX).toBe(1000);
    expect(src).toContain('{ id: r.id, text }');
    expect(src).toContain("status: r.status === '対応済' ? '未対応' : '対応済'");
  });
  it('返信の欄と「LINEで返信」は、返信先ありの意見だけ。利用環境は、折りたたみ。サーバーの失敗の文は、そのまま出す', () => {
    expect(src).toContain('{r.canReply && (');
    expect(src).toContain('LINEで返信');
    expect(src).toContain('<details>');
    expect(src).toContain('res.message || ');
  });
});
