/**
 * ==============================================================================
 * 神埼鉄道 統合型 LINE Bot & Webhook バックエンド (Google Apps Script)
 * 
 * 【対応機能】
 * 1. 特急券・めぐシート 予約登録＆本人認証付き照会（予約台帳シート）
 * 2. リアルタイム運行情報・遅延案内（神埼鉄道API連携）
 * 3. スタンプラリー制覇合言葉 ログ記録のみ（クーポン表示はLINE公式の応答メッセージ機能側で実行）
 * ==============================================================================
 */

// ★ LINE Developers「Messaging API設定」タブの「チャネルアクセストークン（長期）」を貼り付け
const CHANNEL_ACCESS_TOKEN = '★ここにLINEのチャネルアクセストークンを貼り付け★';

// シート名定義
const SHEET_RESERVATIONS = '予約台帳';
const SHEET_COUPON_LOGS = 'クーポン発行ログ';

const CONFIG = {
  ACCESS_TOKEN: (CHANNEL_ACCESS_TOKEN && !CHANNEL_ACCESS_TOKEN.includes('★'))
    ? CHANNEL_ACCESS_TOKEN
    : (PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN') || ''),
  LINE_REPLY_URL: 'https://api.line.me/v2/bot/message/reply',
  LINE_PUSH_URL: 'https://api.line.me/v2/bot/message/push',
  
  // スタンプラリー コース定義（スプレッドシート記録用）
  STAMP_KEYWORDS: {
    '初級クリア済み': { courseId: 'beginner', courseName: '【初級制覇】都市圏イージー', reward: 'デリバリー1品20%OFF' },
    '中級クリア済み': { courseId: 'intermediate', courseName: '【中級制覇】中都市ステップ', reward: '特急乗車料金10%OFF' },
    '上級クリア済み': { courseId: 'advanced', courseName: '【上級制覇】ディープ神埼線', reward: '1日フリー乗車券' },
    // ミステリートレイン『斬丸と三つの雅石』完全制覇コード(src/components/MysteryTrainApp.jsxのCLEAR_CODEと一致させること)
    // ※LINE公式の応答メッセージには引換コード「dish20」を記載する(アプリのデリバリー画面で1品20%OFFとして受理される)
    'MYSTERY_2026_MASHIN_CLEAR': { courseId: 'mashin_mystery', courseName: '【ミステリー制覇】斬丸と三つの雅石', reward: 'デリバリー1品20%OFF' },
    // 神埼鉄路奇譚『消えた試運転列車の謎』完全制覇コード(src/data/mysteryTrainData.tsのMYSTERY_CLEAR_COUPON_CODEと一致させること)
    // ※LINE公式の応答メッセージには引換コード「GIVE300」を記載する(アプリのN-POINT画面で+300ptとして受理される。この端末でアカウントごとに1回のみ)
    'NIZAKI_MYSTERY_CLEAR_2026': { courseId: 'kaitan_mystery', courseName: '【ミステリー制覇】消えた試運転列車の謎', reward: 'N-POINT +300pt' }
  }
};

/**
 * Webhook受信 (POSTリクエスト)
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return createJsonResponse({ status: 'error', message: 'No post data' });
    }

    const json = JSON.parse(e.postData.contents);

    // ① Webアプリからの特急予約の登録・取消(ログイン証が必要)
    if (json.action === 'createReservation') {
      return handleCreateReservation(json.sessionToken, json.order);
    }
    if (json.action === 'cancelReservation') {
      return handleCancelReservation(json.sessionToken, json.orderId);
    }

    // ①.5 神埼ID 会員認証まわり（LINE経由の新規登録／ログイン）
    if (json.action === 'login') {
      return handleLogin(json.email, json.password);
    }
    if (json.action === 'deleteAccount') {
      return handleDeleteAccount(json.email, json.password);
    }
    if (json.action === 'startLineVerification') {
      return handleStartLineVerification();
    }
    if (json.action === 'verifyLineAndRegister') {
      return handleVerifyLineAndRegister(json.email, json.password, json.token, json.code, json.name);
    }

    // ①.6 運行情報・遅延指令(アプリ管理者コンソール・LINE応答で共有する単一の情報源)
    if (json.action === 'getDisruptions') {
      return handleGetDisruptions();
    }
    if (json.action === 'setDisruptions') {
      return handleSetDisruptions(json.disruptions, json.forecasts, json.adminToken);
    }

    // ② LINE Messaging APIからのWebhookイベント
    if (json.events && Array.isArray(json.events)) {
      for (let i = 0; i < json.events.length; i++) {
        const event = json.events[i];
        if (event.type === 'message' && event.message.type === 'text') {
          handleLineMessage(event);
        }
      }
      return createJsonResponse({ status: 'success' });
    }

    return createJsonResponse({ status: 'ignored' });
  } catch (err) {
    Logger.log('doPost Error: ' + err.toString());
    return createJsonResponse({ status: 'error', message: err.toString() });
  }
}

/**
 * 簡易ヘルスチェック (GETリクエスト)
 */
function doGet(e) {
  return ContentService.createTextOutput("神埼鉄道 LINE Bot & 予約台帳システムは正常に稼働しています。");
}

/**
 * 業務データ用スプレッドシートを取得
 * ※Webアプリ経由(外部からのHTTPリクエスト)ではSpreadsheetApp.getActiveSpreadsheet()が
 *   常にnullを返すため、初回作成時のIDをスクリプトプロパティに保存して毎回同じ
 *   スプレッドシートを参照するようにする(でないと呼び出すたびに新しい使い捨て
 *   スプレッドシートが作られてしまい、書き込んだデータが二度と読み出せなくなる)
 */
function getDataSpreadsheet() {
  const props = PropertiesService.getScriptProperties();
  const savedId = props.getProperty('DATA_SPREADSHEET_ID');

  if (savedId) {
    try {
      return SpreadsheetApp.openById(savedId);
    } catch (err) {
      Logger.log('保存済みスプレッドシートIDが無効です。新規作成します: ' + err.toString());
    }
  }

  const ss = SpreadsheetApp.create('神埼鉄道_業務データ');
  props.setProperty('DATA_SPREADSHEET_ID', ss.getId());
  return ss;
}

/**
 * LINEメッセージの振り分け処理
 */
function handleLineMessage(event) {
  const replyToken = event.replyToken;
  const userId = event.source ? event.source.userId : 'unknown';
  const text = event.message.text.trim();

  // 0. 神埼ID新規登録用の合言葉判定(最優先)
  const normalizedToken = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (normalizedToken.length === 6 && CacheService.getScriptCache().get('line_pending_' + normalizedToken)) {
    handleLineVerificationMessage(replyToken, userId, normalizedToken);
    return;
  }

  // 1. スタンプラリー合言葉の判定 (「初級クリア済み」など)
  // ★ GAS側からは返信せず、スプレッドシートに記録するだけ（返信・クーポン表示はLINE公式の応答メッセージ機能に委ねる）
  const stampCourse = CONFIG.STAMP_KEYWORDS[text];
  if (stampCourse) {
    logCouponIssue(userId, stampCourse);
    return; // ← GASからは返信しない
  }

  // 2. 特急券予約照会 (「予約」「チケット」「特急券」「NZ-」など)
  if (text.includes('予約') || text.includes('チケット') || text.includes('特急券') || text.toUpperCase().startsWith('NZ-') || text.toUpperCase().startsWith('EQ-')) {
    handleReservationInquiry(replyToken, userId, text);
    return;
  }

  // 3. 運行情報の照会 (「運行」「遅延」「ダイヤ」など)
  if (text.includes('運行') || text.includes('遅延') || text.includes('ダイヤ') || text.includes('動いてる') || text.includes('止まってる')) {
    handleOperationStatus(replyToken);
    return;
  }

  // それ以外のメッセージ（スタンプラリー以外の通常トークなど）には何も返信せずスルー
}

/**
 * 特急券予約照会ロジック
 */
function handleReservationInquiry(replyToken, userId, text) {
  try {
    const ss = getDataSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_RESERVATIONS);
    
    if (!sheet) {
      replyToLine(replyToken, [{
        type: 'text',
        text: '現在予約台帳の準備中です。Webアプリ上の予約完了画面をご確認ください。'
      }]);
      return;
    }

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) {
      replyToLine(replyToken, [{
        type: 'text',
        text: '現在ご予約データが見つかりません。神埼鉄道アプリよりご予約をお願いいたします。'
      }]);
      return;
    }

    const headers = data[0];
    const idIndex = headers.indexOf('予約番号');
    const userIndex = headers.indexOf('LINE_USER_ID');
    const trainIndex = headers.indexOf('列車名');
    const seatIndex = headers.indexOf('座席番号');
    const totalIndex = headers.indexOf('合計金額');
    const statusIndex = headers.indexOf('ステータス');

    // 検索: ユーザーID または 送信された予約番号
    const matched = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const rowOrderId = idIndex !== -1 ? String(row[idIndex]) : '';
      const rowUserId = userIndex !== -1 ? String(row[userIndex]) : '';

      // キャンセル済み、または到着時刻を過ぎた予約は対象外
      if (statusIndex !== -1 && String(row[statusIndex]) === 'キャンセル') continue;
      if (isReservationRowExpired(headers, row)) continue;

      if ((userId !== 'unknown' && rowUserId === userId) || (rowOrderId && text.toUpperCase().includes(rowOrderId))) {
        matched.push({
          orderId: rowOrderId,
          train: trainIndex !== -1 ? row[trainIndex] : '特急めぐり号',
          seat: seatIndex !== -1 ? row[seatIndex] : '指定席',
          total: totalIndex !== -1 ? row[totalIndex] : '¥0'
        });
      }
    }

    if (matched.length === 0) {
      replyToLine(replyToken, [{
        type: 'text',
        text: 'お客様のLINEアカウントに紐づく有効なご予約が見つかりませんでした。\n予約番号（例: NZ-1234）を直接入力してお試しください。'
      }]);
      return;
    }

    const latest = matched[matched.length - 1];
    const replyText = 
      `🎫【ご予約確認】\n` +
      `予約番号: ${latest.orderId}\n` +
      `ご乗車列車: ${latest.train}\n` +
      `指定座席: ${latest.seat}\n` +
      `お支払い額: ${typeof latest.total === 'number' ? '¥' + latest.total.toLocaleString() : latest.total}\n\n` +
      `ご乗車の際は車内改札またはアプリ画面をご提示ください。`;

    replyToLine(replyToken, [{ type: 'text', text: replyText }]);

  } catch (err) {
    Logger.log('予約照会エラー: ' + err.toString());
    replyToLine(replyToken, [{ type: 'text', text: '予約照会処理中にエラーが発生しました。' }]);
  }
}

