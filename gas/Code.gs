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
const SHEET_ACCESS = 'アクセス統計';
const SHEET_ACCESS_SUMMARY = 'アクセス日計';
const SHEET_COUPON_LOGS = 'クーポン発行ログ';

const CONFIG = {
  ACCESS_TOKEN: (CHANNEL_ACCESS_TOKEN && !CHANNEL_ACCESS_TOKEN.includes('★'))
    ? CHANNEL_ACCESS_TOKEN
    : (PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN') || ''),
  LINE_REPLY_URL: 'https://api.line.me/v2/bot/message/reply',
  LINE_PUSH_URL: 'https://api.line.me/v2/bot/message/push',
  
  // スタンプラリー コース定義（スプレッドシート記録用）
  STAMP_KEYWORDS: {
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
    // (NIZAKI 2.0 の公開後のアプリだけが awardPoints: true を付ける。付けないと、ポイントの台帳には触れない)
    if (json.action === 'createReservation') {
      return handleCreateReservation(json.sessionToken, json.order, json.awardPoints === true);
    }
    if (json.action === 'cancelReservation') {
      return handleCancelReservation(json.sessionToken, json.orderId, json.awardPoints === true);
    }

    // ①.1 NIZAKI 2.0: アカウントのデータ(ポイント・クーポン・ミステリー・予約の履歴)をクラウドで持つ(ログイン証が必要)
    if (json.action === 'syncAccount') {
      return handleSyncAccount(json.sessionToken, json.local);
    }
    if (json.action === 'earnEventReward') {
      return handleEarnEventReward(json.sessionToken, json.rewardId);
    }
    if (json.action === 'redeemPointCode') {
      return handleRedeemPointCode(json.sessionToken, json.code);
    }
    if (json.action === 'useCoupon') {
      return handleUseCoupon(json.sessionToken, json.code);
    }
    if (json.action === 'spendPoints') {
      return handleSpendPoints(json.sessionToken, json.orderId, json.points, json.title);
    }
    // 公開記念イベントのごほうび(額はサーバーの定数。受け取るのは、予約番号だけ)
    if (json.action === 'claimEventTare') {
      return handleClaimEventTare(json.sessionToken, json.orderId);
    }
    if (json.action === 'saveMysteryProgress') {
      return handleSaveMysteryProgress(json.sessionToken, json.progress);
    }

    // ①.4 QR乗車券(検札の画面から呼ばれるので、verify・use はログイン証なし。持っているのは署名つきのトークン)
    if (json.action === 'getTicket') {
      return handleGetTicket(json.sessionToken, json.orderId);
    }
    if (json.action === 'verifyTicket') {
      return handleVerifyTicket(json.token);
    }
    if (json.action === 'useTicket') {
      return handleUseTicket(json.token, json.seat);
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

    // ①.55 アクセス数の記録(端末ごとの乱数ID・日付・起動回数のみ。個人情報は含まない)
    if (json.action === 'accessPing') {
      return handleAccessPing(json.deviceId, json.version);
    }

    // ①.6 運行情報・遅延指令(アプリ管理者コンソール・LINE応答で共有する単一の情報源)
    if (json.action === 'getDisruptions') {
      return handleGetDisruptions();
    }
    if (json.action === 'setDisruptions') {
      return handleSetDisruptions(json.disruptions, json.forecasts, json.adminToken);
    }
    // 管理者画面を開く前に、管理トークンが本物かだけを確かめる(何も書き換えない)
    if (json.action === 'verifyAdminToken') {
      return handleVerifyAdminToken(json.adminToken);
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

  // 1. スタンプラリー合言葉の判定 (ミステリートレイン制覇コードなど)
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

    // 検索: このLINEアカウントに紐づく予約だけ(予約番号を送っても、他人の予約は見られない)
    const matched = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const rowOrderId = idIndex !== -1 ? String(row[idIndex]) : '';
      const rowUserId = userIndex !== -1 ? String(row[userIndex]) : '';

      // キャンセル済み、または到着時刻を過ぎた予約は対象外
      if (statusIndex !== -1 && String(row[statusIndex]) === 'キャンセル') continue;
      if (isReservationRowExpired(headers, row)) continue;

      if (userId !== 'unknown' && rowUserId !== '' && rowUserId === userId) {
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
        text: 'お客様のLINEアカウントに紐づく有効なご予約が見つかりませんでした。\n神埼鉄道アプリで、神埼IDにログインした状態でご予約ください。'
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
  // 管理トークン(スクリプトプロパティ ADMIN_TOKEN)が未設定、または一致しなければ書き換えさせない(失敗が続けば、しばらく断る)
  const denied = adminTokenErrorResponse(checkAdminToken(adminToken));
  if (denied) return denied;
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
    : '現在、神埼鉄道グループ全線でほぼ平常通り運転しております。\n(列車ごとの数分程度の遅れは、アプリの「列車位置」でご確認いただけます)';

  return { hasDelay: hasDelay, summary: summary, lines: lines };
}

/**
 * LINE Messaging API 返信実行
 */
function replyToLine(replyToken, messages) {
  const token = CONFIG.ACCESS_TOKEN;
  if (!token || token.includes('★')) {
    // お客様のLINEには何も出さず、GASの実行ログ(エラー)にだけ残す
    console.error('[LINE返信失敗] アクセストークンが未設定です(スクリプト プロパティ LINE_CHANNEL_ACCESS_TOKEN を確認してください)');
    return;
  }

  try {
    const res = UrlFetchApp.fetch(CONFIG.LINE_REPLY_URL, {
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
    const code = res.getResponseCode();
    if (code !== 200) {
      console.error('[LINE返信失敗] status=' + code + ' ' + String(res.getContentText()).slice(0, 300));
    }
  } catch (err) {
    console.error('[LINE返信失敗] ' + err);
  }
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
      sheetSafe(userId),
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
  '乗車駅', '降車駅', '合計金額', 'ステータス', '会員ID', '予約日', '出発時刻', '到着時刻', '乗車日時', '初回登録日時', '初回の内容'
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

/**
 * アクセス数の記録用シート(日付, 端末ID, 起動回数, 初回起動, 最終起動, アプリ版数)
 * 横の「アクセス日計」シートに、日ごとの端末数・起動回数を自動集計する
 */
function getOrCreateAccessSheet() {
  const ss = getDataSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_ACCESS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_ACCESS);
    const headers = ['日付', '端末ID', '起動回数', '初回起動', '最終起動', 'アプリ版数'];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setBackground('#5B21B6').setFontColor('#FFFFFF').setFontWeight('bold');
    sheet.getRange('A:A').setNumberFormat('@'); // 日付を文字列のまま保持する
    sheet.setFrozenRows(1);

    const summary = ss.insertSheet(SHEET_ACCESS_SUMMARY);
    summary.getRange('A1').setFormula(
      '=QUERY(\'' + SHEET_ACCESS + '\'!A:C, "select A, count(B), sum(C) where A is not null and A <> \'日付\' group by A order by A desc label A \'日付\', count(B) \'端末数\', sum(C) \'起動回数\'", 1)'
    );
  }
  return sheet;
}

/**
 * アプリを開いたことを1件記録する(同じ日・同じ端末は起動回数を増やす)
 * 保存するのは、端末ごとに自動で作られる乱数ID・日付・起動回数・アプリ版数のみ
 */
function handleAccessPing(deviceId, version) {
  const id = String(deviceId || '');
  if (!/^[A-Za-z0-9-]{16,64}$/.test(id)) {
    return createJsonResponse({ status: 'ignored' });
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
  } catch (err) {
    return createJsonResponse({ status: 'ignored' });
  }

  try {
    const sheet = getOrCreateAccessSheet();
    const now = new Date();
    const today = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd');
    const nowText = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
    const ver = limitText(version, 20);

    // 行は日付順に追記されるので、末尾から今日の分だけ調べる
    const lastRow = sheet.getLastRow();
    const startRow = Math.max(2, lastRow - 4999);
    const todayRows = [];
    let found = -1;
    if (lastRow >= 2) {
      const values = sheet.getRange(startRow, 1, lastRow - startRow + 1, 3).getValues();
      for (let i = values.length - 1; i >= 0; i--) {
        const d = values[i][0] instanceof Date
          ? Utilities.formatDate(values[i][0], 'Asia/Tokyo', 'yyyy-MM-dd')
          : String(values[i][0]);
        if (d !== today) break;
        todayRows.push(i);
        if (String(values[i][1]) === id) { found = startRow + i; break; }
      }
    }

    if (found > 0) {
      const count = Number(sheet.getRange(found, 3).getValue()) || 0;
      sheet.getRange(found, 3).setValue(count + 1);
      sheet.getRange(found, 5, 1, 2).setValues([[nowText, sheetSafe(ver)]]);
    } else if (todayRows.length < 3000) {
      // 1日3000端末を超える記録は行わない(いたずらでシートが膨らむのを防ぐ)
      sheet.appendRow([today, id, 1, nowText, nowText, sheetSafe(ver)]);
    }
    return createJsonResponse({ status: 'success' });
  } finally {
    lock.releaseLock();
  }
}

function limitText(value, max) {
  return String(value === undefined || value === null ? '' : value).slice(0, max);
}

// シートに書く文字が「=」「+」「-」「@」で始まると、シートが式として動かす(外へデータを送る式も作れる)。
// 先頭に ' を付けて、ただの文字として書く(読み戻すと ' は付いていない)。
// 利用者・LINE から来る文字は、シートに書く前に、必ずこれを通す。文字の書式にしてある列には、通さない(' がそのまま残る)
function sheetSafe(value) {
  if (typeof value !== 'string') return value;
  return /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
}

/**
 * 予約の登録・更新(予約番号が同じ行があれば更新する)
 */
function handleCreateReservation(sessionToken, order, awardPoints) {
  const memberId = verifySessionToken(sessionToken);
  if (!memberId) {
    return createJsonResponse({ status: 'error', message: 'ログインの有効期限が切れています。もう一度ログインしてください。' });
  }
  if (!order || typeof order !== 'object' || !/^[A-Za-z0-9-]{3,40}$/.test(String(order.orderId || ''))) {
    return createJsonResponse({ status: 'error', message: '予約内容が正しくありません。' });
  }

  const orderLimitError = checkOrderLimits(order);
  if (orderLimitError) {
    return createJsonResponse({ status: 'error', code: 'order_limit', message: orderLimitError });
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
      '座席番号': normalizeSeatNo(order.seatNo),
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

    let firstRegisteredAt = nowText(); // 最初に登録された日時(更新では、変えない。イベントのごほうびの判定が、予約の時刻に使う)
    // 最初に登録された、列車・区間・日付・発車時刻(更新では、変えない)。イベントのごほうびの判定は、現在の列ではなく、これだけを見る
    // (更新で、判定に使う列を書き換えて、条件を迂回されないように)
    let firstContent = JSON.stringify({
      train: values['列車名'], from: values['乗車駅'], to: values['降車駅'], date: values['予約日'], dep: values['出発時刻']
    });
    let targetRow = -1;
    let previousTotal = null; // 更新のとき、更新前の合計金額(デリバリーを足したときのポイントを求める)
    let previousBasis = 0;    // これまでに、ポイントを計算した、いちばん大きい合計金額(下げて、また上げても、二重に付かない)
    let boardedAt = '';       // QR乗車券を「利用する」で乗車済みにした日時(更新で消すと、同じ QR がまた使えてしまう)
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][col['予約番号']]) === values['予約番号']) {
        if (String(data[i][col['会員ID']]) !== memberId) {
          return createJsonResponse({ status: 'error', message: 'この予約番号は使用できません。' });
        }
        // 取り消した予約は、同じ番号で出し直せない(取消で消したポイントを、また付けられてしまう)
        if (awardPoints && String(data[i][col['ステータス']]) === 'キャンセル') {
          return createJsonResponse({ status: 'error', message: 'この予約は取り消されています。新しく予約してください。' });
        }
        targetRow = i + 1;
        previousTotal = Number(data[i][col['合計金額']]) || 0;
        previousBasis = readPointBasis(col['明細'] !== undefined ? data[i][col['明細']] : '');
        boardedAt = col['乗車日時'] !== undefined ? cellText(data[i][col['乗車日時']]) : '';
        firstRegisteredAt = col['初回登録日時'] !== undefined ? cellText(data[i][col['初回登録日時']]) : '';
        firstContent = col['初回の内容'] !== undefined ? cellText(data[i][col['初回の内容']]) : '';
        break;
      }
    }

    // 公開後のアプリ: 新しい予約は、まだ乗っていない予約が多すぎるときは受けない(シートが膨らむのを防ぐ)
    if (awardPoints && targetRow === -1) {
      let active = 0;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][col['会員ID']]) !== memberId) continue;
        if (String(data[i][col['ステータス']]) === 'キャンセル') continue;
        if (isReservationRowExpired(headers, data[i])) continue;
        active++;
      }
      if (active >= MAX_ACTIVE_RESERVATIONS) {
        return createJsonResponse({ status: 'error', message: '一度に持てる予約の数の上限です。乗車後か、取消のあとに、もう一度お試しください。' });
      }
    }

    values['乗車日時'] = boardedAt;
    values['初回登録日時'] = firstRegisteredAt;
    values['初回の内容'] = firstContent;
    const row = headers.map(function (h) { return values[h] !== undefined ? sheetSafe(values[h]) : ''; });
    if (targetRow === -1) {
      sheet.appendRow(row);
      targetRow = sheet.getLastRow();
    } else {
      sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
    }
    // 日付・時刻は文字列のまま保存する(シートが日付型に変換しないように)
    ['予約日', '出発時刻', '到着時刻', '乗車日時', '初回登録日時', '初回の内容'].forEach(function (h) {
      const c = headers.indexOf(h);
      if (c !== -1) {
        const cell = sheet.getRange(targetRow, c + 1);
        cell.setNumberFormat('@');
        cell.setValue(values[h]);
      }
    });

    // 公開後のアプリ: 明細(デリバリーの商品と割引)を残し、ポイントをサーバーが付ける
    if (awardPoints) {
      // ポイントは、上限までの金額で計算する。前の金額は、「これまでに計算したいちばん大きい金額」と比べる
      const pointsTotal = Math.min(values['合計金額'], POINT_BASIS_CAP);
      const pointsFrom = previousTotal === null ? null : Math.min(Math.max(previousTotal, previousBasis), POINT_BASIS_CAP);
      saveReservationDetail(sheet, targetRow, order, Math.max(pointsTotal, pointsFrom || 0));
      awardReservationPoints(memberId, String(order.orderId), pointsTotal, pointsFrom, limitText(order.trainName, 60));
    }

    return createJsonResponse({ status: 'success' });
  } finally {
    lock.releaseLock();
  }
}

