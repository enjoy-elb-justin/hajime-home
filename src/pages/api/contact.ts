import type { APIRoute } from 'astro';
import {
  escapeHtml,
  getContactEmailConfig,
  sendBrevoEmail,
  type EmailSendResult,
} from '../../lib/email/brevo';

export const prerender = false;

const MAX_BODY_BYTES = 32 * 1024;
const CONTACT_TYPES = new Set([
  '在日経営コンサルティング支援のご相談',
  '組織運営・コミュニケーション支援のご相談',
  '専門家連携サポートのご相談',
  'その他',
]);

interface ContactSubmission {
  company: string;
  familyName: string;
  givenName: string;
  phone: string;
  email: string;
  type: string;
  message: string;
  consent: boolean;
  environment: ContactEnvironment;
}

interface ContactEnvironment {
  receivedAt: string;
  browser: string;
  operatingSystem: string;
  deviceType: string;
  language: string;
  timezone: string;
  viewport: string;
  screen: string;
  region: string;
}

interface ContactEmailField {
  label: string;
  value: string;
}

function normalizeLine(value: FormDataEntryValue | null, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalizeMessage(value: FormDataEntryValue | null): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .slice(0, 5000);
}

function cleanClientHint(value: string | null): string {
  return normalizeLine(value, 120).replace(/^"|"$/g, '');
}

function detectBrowser(userAgent: string, clientHint: string): string {
  const browsers: Array<[RegExp, string]> = [
    [/Edg\/([\d.]+)/, 'Microsoft Edge'],
    [/OPR\/([\d.]+)/, 'Opera'],
    [/CriOS\/([\d.]+)/, 'Google Chrome'],
    [/Chrome\/([\d.]+)/, 'Google Chrome'],
    [/FxiOS\/([\d.]+)/, 'Mozilla Firefox'],
    [/Firefox\/([\d.]+)/, 'Mozilla Firefox'],
    [/Version\/([\d.]+).*Safari\//, 'Safari'],
  ];

  for (const [pattern, name] of browsers) {
    const match = userAgent.match(pattern);
    if (match) return `${name} ${match[1]}`;
  }

  if (clientHint) {
    const brands = [...clientHint.matchAll(/"([^"]+)";v="([\d.]+)"/g)]
      .filter(([, brand]) => !/not.?a.?brand/i.test(brand))
      .map(([, brand, version]) => `${brand} ${version}`);
    if (brands.length) return brands.join(' / ');
  }

  return '取得できません';
}

function detectOperatingSystem(userAgent: string, platformHint: string): string {
  if (platformHint) return platformHint;

  const ios = userAgent.match(/(?:iPhone|CPU(?: iPhone)? OS) ([\d_]+)/);
  if (ios) return `iOS ${ios[1].replaceAll('_', '.')}`;

  const android = userAgent.match(/Android ([\d.]+)/);
  if (android) return `Android ${android[1]}`;

  if (/Windows NT/.test(userAgent)) return 'Windows';
  if (/Macintosh|Mac OS X/.test(userAgent)) return 'macOS';
  if (/CrOS/.test(userAgent)) return 'ChromeOS';
  if (/Linux/.test(userAgent)) return 'Linux';
  return '取得できません';
}

function detectDeviceType(userAgent: string, clientMobile: string): string {
  if (/iPad|Tablet/i.test(userAgent)) return 'タブレット';
  if (clientMobile === 'true' || /Mobile|iPhone|Android/i.test(userAgent)) return 'モバイル';
  if (clientMobile === 'false' || userAgent) return 'デスクトップ';
  return '取得できません';
}

function formatReceivedAt(date: Date): string {
  const japanTime = new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Tokyo',
  }).format(date);

  return `${japanTime} JST\n${date.toISOString()} UTC`;
}

function buildEnvironment(request: Request, formData: FormData, receivedAt: Date): ContactEnvironment {
  const userAgent = normalizeLine(request.headers.get('User-Agent'), 512);
  const clientHint = normalizeLine(request.headers.get('Sec-CH-UA'), 300);
  const platformHint = cleanClientHint(request.headers.get('Sec-CH-UA-Platform')) ||
    normalizeLine(formData.get('_client_platform'), 80);
  const requestWithCf = request as Request & {
    cf?: {
      country?: unknown;
      region?: unknown;
      city?: unknown;
      timezone?: unknown;
    };
  };
  const cf = requestWithCf.cf;
  const country = typeof cf?.country === 'string'
    ? cf.country
    : request.headers.get('CF-IPCountry');
  const region = [country, cf?.region, cf?.city]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => normalizeLine(value, 100))
    .join(' / ');
  const clientTimezone = normalizeLine(formData.get('_client_timezone'), 100);
  const browserLanguage = normalizeLine(formData.get('_client_language'), 100) ||
    normalizeLine(request.headers.get('Accept-Language')?.split(',')[0] ?? '', 100);
  const viewport = normalizeLine(formData.get('_client_viewport'), 40);
  const screen = normalizeLine(formData.get('_client_screen'), 60);

  return {
    receivedAt: formatReceivedAt(receivedAt),
    browser: detectBrowser(userAgent, clientHint),
    operatingSystem: detectOperatingSystem(userAgent, platformHint),
    deviceType: detectDeviceType(userAgent, normalizeLine(formData.get('_client_mobile'), 10)),
    language: browserLanguage || '取得できません',
    timezone: clientTimezone || (typeof cf?.timezone === 'string' ? normalizeLine(cf.timezone, 100) : '') || '取得できません',
    viewport: viewport || '取得できません',
    screen: screen || '取得できません',
    region: region || '取得できません（ローカル環境またはCloudflare情報なし）',
  };
}