/**
 * 予約台帳の1行が、到着時刻を過ぎているか(日付・時刻が無い古い行は期限なし扱い)
 */
function isReservationRowExpired(headers, row) {
  const dateIdx = headers.indexOf('予約日');
  const depIdx = headers.indexOf('出発時刻');
  const arrIdx = headers.indexOf('到着時刻');
  if (dateIdx === -1 || arrIdx === -1) return false;
  const toText = function (v, pattern) {
    return v instanceof Date ? Utilities.formatDate(v, 'Asia/Tokyo', pattern) : String(v || '');
  };
  const date = toText(row[dateIdx], 'yyyy-MM-dd');
  const arrival = toText(row[arrIdx], 'HH:mm');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}$/.test(arrival)) return false;
  let ts = new Date(date + 'T' + (arrival.length === 4 ? '0' + arrival : arrival) + ':00+09:00').getTime();
  const departure = depIdx === -1 ? '' : toText(row[depIdx], 'HH:mm');
  if (/^\d{1,2}:\d{2}$/.test(departure)) {
    const toMin = function (t) { const p = t.split(':'); return Number(p[0]) * 60 + Number(p[1]); };
    if (toMin(arrival) < toMin(departure)) ts += 24 * 60 * 60 * 1000;
  }
  return Date.now() >= ts;
}