// ---- 座席番号(複数席) ----
// 台帳の「座席番号」: 1席は '4B'、複数席は '4B,4C'(席ごとにカンマ)、自由席は '自由席' または '自由席×3'(人数)。
// 号車は1つ(同じ号車の席だけ)。席の数 = 人数(最大 MAX_SEATS)
const FREE_SEAT_PATTERN = /^自由席×(\d{1,3})$/;
const STRICT_SEAT_PATTERN = /^\d{1,2}[A-D]$/;

// 座席番号の文字から、席の名前の一覧を作る。自由席×3 は、自由席1・自由席2・自由席3(席ごとの利用の記録に使う)
function parseSeats(seatNo) {
  const text = String(seatNo === undefined || seatNo === null ? '' : seatNo).trim();
  const free = FREE_SEAT_PATTERN.exec(text);
  if (free) {
    const n = Math.min(Number(free[1]), MAX_SEATS);
    if (n <= 1) return ['自由席'];
    const seats = [];
    for (let i = 1; i <= n; i++) seats.push('自由席' + i);
    return seats;
  }
  const seats = text.split(',').map(function (v) { return v.trim(); }).filter(function (v) { return v !== ''; });
  return seats.length > 0 ? seats : [text];
}

// 席の数・重複・書式を調べる。問題があれば断りの文を返す(席が無い申告は、調べない)
function checkSeats(seatNo) {
  if (seatNo === undefined || seatNo === null || seatNo === '') return null;
  const text = String(seatNo).trim();
  const free = FREE_SEAT_PATTERN.exec(text);
  if (free) {
    const n = Number(free[1]);
    if (n > MAX_SEATS) return '座席は、' + MAX_SEATS + '席までです。';
    return n >= 1 ? null : '予約内容が正しくありません。';
  }
  const seats = text.split(',').map(function (v) { return v.trim(); }).filter(function (v) { return v !== ''; });
  if (seats.length > MAX_SEATS) return '座席は、' + MAX_SEATS + '席までです。';
  if (seats.length >= 2) {
    // 複数席のときだけ、書式を決める(席ごとの利用の記録に、席の名前をそのまま使うため)
    const seen = {};
    for (let i = 0; i < seats.length; i++) {
      if (!STRICT_SEAT_PATTERN.test(seats[i]) || seen[seats[i]]) return '予約内容が正しくありません。';
      seen[seats[i]] = true;
    }
  }
  return null;
}

// 台帳に書く座席番号(複数席は、空の席を除いて、カンマでつなぐ)
function normalizeSeatNo(seatNo) {
  const text = limitText(seatNo, 40).trim();
  if (FREE_SEAT_PATTERN.test(text) || text.indexOf(',') === -1) return text;
  return text.split(',').map(function (v) { return v.trim(); }).filter(function (v) { return v !== ''; }).join(',');
}

/**
 * 1回の注文の上限を調べる。問題があれば、断りの文を返す(無ければ null)。
 * 予約の登録・デリバリーの追加(同じ予約番号の更新)の、どちらも通る。ふつうの注文(駅弁数個)は、ここに届かない。
 * 明細(items)は、公開後のアプリだけが送るので、あるときだけ調べる。
 */
function checkOrderLimits(order) {
  const num = function (v) { return Number(v === undefined || v === null || v === '' ? 0 : v); };
  const total = num(order.totalPrice);
  const pointsUsed = num(order.pointsUsed);
  const discount = num(order.itemDiscount);
  if (!isFinite(total) || !isFinite(pointsUsed) || !isFinite(discount) || total < 0 || pointsUsed < 0 || discount < 0) {
    return '予約内容が正しくありません。';
  }
  if (total + pointsUsed > MAX_ORDER_TOTAL) {
    return '1回の注文の合計は、' + MAX_ORDER_TOTAL.toLocaleString() + '円までです。';
  }
  if (discount > MAX_ORDER_TOTAL) return '予約内容が正しくありません。';
  const seatError = checkSeats(order.seatNo);
  if (seatError) return seatError;
  if (order.items === undefined || order.items === null) return null;
  if (!Array.isArray(order.items) || order.items.length > MAX_ORDER_QUANTITY) {
    return '1回の注文は、合わせて' + MAX_ORDER_QUANTITY + '個までです。';
  }
  let quantitySum = 0;
  let itemsTotal = 0;
  for (let i = 0; i < order.items.length; i++) {
    const it = order.items[i];
    const q = it ? num(it.quantity) : 0;
    const price = it ? num(it.price) : 0;
    if (!isFinite(q) || !isFinite(price) || q < 0 || price < 0 || Math.floor(q) !== q) return '予約内容が正しくありません。';
    if (q > MAX_ITEM_QUANTITY) return '1つの商品は、' + MAX_ITEM_QUANTITY + '個までです。';
    quantitySum += q;
    itemsTotal += price * q;
  }
  if (quantitySum > MAX_ORDER_QUANTITY) return '1回の注文は、合わせて' + MAX_ORDER_QUANTITY + '個までです。';
  if (itemsTotal > MAX_ORDER_TOTAL + discount) return '1回の注文の合計は、' + MAX_ORDER_TOTAL.toLocaleString() + '円までです。';
  return null;
}