function parseSubmission(formData: FormData, request: Request, receivedAt: Date): ContactSubmission {
  return {
    company: normalizeLine(formData.get('企業名/組織名'), 200),
    familyName: normalizeLine(formData.get('姓'), 100),
    givenName: normalizeLine(formData.get('名'), 100),
    phone: normalizeLine(formData.get('電話番号'), 30),
    email: normalizeLine(formData.get('メールアドレス'), 254).toLowerCase(),
    type: normalizeLine(formData.get('お問い合わせ種別'), 100),
    message: normalizeMessage(formData.get('お問い合わせ内容')),
    consent: formData.get('プライバシーポリシーへの同意') === 'on',
    environment: buildEnvironment(request, formData, receivedAt),
  };
}

function validateSubmission(submission: ContactSubmission): string | null {
  if (
    !submission.company ||
    !submission.familyName ||
    !submission.givenName ||
    !submission.phone ||
    !submission.email ||
    !submission.type ||
    !submission.message
  ) {
    return '必須項目をすべて入力してください。';
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submission.email)) {
    return 'メールアドレスの形式を確認してください。';
  }

  if (!/^[0-9０-９+＋()（）\-ー\s]{6,30}$/.test(submission.phone)) {
    return '電話番号の形式を確認してください。';
  }

  if (!CONTACT_TYPES.has(submission.type)) {
    return 'お問い合わせ種別を選択してください。';
  }

  if (!submission.consent) {
    return 'プライバシーポリシーへの同意が必要です。';
  }

  return null;
}

function wantsJson(request: Request): boolean {
  return request.headers.get('Accept')?.includes('application/json') ?? false;
}