/**
 * 運行情報の配信
 */
function handleOperationStatus(replyToken) {
  const summary = buildDisruptionSummary();
  const statusText = "🚆【神埼鉄道 運行情報】\n\n" +
    summary.lines.map(l => `・${l.lineName}：${l.status} (${l.message})`).join('\n') +
    "\n\n" + summary.summary;

  replyToLine(replyToken, [{ type: 'text', text: statusText }]);
}

// アプリの管理者コンソール・LINE応答が共有する運行支障情報の保存キー
const DISRUPTIONS_PROPERTY_KEY = 'OPERATION_DISRUPTIONS';

const DISRUPTION_LINE_DEFS = [
  { id: 'kanzaki', name: '神埼線' },
  { id: 'kanzaki_kosoku', name: '神埼高速線' },
  { id: 'saichi', name: '埼千環状線' },
  { id: 'tsuchiura', name: '土浦線' },
];

/**
 * 保存済みの運行支障・運行予報データを取得(無ければ空)
 */
function getStoredDisruptionsData() {
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty(DISRUPTIONS_PROPERTY_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const now = Date.now();
      // 自動解除の時刻を過ぎた運行支障・期限切れの予報は返さない(LINE返信・アプリ共通)
      const disruptions = {};
      const stored = parsed.disruptions || {};
      Object.keys(stored).forEach(function (key) {
        const d = stored[key];
        if (!d.expiresAtTimestamp || now < d.expiresAtTimestamp) disruptions[key] = d;
      });
      const forecasts = (parsed.forecasts || []).filter(function (f) {
        return f.isActive !== false && (!f.expiresAtTimestamp || now < f.expiresAtTimestamp);
      });
      return { disruptions: disruptions, forecasts: forecasts };
    } catch (err) {
      Logger.log('運行支障データの解析に失敗: ' + err.toString());
    }
  }
  return { disruptions: {}, forecasts: [] };
}