/**
 * 予約の取消(行は残し、ステータスを「キャンセル」にする)
 */
function handleCancelReservation(sessionToken, orderId, awardPoints) {
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
  // 公開後のアプリ: その予約で付けたポイントを差し引く
  if (awardPoints) {
    revokeReservationPoints(memberId, String(orderId));
  }
  return createJsonResponse({ status: 'success' });
}

// ---- QR乗車券(署名つきの URL で、検札用の画面を開く。「利用する」で乗車済みにする) ----
// トークン = 予約番号 + '.' + 署名。署名は予約番号から、サーバーの鍵で作る(アプリは鍵を持てない)。
// 乗車済みかどうかは、予約台帳の「乗車日時」列が決める(トークンには入れない)。
const TICKET_SIG_LENGTH = 12;
const TICKET_TOKEN_PATTERN = /^([A-Za-z0-9-]{3,40})\.([A-Za-z0-9_-]{12})$/;

function ticketSignature(orderId) {
  // ログイン証の署名('会員ID.期限')と区別するため、接頭辞を付ける
  return signSessionPayload('ticket:' + orderId).slice(0, TICKET_SIG_LENGTH);
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// 正しい署名なら予約番号を、そうでなければ null を返す
function verifyTicketToken(token) {
  if (typeof token !== 'string') return null;
  const m = TICKET_TOKEN_PATTERN.exec(token);
  if (!m) return null;
  return safeEqual(ticketSignature(m[1]), m[2]) ? m[1] : null;
}

// 予約台帳から、予約番号の行を探す(無ければ null)
function findTicketRow(sheet, orderId) {
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return null;
  const headers = data[0];
  const col = {};
  headers.forEach(function (h, i) { col[h] = i; });
  if (col['予約番号'] === undefined) return null;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][col['予約番号']]) === orderId) {
      return { sheet: sheet, headers: headers, col: col, row: data[i], rowNumber: i + 1 };
    }
  }
  return null;
}

function ticketBoardedAt(found) {
  return found.col['乗車日時'] !== undefined ? cellText(found.row[found.col['乗車日時']]) : '';
}

// 「乗車日時」列の書き方:
//  - 1席の予約: 時刻だけ('2026/10/21 10:32:15')。昔からの書き方のまま
//  - 複数席の予約: 利用した席だけ '席=時刻' を ';' でつなぐ('4B=2026/10/21 10:32:15;4D=...')
//  - 昔の時刻だけが入った行は、その予約の全席が、その時刻に利用済みとして読む
const TICKET_TIME_PATTERN = /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/;

function ticketSeats(found) {
  return parseSeats(found.row[found.col['座席番号']]);
}

// 席ごとの利用時刻({ 席: 時刻 })。利用していない席は入らない
function ticketBoardings(found) {
  const cell = ticketBoardedAt(found).trim();
  const seats = ticketSeats(found);
  const result = {};
  if (!cell) return result;
  if (!TICKET_TIME_PATTERN.test(cell)) {
    cell.split(';').forEach(function (pair) {
      const i = pair.indexOf('=');
      if (i <= 0) return;
      const seat = pair.slice(0, i).trim();
      const time = pair.slice(i + 1).trim();
      if (time && seats.indexOf(seat) !== -1) result[seat] = time;
    });
    if (Object.keys(result).length > 0) return result;
  }
  // 昔の形(時刻だけ)や、読めない文字: 今までどおり、利用済みとして扱う
  seats.forEach(function (seat) { result[seat] = cell; });
  return result;
}

// 予約全体の状態(取消 → 期限切れ → 別の日 → 有効)。席ごとの利用は、ここに含めない
function reservationState(found) {
  if (String(found.row[found.col['ステータス']]) === 'キャンセル') return 'cancelled';
  if (isReservationRowExpired(found.headers, found.row)) return 'expired';
  // 予約日が今日より先 = 別の日(日またぎの夜行など、予約日が過去でも、到着前なら有効)
  const date = cellText(found.row[found.col['予約日']], 'yyyy-MM-dd');
  const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  if (/^\d{4}-\d{2}-\d{2}$/.test(date) && date > today) return 'otherDay';
  return 'valid';
}

// 券の状態: 取消 / 全席が利用済みなら used / それ以外は予約全体の状態
function ticketState(found) {
  const base = reservationState(found);
  if (base === 'cancelled') return base;
  const boardings = ticketBoardings(found);
  const allUsed = ticketSeats(found).every(function (seat) { return !!boardings[seat]; });
  return allUsed ? 'used' : base;
}

// 席ごとの状態: 取消なら全席 cancelled / 利用済みの席は used / それ以外は予約全体の状態
function ticketSeatList(found) {
  const base = reservationState(found);
  const boardings = ticketBoardings(found);
  return ticketSeats(found).map(function (seat) {
    if (base === 'cancelled') return { seat: seat, state: 'cancelled' };
    if (boardings[seat]) return { seat: seat, state: 'used', usedAt: boardings[seat].slice(11, 16) };
    return { seat: seat, state: base };
  });
}

// 検札の画面に返す項目だけを、1つずつ写す(会員ID・LINE_USER_ID・金額・明細は返さない)
function ticketView(found) {
  const r = found.row;
  const c = found.col;
  return {
    trainName: String(r[c['列車名']]),
    boardingStation: String(r[c['乗車駅']]),
    destinationStation: String(r[c['降車駅']]),
    carNo: Number(r[c['号車']]) || 0,
    seatNo: String(r[c['座席番号']]),
    seatType: String(r[c['席種']]),
    reservedDate: cellText(r[c['予約日']], 'yyyy-MM-dd'),
    departureTime: cellText(r[c['出発時刻']], 'HH:mm'),
    arrivalTime: cellText(r[c['到着時刻']], 'HH:mm')
  };
}

function ticketResponse(found, state, extra) {
  const res = { status: 'success', state: state };
  if (found) {
    res.ticket = ticketView(found);
    res.seats = ticketSeatList(found);
    if (state === 'used') {
      // 全席が済んだ券: いちばん遅い利用時刻
      const boardings = ticketBoardings(found);
      const times = Object.keys(boardings).map(function (seat) { return boardings[seat]; }).sort();
      res.usedAt = (times.length ? times[times.length - 1] : ticketBoardedAt(found)).slice(11, 16);
    }
  }
  Object.keys(extra || {}).forEach(function (k) { res[k] = extra[k]; });
  return createJsonResponse(res);
}

/**
 * 検札の画面: 署名を確かめ、列車・区間・座席(席ごとの状態)と状態だけを返す(読むだけ。ログイン証は要らない)
 */
function handleVerifyTicket(token) {
  const orderId = verifyTicketToken(token);
  if (!orderId) return ticketResponse(null, 'invalid');
  const found = findTicketRow(getDataSpreadsheet().getSheetByName(SHEET_RESERVATIONS), orderId);
  if (!found) return ticketResponse(null, 'invalid');
  return ticketResponse(found, ticketState(found));
}

/**
 * 「利用する」: 有効な券の、指定した席だけを利用済みにする(席ごと)。
 * 確認から書き込みまでをロックの中で行うので、同じ席を同時に押しても1回だけ成功する(あとの人には、利用済みが返る)。
 * 別の席は、それぞれ書ける(ロックの中で読み直してから足すので、先に書かれた席は消えない)。
 * 席を省略できるのは、1席の予約だけ(昔の呼び出しと同じ)
 */
function handleUseTicket(token, seat) {
  const orderId = verifyTicketToken(token);
  if (!orderId) return ticketResponse(null, 'invalid');
  return withScriptLock(function () {
    // 列が無い台帳には、ここで足す
    const found = findTicketRow(getOrCreateReservationsSheet(), orderId);
    if (!found) return ticketResponse(null, 'invalid');
    if (reservationState(found) !== 'valid') return ticketResponse(found, ticketState(found));
    const seats = ticketSeats(found);
    let target = typeof seat === 'string' ? seat.trim() : '';
    if (!target) {
      if (seats.length !== 1) return createJsonResponse({ status: 'error', code: 'seat_required', message: '席を指定してください。' });
      target = seats[0];
    }
    if (seats.indexOf(target) === -1) {
      return createJsonResponse({ status: 'error', code: 'seat_not_found', message: 'この予約に、その席はありません。' });
    }
    const boardings = ticketBoardings(found);
    if (boardings[target]) return ticketResponse(found, ticketState(found));
    const boardedAt = nowText();
    let text = boardedAt;
    if (seats.length > 1) {
      boardings[target] = boardedAt;
      text = seats.filter(function (s) { return !!boardings[s]; }).map(function (s) { return s + '=' + boardings[s]; }).join(';');
    }
    const cell = found.sheet.getRange(found.rowNumber, found.col['乗車日時'] + 1);
    cell.setNumberFormat('@');
    cell.setValue(text);
    found.row[found.col['乗車日時']] = text;
    return ticketResponse(found, ticketState(found), { justUsed: true, usedSeat: target });
  });
}