function errorResponse(request: Request, status: number, message: string): Response {
  if (wantsJson(request)) {
    return Response.json({ ok: false, message }, {
      status,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const safeMessage = escapeHtml(message);
  return new Response(`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>送信できませんでした</title><body><main><h1>送信できませんでした</h1><p>${safeMessage}</p><p><a href="/contact">お問い合わせフォームに戻る</a></p></main></body></html>`, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}

function successResponse(request: Request): Response {
  if (wantsJson(request)) {
    return Response.json({ ok: true, redirect: '/contact/thanks' }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  return new Response(null, {
    status: 303,
    headers: {
      'Cache-Control': 'no-store',
      Location: '/contact/thanks',
    },
  });
}

function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin');
  if (!origin) return true;

  const requestOrigin = new URL(request.url).origin;
  return origin === requestOrigin;
}

function contactEmailFields(submission: ContactSubmission): ContactEmailField[] {
  return [
    { label: '企業名/組織名', value: submission.company },
    { label: '姓', value: submission.familyName },
    { label: '名', value: submission.givenName },
    { label: '電話番号', value: submission.phone },
    { label: 'メールアドレス', value: submission.email },
    { label: 'お問い合わせ種別', value: submission.type },
    { label: 'お問い合わせ内容', value: submission.message },
    {
      label: 'プライバシーポリシーへの同意',
      value: submission.consent ? '同意する' : '同意しない',
    },
    { label: '受付日時', value: submission.environment.receivedAt },
    { label: 'ブラウザ', value: submission.environment.browser },
    { label: 'OS', value: submission.environment.operatingSystem },
    { label: 'デバイス', value: submission.environment.deviceType },
    { label: 'ブラウザ言語', value: submission.environment.language },
    { label: 'タイムゾーン', value: submission.environment.timezone },
    { label: '表示領域', value: submission.environment.viewport },
    { label: '画面サイズ', value: submission.environment.screen },
    { label: '接続元地域（概算）', value: submission.environment.region },
  ];
}

function contactDetailsHtml(submission: ContactSubmission): string {
  const rows = contactEmailFields(submission)
    .map(({ label, value }) => `<tr><th scope="row" style="box-sizing:border-box;width:35%;padding:10px 12px;border:1px solid #ddd;text-align:left;vertical-align:top;background:#f5f5f5">${escapeHtml(label)}</th><td style="box-sizing:border-box;padding:10px 12px;border:1px solid #ddd;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(value)}</td></tr>`)
    .join('');

  return `<table style="border-collapse:collapse;width:100%;max-width:680px;table-layout:fixed">${rows}</table>`;
}

function contactDetailsText(submission: ContactSubmission): string {
  return contactEmailFields(submission)
    .map(({ label, value }) => `${label}：\n${value}`)
    .join('\n\n');
}

function adminEmail(submission: ContactSubmission): Parameters<typeof sendBrevoEmail>[0] {
  const config = getContactEmailConfig();
  const fullName = `${submission.familyName} ${submission.givenName}`;

  return {
    to: [config.recipient],
    replyTo: { email: submission.email, name: fullName },
    subject: `【Webお問い合わせ】${submission.type}｜${submission.company}`,
    htmlContent: `<!doctype html><html lang="ja"><body style="font-family:sans-serif;color:#292929;line-height:1.7"><h1 style="font-size:20px">Webサイトからお問い合わせがありました</h1>${contactDetailsHtml(submission)}<p style="margin-top:24px;color:#666;font-size:12px">このメールに返信すると、お問い合わせ者のメールアドレス宛に送信されます。</p></body></html>`,
    textContent: [
      'Webサイトからお問い合わせがありました。',
      '',
      contactDetailsText(submission),
    ].join('\n'),
    tags: ['admin-notification'],
  };
}

function confirmationEmail(submission: ContactSubmission): Parameters<typeof sendBrevoEmail>[0] {
  const config = getContactEmailConfig();
  const fullName = `${submission.familyName} ${submission.givenName}`;

  return {
    to: [{ email: submission.email, name: fullName }],
    replyTo: config.replyTo,
    subject: '【HAJIMEコンサルティング】お問い合わせを受け付けました',
    htmlContent: `<!doctype html><html lang="ja"><body style="font-family:sans-serif;color:#292929;line-height:1.7"><p>${escapeHtml(fullName)} 様</p><p>このたびはHAJIMEコンサルティング株式会社へお問い合わせいただき、誠にありがとうございます。</p><p>以下の内容でお問い合わせを受け付けました。内容を確認のうえ、通常3営業日以内に担当者よりご連絡いたします。</p>${contactDetailsHtml(submission)}<p>お急ぎの場合は、06-7172-3752（平日 9:00〜18:00）までご連絡ください。</p><hr style="border:0;border-top:1px solid #ddd"><p style="font-size:12px;color:#666">HAJIMEコンサルティング株式会社<br><a href="https://hajime-jp.co.jp/">https://hajime-jp.co.jp/</a></p></body></html>`,
    textContent: [
      `${fullName} 様`,
      '',
      'このたびはHAJIMEコンサルティング株式会社へお問い合わせいただき、誠にありがとうございます。',
      '以下の内容でお問い合わせを受け付けました。内容を確認のうえ、通常3営業日以内に担当者よりご連絡いたします。',
      '',
      contactDetailsText(submission),
      '',
      'お急ぎの場合：06-7172-3752（平日 9:00〜18:00）',
      'HAJIMEコンサルティング株式会社',
      'https://hajime-jp.co.jp/',
    ].join('\n'),
    tags: ['customer-confirmation'],
  };
}

export const POST: APIRoute = async ({ request }) => {
  const requestId = crypto.randomUUID();
  const receivedAt = new Date();

  if (!isAllowedOrigin(request)) {
    return errorResponse(request, 403, 'このページからもう一度送信してください。');
  }

  const contentLength = Number(request.headers.get('Content-Length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return errorResponse(request, 413, 'お問い合わせ内容が長すぎます。');
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse(request, 400, 'フォームの内容を読み取れませんでした。');
  }

  if (normalizeLine(formData.get('website'), 200)) {
    return successResponse(request);
  }

  const submission = parseSubmission(formData, request, receivedAt);
  const validationError = validateSubmission(submission);
  if (validationError) {
    return errorResponse(request, 400, validationError);
  }

  let adminResult: EmailSendResult;
  try {
    adminResult = await sendBrevoEmail(adminEmail(submission));
  } catch (error) {
    console.error(JSON.stringify({
      message: 'Unexpected contact email error',
      requestId,
      error: error instanceof Error ? error.message : String(error),
    }));
    return errorResponse(request, 502, '現在送信できません。時間をおいてもう一度お試しください。');
  }

  if (!adminResult.success) {
    console.error(JSON.stringify({
      message: 'Contact notification was not delivered',
      requestId,
      error: adminResult.error,
    }));
    return errorResponse(request, 502, '現在送信できません。時間をおいてもう一度お試しください。');
  }

  const confirmationResult = await sendBrevoEmail(confirmationEmail(submission));
  if (!confirmationResult.success) {
    console.error(JSON.stringify({
      message: 'Contact confirmation was not delivered',
      requestId,
      error: confirmationResult.error,
    }));
  }

  console.log(JSON.stringify({
    message: 'Contact form delivered',
    requestId,
    adminMessageId: adminResult.messageId,
    confirmationMessageId: confirmationResult.messageId,
  }));

  return successResponse(request);
};

export const ALL: APIRoute = ({ request }) => errorResponse(request, 405, 'POSTメソッドを使用してください。');