/**
 * ① アプリ・LINEからの運行支障情報取得
 */
function handleGetDisruptions() {
  const data = getStoredDisruptionsData();
  return createJsonResponse({ status: 'success', disruptions: data.disruptions, forecasts: data.forecasts });
}

/**
 * ② 管理者コンソールからの運行支障情報の保存
 */
function handleSetDisruptions(disruptions, forecasts, adminToken) {
  // 管理トークン(スクリプトプロパティ ADMIN_TOKEN)が未設定、または一致しなければ書き換えさせない
  if (!isValidAdminToken(adminToken)) {
    return createJsonResponse({ status: 'error', message: '管理トークンが正しくないか、サーバーに設定されていません。' });
  }
  const props = PropertiesService.getScriptProperties();
  const data = { disruptions: disruptions || {}, forecasts: forecasts || [] };
  props.setProperty(DISRUPTIONS_PROPERTY_KEY, JSON.stringify(data));
  return createJsonResponse({ status: 'success' });
}

/**
 * 保存済みデータから、LINE返信・アプリ双方で使える運行情報サマリーを生成
 */
function buildDisruptionSummary() {
  const disruptions = getStoredDisruptionsData().disruptions;
  let hasDelay = false;
  const delayedNames = [];

  const lines = DISRUPTION_LINE_DEFS.map(function (def) {
    const d = disruptions[def.id] || (def.id === 'saichi' ? disruptions['saichi_loop'] : null);
    let status = '平常運転';
    let message = '現在、全線でほぼ平常通り運転しております。';

    if (d && d.statusType && d.statusType !== 'normal') {
      hasDelay = true;
      if (d.statusType === 'suspended') {
        status = '運転見合わせ';
        delayedNames.push(def.name + '(見合わせ)');
      } else if (d.statusType === 'partially_suspended') {
        status = '一部運休';
        delayedNames.push(def.name + '(一部運休)');
      } else {
        status = d.maxDelayMinutes > 0 ? ('遅延 (最大約' + d.maxDelayMinutes + '分)') : '一部遅延';
        delayedNames.push(def.name + '(遅延)');
      }

      if (d.useCustomMessage && d.customMessage && d.customMessage.trim()) {
        message = d.customMessage.trim();
      } else if (d.statusType === 'suspended') {
        message = '現在、' + (d.section || '全線') + 'での' + (d.reason || '安全確認') + 'の影響により、運転を見合わせております。' + (d.durationUntil ? ('（' + d.durationUntil + '再開見込み）') : '');
      } else if (d.statusType === 'partially_suspended') {
        message = '現在、' + (d.reason || '安全確認') + 'の影響により、' + (d.section || '全線') + 'で一部列車の運転を取り止めております。';
      } else {
        message = '現在、' + (d.section || '全線') + 'での' + (d.reason || '安全確認') + 'の影響により、最大約' + (d.maxDelayMinutes || 5) + '分の遅延が発生しております。' + (d.durationUntil ? ('（' + d.durationUntil + '復旧見込み）') : '');
      }
    }

    return { id: def.id, lineName: def.name, status: status, message: message };
  });

  const summary = hasDelay
    ? ('【運行支障情報】' + delayedNames.join('、') + 'が発生しております。')
    : '現在、神埼鉄道グループ全線でほぼ平常通り運転しております。';

  return { hasDelay: hasDelay, summary: summary, lines: lines };
}

/**
 * LINE Messaging API 返信実行
 */
function replyToLine(replyToken, messages) {
  const token = CONFIG.ACCESS_TOKEN;
  if (!token || token.includes('★')) {
    return;
  }

  UrlFetchApp.fetch(CONFIG.LINE_REPLY_URL, {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    payload: JSON.stringify({
      replyToken: replyToken,
      messages: messages
    }),
    muteHttpExceptions: true
  });
}

/**
 * スプレッドシート「クーポン発行ログ」への自動記録（※GASからの自動返信はなし）
 */