/**
 * アプリ(ログイン中の持ち主)に、自分の予約のトークンと今の状態を返す
 */
function handleGetTicket(sessionToken, orderId) {
  const a = authMember(sessionToken);
  if (a.error) return a.error;
  const id = String(orderId || '');
  const notReady = createJsonResponse({ status: 'error', code: 'ticket_not_ready', message: 'この予約がまだ登録されていません。少し待って、もう一度お試しください。' });
  if (!/^[A-Za-z0-9-]{3,40}$/.test(id)) return notReady;
  const found = findTicketRow(getDataSpreadsheet().getSheetByName(SHEET_RESERVATIONS), id);
  if (!found || String(found.row[found.col['会員ID']]) !== a.memberId) return notReady;
  return ticketResponse(found, ticketState(found), { token: id + '.' + ticketSignature(id) });
}

// シート名定義（会員台帳）
const SHEET_MEMBERS = '会員台帳';

/**
 * ③ ログイン
 */
function handleLogin(email, password) {
  email = normalizeLoginEmail(email);
  // 型違い・空・巨大な入力は、台帳も回数も見ずに断る(中身は、ふつうの失敗と同じ文言)
  if (!isAcceptableCredentials(email, password)) return wrongCredentialsResponse();
  // 試す回数は、先に1つ確保する(同時にたくさん送られても、5回を超えて試せない)
  const gate = reserveLoginAttempt(email);
  if (gate === 'locked') return loginLockedResponse();
  if (gate === 'busy') return loginBusyResponse();
  const member = findMemberByEmail(email);

  if (!member) {
    return wrongCredentialsResponse();
  }

  const inputHash = hashPassword(password, member.salt);
  if (inputHash !== member.passwordHash) {
    return wrongCredentialsResponse();
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
  email = normalizeLoginEmail(email);
  if (!isAcceptableCredentials(email, password)) return wrongCredentialsResponse();
  const gate = reserveLoginAttempt(email);
  if (gate === 'locked') return loginLockedResponse();
  if (gate === 'busy') return loginBusyResponse();
  const member = findMemberByEmail(email);

  if (!member) {
    return wrongCredentialsResponse();
  }

  const inputHash = hashPassword(password, member.salt);
  if (inputHash !== member.passwordHash) {
    return wrongCredentialsResponse();
  }
  clearLoginFailures(email);

  // 台帳に残る記録からLINEユーザーIDを消し、個人と結びつかない形にする(失敗時は会員行を消さずエラーにして再試行できるようにする)
  anonymizeLineUserId(member.lineUserId, member.memberId);
  // NIZAKI 2.0 で作る、ポイント・使用済みクーポン・ミステリー進行の、この会員の行も消す(表が無ければ、何もしない)
  deleteCloudAccountData(member.memberId);

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
// この会員の、ポイント台帳・使用済みクーポン・ミステリー進行の行を消す(会員IDの列は、表ごとに違う)
function deleteCloudAccountData(memberId) {
  if (!memberId) return;
  const ss = getDataSpreadsheet();
  [[SHEET_POINTS, 1], [SHEET_USED_COUPONS, 0], [SHEET_MYSTERY, 0]].forEach(function (def) {
    const sheet = ss.getSheetByName(def[0]);
    if (!sheet) return;
    const data = sheet.getDataRange().getValues();
    // 下から消す(行番号がずれないように)
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][def[1]]) === String(memberId)) sheet.deleteRow(i + 1);
    }
  });
}

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
// 認証コードを試す回数を、ロックの中で1つ増やして、何回目かを返す('busy' のときは、ロックを取れなかった)
function reserveOtpAttempt(failKey) {
  const cache = CacheService.getScriptCache();
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(3000);
  } catch (err) {
    return 'busy';
  }
  try {
    const n = Number(cache.get(failKey) || 0) + 1;
    cache.put(failKey, String(n), 600);
    return n;
  } finally {
    lock.releaseLock();
  }
}

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
  email = normalizeLoginEmail(email);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return createJsonResponse({ status: 'error', message: 'メールアドレスの形式が正しくありません。' });
  }
  if (email.length > MAX_EMAIL_LENGTH) {
    return createJsonResponse({ status: 'error', message: 'メールアドレスは' + MAX_EMAIL_LENGTH + '文字以内で入力してください。' });
  }
  // 表示名は、渡されたときだけ調べる(いまのアプリは渡さない。そのときは、メールの@の前から作る)
  if (name !== undefined && name !== null && name !== '' && (typeof name !== 'string' || name.length > MAX_NAME_LENGTH)) {
    return createJsonResponse({ status: 'error', message: '表示名は' + MAX_NAME_LENGTH + '文字以内で入力してください。' });
  }
  if (typeof token !== 'string' || (code !== undefined && code !== null && typeof code !== 'string' && typeof code !== 'number')) {
    return createJsonResponse({ status: 'error', message: '認証コードが正しくないか、有効期限が切れています。' });
  }

  const passwordError = validatePasswordServer(password);
  if (passwordError) {
    return createJsonResponse({ status: 'error', message: passwordError });
  }

  const normalizedToken = token.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cache = CacheService.getScriptCache();
  const raw = cache.get('line_otp_' + normalizedToken);
  if (!raw) {
    return createJsonResponse({ status: 'error', message: '認証コードが正しくないか、有効期限が切れています。' });
  }

  const data = JSON.parse(raw);
  // 認証コードの当てずっぽうを防ぐ(5回までしか試せない。試す回数は、確かめる前に、ロックの中で確保する)
  const failKey = 'line_otp_fail_' + normalizedToken;
  const attempt = reserveOtpAttempt(failKey);
  if (attempt === 'busy') {
    return createJsonResponse({ status: 'error', message: '混み合っています。しばらくしてからもう一度お試しください。' });
  }
  if (attempt > 5) {
    cache.remove('line_otp_' + normalizedToken);
    cache.remove(failKey);
    return createJsonResponse({ status: 'error', message: '認証コードの誤りが続いたため、合言葉を無効にしました。最初からやり直してください。' });
  }
  if (String(code === undefined || code === null ? '' : code).trim() !== data.code) {
    if (attempt >= 5) {
      cache.remove('line_otp_' + normalizedToken);
      cache.remove(failKey);
      return createJsonResponse({ status: 'error', message: '認証コードの誤りが続いたため、合言葉を無効にしました。最初からやり直してください。' });
    }
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

    let memberId = 'NZ-' + Math.floor(10000 + Math.random() * 90000);
    for (let tries = 0; existingIds[memberId] && tries < 50; tries++) {
      memberId = 'NZ-' + Math.floor(10000 + Math.random() * 90000);
    }

    const salt = Utilities.getUuid();
    const passwordHash = hashPassword(password, salt);
    const joinDate = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
    const timestamp = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
    const userName = String(name || email.split('@')[0]).slice(0, MAX_NAME_LENGTH); // 名前を渡さないときは、メールの@の前(長ければ切る)
    sheet.appendRow([timestamp, sheetSafe(email), memberId, sheetSafe(userName), salt, passwordHash, 'レギュラー', joinDate, sheetSafe(data.lineUserId || '')]);

    cache.remove('line_otp_' + normalizedToken);

    return createJsonResponse({
      status: 'success',
      user: { memberId: memberId, name: userName, email: email, rank: 'レギュラー', joinDate: joinDate },
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
 * 管理トークンの照合(スクリプトプロパティ ADMIN_TOKEN と一致するか)。比較は、途中で止めずに、最後まで行う
 */
function isValidAdminToken(token) {
  const expected = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
  if (!expected || typeof token !== 'string') return false;
  const a = String(expected);
  const b = token.slice(0, a.length + 1);
  let diff = a.length === token.length ? 0 : 1;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

// 管理トークンの失敗の回数制限(全体で、10分に5回。メールのような単位が無いため、1つだけ数える)
const ADMIN_MAX_FAILURES = 5;
const ADMIN_LOCK_SECONDS = 600;
const ADMIN_FAIL_KEY = 'admin_token_fail';

/**
 * 管理トークンを確かめて、回数を数える。'ok' | 'denied' | 'locked' | 'busy'
 * 数えるところは、同時に送られても数え漏れないよう、ロックの中で行う。ロックを取れなければ、通さない('busy')
 */
function checkAdminToken(token) {
  const cache = CacheService.getScriptCache();
  // すでに止めているときは、ロックを待たずに断る(連打でロックを塞がせない)
  if (Number(cache.get(ADMIN_FAIL_KEY) || 0) >= ADMIN_MAX_FAILURES) return 'locked';
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(3000);
  } catch (err) {
    return 'busy';
  }
  try {
    const count = Number(cache.get(ADMIN_FAIL_KEY) || 0);
    if (count >= ADMIN_MAX_FAILURES) return 'locked';
    if (isValidAdminToken(token)) {
      cache.remove(ADMIN_FAIL_KEY);
      return 'ok';
    }
    cache.put(ADMIN_FAIL_KEY, String(count + 1), ADMIN_LOCK_SECONDS);
    return 'denied';
  } finally {
    lock.releaseLock();
  }
}

// 'ok' のときは null。それ以外は、断りの応答(code で、アプリが見分ける)
function adminTokenErrorResponse(result) {
  if (result === 'ok') return null;
  if (result === 'locked') {
    return createJsonResponse({ status: 'error', code: 'admin_locked', message: '管理トークンの失敗が続いたため、しばらくしてからお試しください(約10分)。' });
  }
  if (result === 'busy') {
    return createJsonResponse({ status: 'error', code: 'admin_busy', message: '混み合っています。しばらくしてからもう一度お試しください。' });
  }
  return createJsonResponse({ status: 'error', code: 'admin', message: '管理トークンが正しくないか、サーバーに設定されていません。' });
}

function handleVerifyAdminToken(adminToken) {
  return adminTokenErrorResponse(checkAdminToken(adminToken)) || createJsonResponse({ status: 'success' });
}

/**
 * パスワード規則のサーバー側チェック(クライアントと同じ条件)
 */
function validatePasswordServer(pw) {
  if (typeof pw !== 'string') return 'パスワードを入力してください。';
  if (pw.length < 6) return 'パスワードは6文字以上で入力してください。';
  if (pw.length > MAX_PASSWORD_LENGTH) return 'パスワードは' + MAX_PASSWORD_LENGTH + '文字以内で入力してください。';
  if (!/[a-z]/.test(pw)) return 'パスワードには英字の小文字を1文字以上含めてください。';
  if (!/[A-Z]/.test(pw)) return 'パスワードには英字の大文字を1文字以上含めてください。';
  if (!/[0-9]/.test(pw)) return 'パスワードには数字を1文字以上含めてください。';
  if (!/[!-\/:-@\[-`{-~]/.test(pw)) return 'パスワードには記号を1文字以上含めてください。';
  return null;
}

// 入力の長さの上限(メールは RFC の最大。画面の入力欄の maxLength も、同じ数字)
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 128;
const MAX_NAME_LENGTH = 30;

function normalizeLoginEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

// ログイン・アカウント削除に渡された、メールとパスワードが、受け付けられる形か(文字で、空でなく、長すぎない)
function isAcceptableCredentials(email, password) {
  return email !== '' && email.length <= MAX_EMAIL_LENGTH &&
    typeof password === 'string' && password.length > 0 && password.length <= MAX_PASSWORD_LENGTH;
}

function wrongCredentialsResponse() {
  return createJsonResponse({ status: 'error', message: 'メールアドレスまたはパスワードが正しくありません。' });
}

function loginBusyResponse() {
  return createJsonResponse({ status: 'error', message: '混み合っています。しばらくしてからもう一度お試しください。' });
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

// パスワードを確かめる前に、試す回数を1つ確保する。'ok' | 'locked' | 'busy'
// 数えるところは、ロックの中(読む→足す→書く)。同時に送られても、数え漏れず、5回を超えて試せない。
// 成功したら、clearLoginFailures で消す。止まっているときは、ロックを待たずに断る(連打でロックを塞がせない)
function reserveLoginAttempt(email) {
  return reserveCounter(loginFailureKey(email), LOGIN_MAX_FAILURES, LOGIN_LOCK_SECONDS);
}

// 試す回数を1つ確保する共通の数え方。'ok' | 'locked' | 'busy'。数えるところは、ロックの中
function reserveCounter(key, max, seconds) {
  const cache = CacheService.getScriptCache();
  if (Number(cache.get(key) || 0) >= max) return 'locked';
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(3000);
  } catch (err) {
    return 'busy';
  }
  try {
    const count = Number(cache.get(key) || 0);
    if (count >= max) return 'locked';
    cache.put(key, String(count + 1), seconds);
    return 'ok';
  } finally {
    lock.releaseLock();
  }
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

// ==============================================================================
// NIZAKI 2.0: アカウントのデータ(ポイント・クーポン・ミステリー・予約の履歴)をクラウドで持つ
// 公開前のアプリは、これらの処理を呼ばない。createReservation / cancelReservation も、
// 公開後のアプリが awardPoints: true を付けたときだけ、ポイント台帳に触れる。
// ==============================================================================
const SHEET_POINTS = 'ポイント台帳';
const POINT_HEADERS = ['日時', '会員ID', '種別', '名札', 'ポイント', 'タイトル'];
const SHEET_USED_COUPONS = '使用済みクーポン';
const USED_COUPON_HEADERS = ['会員ID', 'コード', '日時'];
const SHEET_MYSTERY = 'ミステリー進行';
const MYSTERY_HEADERS = ['会員ID', '解放した幕', 'スタンプ', '制覇', '更新日時'];

const MIGRATION_POINT_CAP = 3000; // 端末のポイントを引き継ぐ上限
const WELCOME_POINTS = 500;
const MYSTERY_STAGE_COUNT = 3;
// 1回限りのイベント報酬(アカウントごとに1回。名札は 'event:' + id)
const EVENT_REWARD_TABLE = {
  stage1: { points: 150, title: '神埼奇譚 第1幕解明報奨' },
  stage2: { points: 150, title: '神埼奇譚 第2幕解明報奨' },
  stage3: { points: 150, title: '神埼奇譚 第3幕解明報奨' },
  mashin: { points: 300, title: 'ミステリートレイン完全制覇' },
  launch2: { points: 300, title: 'NIZAKI 2.0 公開記念ボーナス' }
};
const RESERVATION_POINT_RATE = 0.03;
const RESERVATION_POINT_MIN = 50;
// 申告の金額を信じすぎないための上限(ポイントの決まりは変えない。ふつうの予約は、ここに届かない)
const POINT_BASIS_CAP = 100000;          // 1つの予約で、ポイントを計算する合計金額の上限
const DAILY_RESERVATION_POINT_CAP = 3000; // 1会員が、予約で付くポイントを、1日(日本時間)に受け取れる上限
const MAX_ACTIVE_RESERVATIONS = 20;       // 1会員の、まだ乗っていない(取消でない)予約の上限
// 1回の注文(予約・デリバリーの追加)の上限。超える申告は、予約の保存ごと断る(画面にも同じ上限を置く)
const MAX_ORDER_TOTAL = 100000; // 合計金額(N-POINTで払った分を含む)
const MAX_SEATS = 6;            // 1つの予約の座席の数(人数)
const MAX_ITEM_QUANTITY = 9;    // 1商品の個数
const MAX_ORDER_QUANTITY = 20;  // 1注文の個数の合計
const HISTORY_LIMIT = 30;
const ORDER_HISTORY_LIMIT = 30;
const RIDE_LOG_LIMIT = 500; // マイレージ・乗車記録に使う、乗車済みの予約の上限(新しい順)
// ポイントの付与コード(アプリのソースには置かず、ここだけに持つ)
const POINT_CODE_TABLE = {
  GIVE300: { points: 300, title: '【ミステリー制覇特典】消えた試運転列車の謎' }
};
const VALID_COUPON_CODES = ['AYAMI300', 'DISH20'];

function cellText(v, pattern) {
  return v instanceof Date ? Utilities.formatDate(v, 'Asia/Tokyo', pattern || 'yyyy/MM/dd HH:mm:ss') : String(v === undefined || v === null ? '' : v);
}

function nowText() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
}

function getOrCreateSheetWithHeaders(name, headers, textColumns) {
  const ss = getDataSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setBackground('#5B21B6').setFontColor('#FFFFFF').setFontWeight('bold');
    // 日時などを、シートが日付に変えてしまわないよう、文字のまま保つ
    (textColumns || []).forEach(function (c) { sheet.getRange(1, c, 1000, 1).setNumberFormat('@'); });
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function authMember(sessionToken) {
  const memberId = verifySessionToken(sessionToken);
  if (!memberId) {
    return { error: createJsonResponse({ status: 'error', code: 'session', message: 'ログインの有効期限が切れています。もう一度ログインしてください。' }) };
  }
  if (!findMemberById(memberId)) {
    return { error: createJsonResponse({ status: 'error', message: '会員情報が見つかりません。' }) };
  }
  return { memberId: memberId };
}

function notSyncedYetResponse() {
  return createJsonResponse({ status: 'error', message: '最初の同期が終わっていません。少し待って、もう一度お試しください。' });
}

function withScriptLock(fn) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return createJsonResponse({ status: 'error', message: '混み合っています。しばらくしてからもう一度お試しください。' });
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// ---- ポイント台帳 ----
function readMemberPoints(memberId) {
  const sheet = getOrCreateSheetWithHeaders(SHEET_POINTS, POINT_HEADERS, [1]);
  const data = sheet.getDataRange().getValues();
  const rows = [];
  const keys = {};
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]) !== memberId) continue;
    const row = {
      ts: cellText(data[i][0]),
      kind: String(data[i][2]),
      key: String(data[i][3]),
      points: Number(data[i][4]) || 0,
      title: String(data[i][5])
    };
    rows.push(row);
    keys[row.key] = row;
  }
  return { sheet: sheet, rows: rows, keys: keys };
}

// 同じ会員・同じ名札は、1つだけ。すでにあれば、何もしない(二重に付かない)。呼ぶ側が、ロックを持っていること
function addPointEntry(ledger, memberId, kind, key, points, title) {
  if (ledger.keys[key]) return false;
  const ts = nowText();
  ledger.sheet.appendRow([ts, memberId, kind, sheetSafe(key), points, sheetSafe(title)]);
  const row = { ts: ts, kind: kind, key: key, points: points, title: title };
  ledger.rows.push(row);
  ledger.keys[key] = row;
  return true;
}

function ledgerBalance(ledger) {
  let total = 0;
  ledger.rows.forEach(function (r) { total += r.points; });
  return Math.max(0, total);
}

function normalizePointCodeServer(raw) {
  return String(raw === undefined || raw === null ? '' : raw).trim().toUpperCase().replace(/[\s_-]/g, '');
}

function eventRewardsFrom(local) {
  const out = [];
  const arr = local && Array.isArray(local.eventRewards) ? local.eventRewards : [];
  arr.forEach(function (v) {
    const id = String(v);
    if (EVENT_REWARD_TABLE[id] && out.indexOf(id) === -1) out.push(id);
  });
  return out;
}

function redeemedCodesFrom(local) {
  const out = [];
  const arr = local && Array.isArray(local.redeemedCodes) ? local.redeemedCodes : [];
  arr.forEach(function (v) {
    const code = normalizePointCodeServer(v);
    if (POINT_CODE_TABLE[code] && out.indexOf(code) === -1) out.push(code);
  });
  return out;
}

function usedCouponsFrom(local) {
  const out = [];
  const arr = local && Array.isArray(local.usedCoupons) ? local.usedCoupons : [];
  arr.forEach(function (v) {
    const code = normalizePointCodeServer(v);
    if (VALID_COUPON_CODES.indexOf(code) !== -1 && out.indexOf(code) === -1) out.push(code);
  });
  return out;
}

// 初めてのとき1回だけ: 端末のポイントがあれば、上限つきで引き継ぐ。無ければ、ウェルカムボーナス
function ensureAccountInitialized(ledger, memberId, local) {
  if (ledger.keys['welcome'] || ledger.keys['migration']) return;
  const raw = local && typeof local.balance === 'number' && isFinite(local.balance) && local.balance >= 0 ? Math.floor(local.balance) : null;
  if (raw === null) {
    addPointEntry(ledger, memberId, 'welcome', 'welcome', WELCOME_POINTS, '神埼ID 新規登録ウェルカムボーナス');
    return;
  }
  const credited = Math.min(raw, MIGRATION_POINT_CAP);
  const note = raw > MIGRATION_POINT_CAP ? '(申告' + raw + 'pt・上限適用)' : '(申告' + raw + 'pt)';
  addPointEntry(ledger, memberId, 'migration', 'migration', credited, '端末のポイントの引き継ぎ' + note);
  // 端末の残高にすでに含まれている1回限りの報酬は、重ねて付かないよう、0ptの印だけを残す
  eventRewardsFrom(local).forEach(function (id) {
    addPointEntry(ledger, memberId, 'event', 'event:' + id, 0, '引き継ぎ済み: ' + EVENT_REWARD_TABLE[id].title);
  });
  redeemedCodesFrom(local).forEach(function (code) {
    addPointEntry(ledger, memberId, 'code', 'code:' + code, 0, '引き継ぎ済み: コード' + code);
  });
}

// 2台目以降の端末などで、まだ台帳にない1回限りの報酬を、サーバーの金額で付ける(残高は、引き継がない)
function mergeLocalClaims(ledger, memberId, local) {
  if (!local) return;
  eventRewardsFrom(local).forEach(function (id) {
    addPointEntry(ledger, memberId, 'event', 'event:' + id, EVENT_REWARD_TABLE[id].points, EVENT_REWARD_TABLE[id].title);
  });
  redeemedCodesFrom(local).forEach(function (code) {
    addPointEntry(ledger, memberId, 'code', 'code:' + code, POINT_CODE_TABLE[code].points, POINT_CODE_TABLE[code].title);
  });
}

// ---- 使用済みクーポン ----
function readMemberCoupons(memberId) {
  const sheet = getOrCreateSheetWithHeaders(SHEET_USED_COUPONS, USED_COUPON_HEADERS, [3]);
  const data = sheet.getDataRange().getValues();
  const codes = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === memberId) codes.push(String(data[i][1]));
  }
  return { sheet: sheet, codes: codes };
}

function addUsedCoupon(cs, memberId, code) {
  if (cs.codes.indexOf(code) !== -1) return false;
  cs.sheet.appendRow([memberId, code, nowText()]);
  cs.codes.push(code);
  return true;
}

// ---- ミステリー進行(先へ進むときだけ書き換える) ----
function sanitizeMystery(p) {
  const stage = p && Math.floor(Number(p.stage)) >= 1 ? Math.min(Math.floor(Number(p.stage)), MYSTERY_STAGE_COUNT) : 1;
  const stamps = [];
  (p && Array.isArray(p.stamps) ? p.stamps : []).forEach(function (s) {
    const n = s ? Math.floor(Number(s.stageNumber)) : 0;
    if (n >= 1 && n <= MYSTERY_STAGE_COUNT && !stamps.some(function (x) { return x.stageNumber === n; })) {
      stamps.push({
        stageNumber: n,
        stationId: limitText(s.stationId, 30),
        stationName: limitText(s.stationName, 30),
        stampedAt: limitText(s.stampedAt, 40)
      });
    }
  });
  return { stage: stage, stamps: stamps, cleared: !!(p && p.cleared) };
}

function readMemberMystery(memberId) {
  const sheet = getOrCreateSheetWithHeaders(SHEET_MYSTERY, MYSTERY_HEADERS, [5]);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) !== memberId) continue;
    let stamps = [];
    try { stamps = JSON.parse(String(data[i][2] || '[]')); } catch (err) { stamps = []; }
    const m = sanitizeMystery({ stage: data[i][1], stamps: stamps, cleared: String(data[i][3]) === 'true' || data[i][3] === true });
    m.row = i + 1;
    m.sheet = sheet;
    return m;
  }
  return { stage: 1, stamps: [], cleared: false, row: -1, sheet: sheet };
}

function mergeMystery(memberId, localProgress) {
  const current = readMemberMystery(memberId);
  if (!localProgress) return current;
  const incoming = sanitizeMystery(localProgress);
  const stamps = current.stamps.slice();
  incoming.stamps.forEach(function (s) {
    if (!stamps.some(function (x) { return x.stageNumber === s.stageNumber; })) stamps.push(s);
  });
  stamps.sort(function (a, b) { return a.stageNumber - b.stageNumber; });
  const merged = {
    stage: Math.max(current.stage, incoming.stage),
    stamps: stamps,
    cleared: current.cleared || incoming.cleared
  };
  const changed = merged.stage !== current.stage || merged.cleared !== current.cleared || merged.stamps.length !== current.stamps.length;
  if (changed || current.row === -1) {
    const values = [memberId, merged.stage, JSON.stringify(merged.stamps), merged.cleared ? 'true' : 'false', nowText()];
    if (current.row === -1) {
      current.sheet.appendRow(values);
    } else {
      current.sheet.getRange(current.row, 1, 1, values.length).setValues([values]);
    }
  }
  merged.sheet = current.sheet;
  merged.row = current.row;
  return merged;
}

// ---- 予約の履歴(予約台帳から作る) ----
function readMemberOrders(memberId) {
  const sheet = getDataSpreadsheet().getSheetByName(SHEET_RESERVATIONS);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];
  const col = {};
  headers.forEach(function (h, i) { col[h] = i; });
  const orders = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[col['会員ID']]) !== memberId) continue;
    const cancelled = String(row[col['ステータス']]) === 'キャンセル';
    const finished = cancelled || isReservationRowExpired(headers, row);
    if (!finished) continue; // まだ乗っていない予約は、履歴に含めない
    let detail = { items: [], itemDiscount: 0 };
    if (col['明細'] !== undefined && row[col['明細']]) {
      try { detail = JSON.parse(String(row[col['明細']])); } catch (err) { detail = { items: [], itemDiscount: 0 }; }
    }
    const items = Array.isArray(detail.items) ? detail.items : [];
    const itemDiscount = Number(detail.itemDiscount) || 0;
    const itemsTotal = items.reduce(function (sum, it) { return sum + (Number(it.price) || 0) * (Number(it.quantity) || 0); }, 0);
    const total = Number(row[col['合計金額']]) || 0;
    orders.push({
      orderId: String(row[col['予約番号']]),
      trainName: String(row[col['列車名']]),
      carNo: Number(row[col['号車']]) || 0,
      seatNo: String(row[col['座席番号']]),
      seatType: String(row[col['席種']]),
      boardingStation: String(row[col['乗車駅']]),
      destinationStation: String(row[col['降車駅']]),
      departureTime: cellText(row[col['出発時刻']], 'HH:mm'),
      arrivalTime: cellText(row[col['到着時刻']], 'HH:mm'),
      reservedDate: cellText(row[col['予約日']], 'yyyy-MM-dd'),
      ticketPrice: Math.max(0, total + itemDiscount - itemsTotal),
      items: items,
      itemDiscount: itemDiscount,
      result: cancelled ? 'cancelled' : 'completed',
      sortKey: cellText(row[col['予約日時']])
    });
  }
  orders.sort(function (a, b) { return a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0; });
  return orders.slice(0, ORDER_HISTORY_LIMIT).map(function (o) { delete o.sortKey; return o; });
}

// 乗車記録・マイレージ用: 乗車済み(到着時刻をすぎた、キャンセルでない)の予約を、新しい順に、必要な項目だけ返す
function readMemberRides(memberId) {
  const sheet = getDataSpreadsheet().getSheetByName(SHEET_RESERVATIONS);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];
  const col = {};
  headers.forEach(function (h, i) { col[h] = i; });
  const rides = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[col['会員ID']]) !== memberId) continue;
    if (String(row[col['ステータス']]) === 'キャンセル') continue;
    if (!isReservationRowExpired(headers, row)) continue;
    rides.push({
      orderId: String(row[col['予約番号']]),
      trainName: String(row[col['列車名']]),
      boardingStation: String(row[col['乗車駅']]),
      destinationStation: String(row[col['降車駅']]),
      reservedDate: cellText(row[col['予約日']], 'yyyy-MM-dd'),
      departureTime: cellText(row[col['出発時刻']], 'HH:mm'),
      seatType: String(row[col['席種']]),
      totalPrice: Number(row[col['合計金額']]) || 0,
      sortKey: cellText(row[col['予約日時']])
    });
  }
  rides.sort(function (a, b) { return a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0; });
  return rides.slice(0, RIDE_LOG_LIMIT).map(function (r) { delete r.sortKey; return r; });
}

function buildAccountData(memberId, ledger, coupons, mystery) {
  return {
    initialized: true,
    migrated: !!ledger.keys['migration'],
    balance: ledgerBalance(ledger),
    history: ledger.rows.slice(-HISTORY_LIMIT).reverse().map(function (r) {
      return { date: r.ts, title: r.title, points: r.points, kind: r.kind };
    }),
    usedCoupons: coupons.codes.slice(),
    claimedEvents: Object.keys(ledger.keys).filter(function (k) { return k.indexOf('event:') === 0; }).map(function (k) { return k.slice(6); }),
    eventTareCleared: !!ledger.keys[EVENT_TARE_KEY],
    mystery: { stage: mystery.stage, stamps: mystery.stamps, cleared: mystery.cleared },
    orders: readMemberOrders(memberId),
    rides: readMemberRides(memberId)
  };
}

// ---- 公開されるAPI ----

/**
 * ログインしたとき・画面を開いたときに呼ぶ。初めてなら、端末のデータを1回だけ引き継ぐ(無ければウェルカムボーナス)。
 * 2回目以降は、端末のデータのうち、まだ台帳にない1回限りの報酬・使用済みクーポン・ミステリーの進行だけを足し合わせる。
 */
function handleSyncAccount(sessionToken, local) {
  const a = authMember(sessionToken);
  if (a.error) return a.error;
  return withScriptLock(function () {
    const ledger = readMemberPoints(a.memberId);
    ensureAccountInitialized(ledger, a.memberId, local);
    mergeLocalClaims(ledger, a.memberId, local);
    const coupons = readMemberCoupons(a.memberId);
    usedCouponsFrom(local).forEach(function (c) { addUsedCoupon(coupons, a.memberId, c); });
    const mystery = mergeMystery(a.memberId, local && local.mystery);
    return createJsonResponse({ status: 'success', account: buildAccountData(a.memberId, ledger, coupons, mystery) });
  });
}

function handleEarnEventReward(sessionToken, rewardId) {
  const a = authMember(sessionToken);
  if (a.error) return a.error;
  const id = String(rewardId === undefined || rewardId === null ? '' : rewardId);
  const def = EVENT_REWARD_TABLE[id];
  if (!def) {
    return createJsonResponse({ status: 'error', message: '報酬の内容が正しくありません。' });
  }
  return withScriptLock(function () {
    const ledger = readMemberPoints(a.memberId);
    if (!ledger.keys['welcome'] && !ledger.keys['migration']) return notSyncedYetResponse();
    const added = addPointEntry(ledger, a.memberId, 'event', 'event:' + id, def.points, def.title);
    return createJsonResponse({ status: 'success', added: added, points: added ? def.points : 0, balance: ledgerBalance(ledger) });
  });
}

function handleRedeemPointCode(sessionToken, rawCode) {
  const a = authMember(sessionToken);
  if (a.error) return a.error;
  const code = normalizePointCodeServer(rawCode);
  if (!code) return createJsonResponse({ status: 'error', message: 'コードを入力してください。' });
  const def = POINT_CODE_TABLE[code];
  if (!def) return createJsonResponse({ status: 'error', message: '無効なコードです。' });
  return withScriptLock(function () {
    const ledger = readMemberPoints(a.memberId);
    if (!ledger.keys['welcome'] && !ledger.keys['migration']) return notSyncedYetResponse();
    if (!addPointEntry(ledger, a.memberId, 'code', 'code:' + code, def.points, def.title)) {
      return createJsonResponse({ status: 'error', message: 'このコードは既に使用済みです。' });
    }
    return createJsonResponse({ status: 'success', points: def.points, balance: ledgerBalance(ledger), title: def.title });
  });
}

// 予約の支払いに、N-POINT を使う(1pt=1円)。予約を確定する前に呼ぶ。同じ予約番号は1回だけ(二重に引かれない)。
// 使ったポイントは、予約を取り消しても戻らない(取消で取り消すのは、予約で付いたポイントだけ)
function handleSpendPoints(sessionToken, orderId, rawPoints, rawTitle) {
  const a = authMember(sessionToken);
  if (a.error) return a.error;
  const id = String(orderId === undefined || orderId === null ? '' : orderId);
  if (!/^[A-Za-z0-9-]{3,40}$/.test(id)) {
    return createJsonResponse({ status: 'error', message: '予約内容が正しくありません。' });
  }
  const points = Math.floor(Number(rawPoints));
  if (!(points >= 1) || points > MAX_ORDER_TOTAL) {
    return createJsonResponse({ status: 'error', message: '使うポイントが正しくありません。' });
  }
  return withScriptLock(function () {
    const ledger = readMemberPoints(a.memberId);
    if (!ledger.keys['welcome'] && !ledger.keys['migration']) return notSyncedYetResponse();
    const key = 'use:' + id;
    if (ledger.keys[key]) {
      // 通信のやり直し。すでに引いてあるので、何もしない
      return createJsonResponse({ status: 'success', spent: -ledger.keys[key].points, balance: ledgerBalance(ledger), added: false });
    }
    if (ledgerBalance(ledger) < points) {
      return createJsonResponse({ status: 'error', insufficient: true, balance: ledgerBalance(ledger), message: 'N-POINTの残高が足りません。' });
    }
    addPointEntry(ledger, a.memberId, 'spend', key, -points, limitText(rawTitle, 60) || '特急券・座席のお支払い(N-POINT)');
    return createJsonResponse({ status: 'success', spent: points, balance: ledgerBalance(ledger), added: true });
  });
}

// ---- 公開記念イベント『幻のタレと消えた頑固職人』のごほうび ----
// 判定は、すべてサーバーで行う(アプリのコードに、答えも額も置かない)。額は、ここの定数だけ。
// EVENT_REWARD_TABLE には入れない(入れると、アプリが、判定なしで受け取れてしまう)。
const EVENT_TARE_KEY = 'event:tare';
const EVENT_TARE_POINTS = 350;
const EVENT_TARE_TITLE = '幻のタレ事件 解決報奨（味覚捜査班）';
const EVENT_TARE_START_MS = Date.parse('2026-11-01T00:00:00+09:00');
const EVENT_TARE_RIDE_SECONDS = 2200;           // 東京〜土浦の予定の所要 36分40秒(特急めぐりは、どの便も同じ。ダイヤの実データ)
const EVENT_TARE_BOOKING_LEAD_MS = 5 * 60 * 1000; // 予約は、発車の5分前まで
const EVENT_TARE_DESTINATIONS = ['土浦', 'ひたちなか海浜公園', '日立'];
const EVENT_TARE_MAX_ATTEMPTS = 5;
const EVENT_TARE_ATTEMPT_SECONDS = 600;

function nowMs() {
  return Date.now();
}

// イベントの開始。テストのために、スクリプトプロパティ EVENT_TARE_START_MS(ミリ秒)があれば、それを使う
function eventTareStartMs() {
  const override = Number(PropertiesService.getScriptProperties().getProperty('EVENT_TARE_START_MS'));
  return isFinite(override) && override > 0 ? override : EVENT_TARE_START_MS;
}

function stripStationName(v) {
  return String(v === undefined || v === null ? '' : v).replace(/[（(].*?[）)]/g, '').trim().replace(/駅$/, '');
}

// 特急めぐり 東京発(下り)の発車は、5:05 から 23:05 まで、30分おき。始発(5:05)は、対象外
function isEventTareDeparture(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return false;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return minutes > 5 * 60 + 5 && minutes <= 23 * 60 + 5 && (minutes - (5 * 60 + 5)) % 30 === 0;
}

// 「2026/11/01 10:00:00」(日本時間。日付の型でも)を、ミリ秒にする。読めなければ null
function stampToMs(v) {
  const m = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(cellText(v));
  if (!m) return null;
  const ms = Date.parse(m[1] + '-' + m[2] + '-' + m[3] + 'T' + m[4] + ':' + m[5] + ':' + m[6] + '+09:00');
  return isFinite(ms) ? ms : null;
}

// この会員の予約番号が、ごほうびの条件を満たすか(読むだけ。ロックの中から呼ぶ)
function isEventTareEligible(memberId, orderId, now) {
  if (!/^[A-Za-z0-9-]{3,40}$/.test(orderId)) return false;
  const start = eventTareStartMs();
  if (now < start) return false; // 下の「発車がイベント開始以降」と重なる。サーバーの時刻で見ている、という意味で残す
  const sheet = getDataSpreadsheet().getSheetByName(SHEET_RESERVATIONS);
  if (!sheet) return false;
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return false;
  const col = {};
  data[0].forEach(function (h, i) { col[h] = i; });
  const need = ['予約番号', '会員ID', 'ステータス', '初回登録日時', '初回の内容'];
  for (let i = 0; i < need.length; i++) if (col[need[i]] === undefined) return false;
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[col['予約番号']]) !== orderId || String(row[col['会員ID']]) !== memberId) continue;
    if (String(row[col['ステータス']]) === 'キャンセル') return false;
    // 列車・区間・日付・発車時刻は、最初に登録されたときの内容だけを見る(あとの更新で書き換えられても、効かない)
    let first;
    try {
      first = JSON.parse(cellText(row[col['初回の内容']]));
    } catch (err) {
      return false;
    }
    if (!first || typeof first !== 'object') return false;
    if (String(first.train).indexOf('特急めぐり') !== 0) return false;
    if (stripStationName(first.from) !== '東京') return false;
    if (EVENT_TARE_DESTINATIONS.indexOf(stripStationName(first.to)) === -1) return false;
    const date = typeof first.date === 'string' ? first.date : '';
    const dep = typeof first.dep === 'string' ? first.dep : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isEventTareDeparture(dep)) return false;
    const depMs = Date.parse(date + 'T' + (dep.length === 4 ? '0' + dep : dep) + ':00+09:00');
    if (!isFinite(depMs) || depMs < start) return false;
    // 予約が、サーバーに最初に登録された時刻(アプリの申告ではない)が、発車の5分前までであること
    const registeredMs = stampToMs(row[col['初回登録日時']]);
    if (registeredMs === null || registeredMs > depMs - EVENT_TARE_BOOKING_LEAD_MS) return false;
    // 発車から、予定の所要時間が過ぎていること(サーバーの時刻。端末の時計は見ない。遅れは見ない)
    return now >= depMs + EVENT_TARE_RIDE_SECONDS * 1000;
  }
  return false;
}

// ごほうびを、1人1回だけ付ける。条件を満たさないときは、何が足りないかは返さない(総当たりの手がかりにしない)
function handleClaimEventTare(sessionToken, orderId) {
  const a = authMember(sessionToken);
  if (a.error) return a.error;
  const id = typeof orderId === 'string' ? orderId : '';
  const attemptKey = 'event_tare_try_' + a.memberId;
  const gate = reserveCounter(attemptKey, EVENT_TARE_MAX_ATTEMPTS, EVENT_TARE_ATTEMPT_SECONDS);
  if (gate === 'locked') {
    return createJsonResponse({ status: 'error', code: 'event_locked', message: 'しばらくしてからお試しください。' });
  }
  if (gate === 'busy') {
    return createJsonResponse({ status: 'error', code: 'event_busy', message: '混み合っています。しばらくしてからもう一度お試しください。' });
  }
  return withScriptLock(function () {
    const ledger = readMemberPoints(a.memberId);
    if (!ledger.keys['welcome'] && !ledger.keys['migration']) return notSyncedYetResponse();
    if (ledger.keys[EVENT_TARE_KEY]) {
      // 2回目以降(二重に押した・やり直し): すでに受け取り済み。何も付けない
      CacheService.getScriptCache().remove(attemptKey);
      return createJsonResponse({ status: 'success', added: false, points: 0, balance: ledgerBalance(ledger) });
    }
    if (!isEventTareEligible(a.memberId, id, nowMs())) {
      return createJsonResponse({ status: 'error', code: 'event_not_yet', message: 'まだ対象ではありません。' });
    }
    addPointEntry(ledger, a.memberId, 'event', EVENT_TARE_KEY, EVENT_TARE_POINTS, EVENT_TARE_TITLE);
    CacheService.getScriptCache().remove(attemptKey);
    return createJsonResponse({ status: 'success', added: true, points: EVENT_TARE_POINTS, balance: ledgerBalance(ledger) });
  });
}

function handleUseCoupon(sessionToken, rawCode) {
  const a = authMember(sessionToken);
  if (a.error) return a.error;
  const code = normalizePointCodeServer(rawCode);
  if (VALID_COUPON_CODES.indexOf(code) === -1) {
    return createJsonResponse({ status: 'error', message: '無効なクーポンコードです。' });
  }
  return withScriptLock(function () {
    const coupons = readMemberCoupons(a.memberId);
    if (!addUsedCoupon(coupons, a.memberId, code)) {
      return createJsonResponse({ status: 'error', alreadyUsed: true, message: 'このクーポンは既に使用済みです。' });
    }
    return createJsonResponse({ status: 'success' });
  });
}

function handleSaveMysteryProgress(sessionToken, progress) {
  const a = authMember(sessionToken);
  if (a.error) return a.error;
  return withScriptLock(function () {
    const m = mergeMystery(a.memberId, progress || {});
    return createJsonResponse({ status: 'success', mystery: { stage: m.stage, stamps: m.stamps, cleared: m.cleared } });
  });
}

// ---- 予約まわりのポイント(予約の登録・取消のロックの中から呼ばれる) ----

// 予約の明細(デリバリーの商品と割引)を、予約台帳の「明細」列に残す(列が無ければ、このとき足す)
function saveReservationDetail(sheet, row, order, pointBasis) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  let col = headers.indexOf('明細') + 1;
  if (col === 0) {
    col = headers.filter(function (v) { return v !== ''; }).length + 1;
    sheet.getRange(1, col).setValue('明細');
  }
  const seatNames = parseSeats(order.seatNo);
  const items = (Array.isArray(order.items) ? order.items : []).slice(0, 20).map(function (it) {
    const item = { name: limitText(it && it.name, 60), quantity: Math.floor(Number(it && it.quantity)) || 0, price: Math.floor(Number(it && it.price)) || 0 };
    const seats = sanitizeItemSeats(it && it.seats, seatNames, item.quantity);
    if (seats) item.seats = seats;
    return item;
  });
  const detail = {
    items: items,
    itemDiscount: Math.max(0, Math.floor(Number(order.itemDiscount)) || 0),
    pointsUsed: Math.max(0, Math.floor(Number(order.pointsUsed)) || 0),
    pointBasis: Math.max(0, Math.floor(Number(pointBasis)) || 0) // ポイントを計算した、いちばん大きい合計金額
  };
  sheet.getRange(row, col).setValue(JSON.stringify(detail));
}

// デリバリーの商品を、どの席に何個届けるか({ 席: 個数 })。この予約の席だけ・合計は注文の個数まで。割り振りが無い(または不正な)ときは付けない
function sanitizeItemSeats(raw, seatNames, quantity) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  let sum = 0;
  seatNames.forEach(function (seat) {
    if (!Object.prototype.hasOwnProperty.call(raw, seat)) return;
    const n = Math.floor(Number(raw[seat]));
    if (n >= 1 && sum + n <= quantity) {
      out[seat] = n;
      sum += n;
    }
  });
  return Object.keys(out).length > 0 ? out : null;
}

// 予約の明細の列から、これまでにポイントを計算した、いちばん大きい合計金額を読む(無ければ0)
function readPointBasis(detailCell) {
  if (!detailCell) return 0;
  try {
    return Math.max(0, Math.floor(Number(JSON.parse(String(detailCell)).pointBasis)) || 0);
  } catch (err) {
    return 0;
  }
}

// 今日(日本時間)、予約で付いたポイントの合計(取消で引いた分は、数えない)
function pointsAwardedToday(ledger) {
  const today = nowText().slice(0, 10);
  let sum = 0;
  ledger.rows.forEach(function (r) {
    if ((r.kind === 'reservation' || r.kind === 'delivery') && r.points > 0 && String(r.ts).slice(0, 10) === today) sum += r.points;
  });
  return sum;
}

function awardReservationPoints(memberId, orderId, total, previousTotal, trainName) {
  const ledger = readMemberPoints(memberId);
  // 最初の同期(端末のポイントの引き継ぎ)が済む前は、付けない。先に初期化すると、端末のポイントが引き継げなくなる
  if (!ledger.keys['welcome'] && !ledger.keys['migration']) return;
  if (previousTotal === null) {
    // 新しい予約: 合計金額(N-POINTで払った分は、含まない)の3%(最低50pt)。ぜんぶポイントで払ったときは、付けない
    if (total <= 0) return;
    const points = Math.min(Math.max(RESERVATION_POINT_MIN, Math.floor(total * RESERVATION_POINT_RATE)), DAILY_RESERVATION_POINT_CAP - pointsAwardedToday(ledger));
    if (points <= 0) return;
    addPointEntry(ledger, memberId, 'reservation', 'reservation:' + orderId, points, (trainName || '特急列車予約') + ' 乗車・デリバリー利用');
    return;
  }
  if (total > previousTotal) {
    // デリバリーを足した: 増えた金額の3%(最低はなし。最低50ptは、新しい予約だけ)。金額が変わらない再送では、何も付かない。
    // 3%が0ptになる少額は、行を作らない
    const prefix = 'delivery:' + orderId + ':';
    let n = 1;
    Object.keys(ledger.keys).forEach(function (k) { if (k.indexOf(prefix) === 0) n++; });
    const points = Math.min(Math.floor((total - previousTotal) * RESERVATION_POINT_RATE), DAILY_RESERVATION_POINT_CAP - pointsAwardedToday(ledger));
    if (points <= 0) return;
    addPointEntry(ledger, memberId, 'delivery', prefix + n, points, (trainName || '特急列車予約') + ' 乗車・デリバリー利用');
  }
}

function revokeReservationPoints(memberId, orderId) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    Logger.log('ポイント取消のロックを取れませんでした: ' + orderId);
    return;
  }
  try {
    const ledger = readMemberPoints(memberId);
    const cancelKey = 'cancel:' + orderId;
    if (ledger.keys[cancelKey]) return;
    const prefix = 'delivery:' + orderId + ':';
    let earned = 0;
    ledger.rows.forEach(function (r) {
      if (r.key === 'reservation:' + orderId || r.key.indexOf(prefix) === 0) earned += r.points;
    });
    if (earned > 0) {
      addPointEntry(ledger, memberId, 'cancel', cancelKey, -earned, '予約取消によるポイント取消');
    }
  } finally {
    lock.releaseLock();
  }
}