function logCouponIssue(userId, course) {
  try {
    const ss = getDataSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_COUPON_LOGS);

    if (!sheet) {
      sheet = ss.insertSheet(SHEET_COUPON_LOGS);
      sheet.appendRow([
        '発行日時',
        'LINE_USER_ID',
        'コースID',
        'コース名',
        '特典内容',
        'ステータス'
      ]);
      sheet.getRange('A1:F1').setBackground('#06C755').setFontColor('#FFFFFF').setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    const timestamp = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
    sheet.appendRow([
      timestamp,
      userId,
      course.courseId,
      course.courseName,
      course.reward,
      'キーワード受信'
    ]);
  } catch (err) {
    Logger.log('クーポンログ記録エラー: ' + err.toString());
  }
}

// 予約台帳の列(この順で作成。既存の台帳には不足している列だけ後ろへ追加する)
const RESERVATION_HEADERS = [
  '予約日時', '予約番号', 'LINE_USER_ID', '列車名', '号車', '座席番号', '席種',
  '乗車駅', '降車駅', '合計金額', 'ステータス', '会員ID', '予約日', '出発時刻', '到着時刻'
];

function getOrCreateReservationsSheet() {
  const ss = getDataSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_RESERVATIONS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_RESERVATIONS);
    sheet.appendRow(RESERVATION_HEADERS);
    sheet.getRange(1, 1, 1, RESERVATION_HEADERS.length).setBackground('#5B21B6').setFontColor('#FFFFFF').setFontWeight('bold');
    sheet.setFrozenRows(1);
  } else {
    // 古い台帳(11列)には、不足している見出しを後ろへ追加する
    const lastCol = Math.max(sheet.getLastColumn(), 1);
    const existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    RESERVATION_HEADERS.forEach(function (h) {
      if (existing.indexOf(h) === -1) {
        const col = existing.filter(function (v) { return v !== ''; }).length + 1;
        sheet.getRange(1, col).setValue(h);
        existing[col - 1] = h;
      }
    });
  }
  return sheet;
}

function limitText(value, max) {
  return String(value === undefined || value === null ? '' : value).slice(0, max);
}

/**
 * 予約の登録・更新(予約番号が同じ行があれば更新する)
 */
function handleCreateReservation(sessionToken, order) {
  const memberId = verifySessionToken(sessionToken);
  if (!memberId) {
    return createJsonResponse({ status: 'error', message: 'ログインの有効期限が切れています。もう一度ログインしてください。' });
  }
  if (!order || typeof order !== 'object' || !/^[A-Za-z0-9-]{3,40}$/.test(String(order.orderId || ''))) {
    return createJsonResponse({ status: 'error', message: '予約内容が正しくありません。' });
  }

  const member = findMemberById(memberId);
  if (!member) {
    return createJsonResponse({ status: 'error', message: '会員情報が見つかりません。' });
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return createJsonResponse({ status: 'error', message: '混み合っています。しばらくしてからもう一度お試しください。' });
  }

  try {
    const sheet = getOrCreateReservationsSheet();
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const col = {};
    headers.forEach(function (h, i) { col[h] = i; });

    const values = {
      '予約日時': Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss'),
      '予約番号': String(order.orderId),
      'LINE_USER_ID': member.lineUserId || '',
      '列車名': limitText(order.trainName, 60),
      '号車': Number(order.carNo) || '',
      '座席番号': limitText(order.seatNo, 10),
      '席種': limitText(order.seatType, 20),
      '乗車駅': limitText(order.boardingStation, 30),
      '降車駅': limitText(order.destinationStation, 30),
      '合計金額': Math.max(0, Math.min(Number(order.totalPrice) || 0, 1000000)),
      'ステータス': '予約確定',
      '会員ID': memberId,
      '予約日': limitText(order.reservedDate, 10),
      '出発時刻': limitText(order.departureTime, 5),
      '到着時刻': limitText(order.arrivalTime, 5)
    };

    let targetRow = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][col['予約番号']]) === values['予約番号']) {
        if (String(data[i][col['会員ID']]) !== memberId) {
          return createJsonResponse({ status: 'error', message: 'この予約番号は使用できません。' });
        }
        targetRow = i + 1;
        break;
      }
    }

    const row = headers.map(function (h) { return values[h] !== undefined ? values[h] : ''; });
    if (targetRow === -1) {
      sheet.appendRow(row);
      targetRow = sheet.getLastRow();
    } else {
      sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
    }
    // 日付・時刻は文字列のまま保存する(シートが日付型に変換しないように)
    ['予約日', '出発時刻', '到着時刻'].forEach(function (h) {
      const c = headers.indexOf(h);
      if (c !== -1) {
        const cell = sheet.getRange(targetRow, c + 1);
        cell.setNumberFormat('@');
        cell.setValue(values[h]);
      }
    });

    return createJsonResponse({ status: 'success' });
  } finally {
    lock.releaseLock();
  }
}

/**
 * 予約の取消(行は残し、ステータスを「キャンセル」にする)
 */
function handleCancelReservation(sessionToken, orderId) {
  const memberId = verifySessionToken(sessionToken);
  if (!memberId) {
    return createJsonResponse({ status: 'error', message: 'ログインの有効期限が切れています。もう一度ログインしてください。' });
  }

  const sheet = getDataSpreadsheet().getSheetByName(SHEET_RESERVATIONS);
  if (!sheet) return createJsonResponse({ status: 'success' });

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf('予約番号');
  const memberCol = headers.indexOf('会員ID');
  const statusCol = headers.indexOf('ステータス');
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(orderId) && String(data[i][memberCol]) === memberId) {
      sheet.getRange(i + 1, statusCol + 1).setValue('キャンセル');
    }
  }
  return createJsonResponse({ status: 'success' });
}

// シート名定義（会員台帳）
const SHEET_MEMBERS = '会員台帳';

/**
 * ③ ログイン
 */
function handleLogin(email, password) {
  email = (email || '').trim().toLowerCase();
  if (isLoginLocked(email)) return loginLockedResponse();
  const member = findMemberByEmail(email);

  if (!member) {
    recordLoginFailure(email);
    return createJsonResponse({ status: 'error', message: 'メールアドレスまたはパスワードが正しくありません。' });
  }

  const inputHash = hashPassword(password, member.salt);
  if (inputHash !== member.passwordHash) {
    recordLoginFailure(email);
    return createJsonResponse({ status: 'error', message: 'メールアドレスまたはパスワードが正しくありません。' });
  }
  clearLoginFailures(email);

  return createJsonResponse({
    status: 'success',
    user: { memberId: member.memberId, name: member.name, email: member.email, rank: member.rank, joinDate: member.joinDate },
    sessionToken: createSessionToken(String(member.memberId))
  });
}

/**
 * ④ アカウント削除(パスワード再確認のうえ会員台帳から行ごと削除)
 */
function handleDeleteAccount(email, password) {
  email = (email || '').trim().toLowerCase();
  if (isLoginLocked(email)) return loginLockedResponse();
  const member = findMemberByEmail(email);

  if (!member) {
    recordLoginFailure(email);
    return createJsonResponse({ status: 'error', message: 'メールアドレスまたはパスワードが正しくありません。' });
  }

  const inputHash = hashPassword(password, member.salt);
  if (inputHash !== member.passwordHash) {
    recordLoginFailure(email);
    return createJsonResponse({ status: 'error', message: 'メールアドレスまたはパスワードが正しくありません。' });
  }
  clearLoginFailures(email);

  // 台帳に残る記録からLINEユーザーIDを消し、個人と結びつかない形にする(失敗時は会員行を消さずエラーにして再試行できるようにする)
  anonymizeLineUserId(member.lineUserId, member.memberId);

  const sheet = getOrCreateMembersSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const emailIdx = headers.indexOf('メールアドレス');

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][emailIdx]).trim().toLowerCase() === email) {
      sheet.deleteRow(i + 1); // シートの行番号は1始まり、かつヘッダー行(1行目)がある分+1
      break;
    }
  }

  return createJsonResponse({ status: 'success', message: 'アカウントを削除しました。' });
}

/**
 * 予約台帳・クーポン発行ログの該当LINEユーザーIDを「削除済み」に置き換える
 */
function anonymizeLineUserId(lineUserId, memberId) {
  if (!lineUserId && !memberId) return;
  const ss = getDataSpreadsheet();
  [SHEET_RESERVATIONS, SHEET_COUPON_LOGS].forEach(function (sheetName) {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return;
    const idIdx = data[0].indexOf('LINE_USER_ID');
    const memberIdx = data[0].indexOf('会員ID');
    for (let i = 1; i < data.length; i++) {
      if (lineUserId && idIdx !== -1 && String(data[i][idIdx]) === String(lineUserId)) {
        sheet.getRange(i + 1, idIdx + 1).setValue('削除済み');
      }
      if (memberId && memberIdx !== -1 && String(data[i][memberIdx]) === String(memberId)) {
        sheet.getRange(i + 1, memberIdx + 1).setValue('削除済み');
      }
    }
  });
}

function findMemberByEmail(email) {
  const ss = getDataSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_MEMBERS);
  if (!sheet) return null;

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return null;
  const headers = data[0];
  const emailIdx = headers.indexOf('メールアドレス');
  const lineIdx = headers.indexOf('LINE_USER_ID');

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][emailIdx]).trim().toLowerCase() === email) {
      return {
        memberId: data[i][headers.indexOf('会員ID')],
        name: data[i][headers.indexOf('表示名')],
        email: data[i][emailIdx],
        salt: data[i][headers.indexOf('パスワードソルト')],
        passwordHash: data[i][headers.indexOf('パスワードハッシュ')],
        rank: data[i][headers.indexOf('ランク')],
        joinDate: data[i][headers.indexOf('入会日')],
        lineUserId: lineIdx !== -1 ? data[i][lineIdx] : ''
      };
    }
  }
  return null;
}

/**
 * 会員台帳シートを取得(無ければヘッダー付きで新規作成)
 */
function getOrCreateMembersSheet() {
  const ss = getDataSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_MEMBERS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_MEMBERS);
    sheet.appendRow(['登録日時', 'メールアドレス', '会員ID', '表示名', 'パスワードソルト', 'パスワードハッシュ', 'ランク', '入会日', 'LINE_USER_ID']);
    sheet.getRange('A1:I1').setBackground('#5B21B6').setFontColor('#FFFFFF').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * LINE経由の神埼ID新規登録: 合言葉トークンの発行(登録ステップ1)
 */
function handleStartLineVerification() {
  const token = generateToken(6);
  CacheService.getScriptCache().put('line_pending_' + token, '1', 600); // 10分間有効
  return createJsonResponse({ status: 'success', token: token });
}

/**
 * LINEからその合言葉が届いたときの処理(handleLineMessageから呼ばれる)
 */
function handleLineVerificationMessage(replyToken, userId, token) {
  const cache = CacheService.getScriptCache();
  cache.remove('line_pending_' + token);

  const code = String(Math.floor(100000 + Math.random() * 900000));
  cache.put('line_otp_' + token, JSON.stringify({ code: code, lineUserId: userId }), 600); // 10分間有効

  replyToLine(replyToken, [{
    type: 'text',
    text:
      '🚆神埼鉄道グループ NIZAKI\n\n' +
      '神埼ID新規登録の認証コードです。\n\n' +
      '認証コード: ' + code + '\n\n' +
      'アプリの画面に入力して登録を完了してください。\n' +
      '※このコードの有効期限は発行から10分間です。'
  }]);
}

/**
 * LINE経由の神埼ID新規登録: コード検証＋本登録(登録ステップ2)
 * ※このタイミングでLINEのuserIdも同時に会員台帳へ紐付けられる
 */
function handleVerifyLineAndRegister(email, password, token, code, name) {
  email = (email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return createJsonResponse({ status: 'error', message: 'メールアドレスの形式が正しくありません。' });
  }

  const passwordError = validatePasswordServer(password);
  if (passwordError) {
    return createJsonResponse({ status: 'error', message: passwordError });
  }

  const normalizedToken = (token || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cache = CacheService.getScriptCache();
  const raw = cache.get('line_otp_' + normalizedToken);
  if (!raw) {
    return createJsonResponse({ status: 'error', message: '認証コードが正しくないか、有効期限が切れています。' });
  }

  const data = JSON.parse(raw);
  if (String(code).trim() !== data.code) {
    // 認証コードの当てずっぽうを防ぐ(5回間違えたらこの合言葉は無効)
    const failKey = 'line_otp_fail_' + normalizedToken;
    const fails = Number(cache.get(failKey) || 0) + 1;
    if (fails >= 5) {
      cache.remove('line_otp_' + normalizedToken);
      cache.remove(failKey);
      return createJsonResponse({ status: 'error', message: '認証コードの誤りが続いたため、合言葉を無効にしました。最初からやり直してください。' });
    }
    cache.put(failKey, String(fails), 600);
    return createJsonResponse({ status: 'error', message: '認証コードが正しくありません。' });
  }

  // 同時登録による重複(同じメール・同じ会員ID)を防ぐため、台帳への書き込み中は排他する
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return createJsonResponse({ status: 'error', message: '混み合っています。しばらくしてからもう一度お試しください。' });
  }

  try {
    if (findMemberByEmail(email)) {
      return createJsonResponse({ status: 'error', message: 'このメールアドレスは既に登録されています。ログインをお試しください。' });
    }

    const sheet = getOrCreateMembersSheet();
    const existingIds = {};
    const memberData = sheet.getDataRange().getValues();
    const idCol = memberData[0].indexOf('会員ID');
    for (let i = 1; i < memberData.length; i++) existingIds[String(memberData[i][idCol])] = true;

    let memberId = 'KZ-' + Math.floor(10000 + Math.random() * 90000);
    for (let tries = 0; existingIds[memberId] && tries < 50; tries++) {
      memberId = 'KZ-' + Math.floor(10000 + Math.random() * 90000);
    }

    const salt = Utilities.getUuid();
    const passwordHash = hashPassword(password, salt);
    const joinDate = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
    const timestamp = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
    sheet.appendRow([timestamp, email, memberId, name || email.split('@')[0], salt, passwordHash, 'レギュラー', joinDate, data.lineUserId || '']);

    cache.remove('line_otp_' + normalizedToken);

    return createJsonResponse({
      status: 'success',
      user: { memberId: memberId, name: name || email.split('@')[0], email: email, rank: 'レギュラー', joinDate: joinDate },
      sessionToken: createSessionToken(memberId)
    });
  } finally {
    lock.releaseLock();
  }
}

/**
 * ランダムな合言葉トークンを生成(紛らわしい0/O, 1/Iは除外)
 */
function generateToken(len) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

// ログイン証(署名つき・有効30日)。保存はせず、署名で正しさを確かめる
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function getSessionSecret() {
  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty('SESSION_SECRET');
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('SESSION_SECRET', secret);
  }
  return secret;
}

function signSessionPayload(payload) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, getSessionSecret()));
}

function createSessionToken(memberId) {
  const payload = memberId + '.' + (Date.now() + SESSION_TTL_MS);
  return payload + '.' + signSessionPayload(payload);
}

// 正しく期限内なら会員IDを、そうでなければ null を返す
function verifySessionToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const payload = parts[0] + '.' + parts[1];
  if (signSessionPayload(payload) !== parts[2]) return null;
  if (!(Number(parts[1]) > Date.now())) return null;
  return parts[0];
}

function findMemberById(memberId) {
  const sheet = getDataSpreadsheet().getSheetByName(SHEET_MEMBERS);
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return null;
  const headers = data[0];
  const idCol = headers.indexOf('会員ID');
  const lineCol = headers.indexOf('LINE_USER_ID');
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(memberId)) {
      return { memberId: String(memberId), lineUserId: lineCol !== -1 ? data[i][lineCol] : '' };
    }
  }
  return null;
}

function hashPassword(password, salt) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password + ':' + salt, Utilities.Charset.UTF_8);
  return raw.map(function (byte) {
    const v = (byte < 0 ? byte + 256 : byte).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

/**
 * 管理トークンの照合(スクリプトプロパティ ADMIN_TOKEN と一致するか)
 */
function isValidAdminToken(token) {
  const expected = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
  return !!expected && typeof token === 'string' && token === expected;
}

/**
 * パスワード規則のサーバー側チェック(クライアントと同じ条件)
 */
function validatePasswordServer(pw) {
  pw = String(pw || '');
  if (pw.length < 6) return 'パスワードは6文字以上で入力してください。';
  if (pw.length > 128) return 'パスワードが長すぎます。';
  if (!/[a-z]/.test(pw)) return 'パスワードには英字の小文字を1文字以上含めてください。';
  if (!/[A-Z]/.test(pw)) return 'パスワードには英字の大文字を1文字以上含めてください。';
  if (!/[0-9]/.test(pw)) return 'パスワードには数字を1文字以上含めてください。';
  if (!/[!-\/:-@\[-`{-~]/.test(pw)) return 'パスワードには記号を1文字以上含めてください。';
  return null;
}

// ログイン失敗の回数制限(同一メールで10分間に5回まで)
const LOGIN_MAX_FAILURES = 5;
const LOGIN_LOCK_SECONDS = 600;

function loginFailureKey(email) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'login_fail:' + email, Utilities.Charset.UTF_8);
  return 'login_fail_' + Utilities.base64EncodeWebSafe(digest);
}

function isLoginLocked(email) {
  const count = Number(CacheService.getScriptCache().get(loginFailureKey(email)) || 0);
  return count >= LOGIN_MAX_FAILURES;
}

function recordLoginFailure(email) {
  const cache = CacheService.getScriptCache();
  const key = loginFailureKey(email);
  const count = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(count), LOGIN_LOCK_SECONDS);
}

function clearLoginFailures(email) {
  CacheService.getScriptCache().remove(loginFailureKey(email));
}

function loginLockedResponse() {
  return createJsonResponse({ status: 'error', message: 'ログインの失敗が続いたため、しばらくしてからお試しください(約10分)。' });
}

/**
 * JSONレスポンスユーティリティ
 */
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
