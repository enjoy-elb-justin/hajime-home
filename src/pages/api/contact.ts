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

function parseSubmission(formData: FormData): ContactSubmission {
  return {
    company: normalizeLine(formData.get('企業名/組織名'), 200),
    familyName: normalizeLine(formData.get('姓'), 100),
    givenName: normalizeLine(formData.get('名'), 100),
    phone: normalizeLine(formData.get('電話番号'), 30),
    email: normalizeLine(formData.get('メールアドレス'), 254).toLowerCase(),
    type: normalizeLine(formData.get('お問い合わせ種別'), 100),
    message: normalizeMessage(formData.get('お問い合わせ内容')),
  };
}

function validateSubmission(submission: ContactSubmission, consent: boolean): string | null {
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

  if (!consent) {
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

function adminEmail(submission: ContactSubmission): Parameters<typeof sendBrevoEmail>[0] {
  const config = getContactEmailConfig();
  const fullName = `${submission.familyName} ${submission.givenName}`;
  const rows = [
    ['企業名/組織名', submission.company],
    ['お名前', fullName],
    ['電話番号', submission.phone],
    ['メールアドレス', submission.email],
    ['お問い合わせ種別', submission.type],
  ].map(([label, value]) => `<tr><th style="padding:8px 12px;border:1px solid #ddd;text-align:left;background:#f5f5f5">${escapeHtml(label)}</th><td style="padding:8px 12px;border:1px solid #ddd">${escapeHtml(value)}</td></tr>`).join('');

  return {
    to: [config.recipient],
    replyTo: { email: submission.email, name: fullName },
    subject: `【Webお問い合わせ】${submission.type}｜${submission.company}`,
    htmlContent: `<!doctype html><html lang="ja"><body style="font-family:sans-serif;color:#292929"><h1 style="font-size:20px">Webサイトからお問い合わせがありました</h1><table style="border-collapse:collapse;width:100%;max-width:680px">${rows}</table><h2 style="font-size:16px;margin-top:24px">お問い合わせ内容</h2><div style="white-space:pre-wrap;padding:16px;background:#f5f5f5;border-radius:6px">${escapeHtml(submission.message)}</div><p style="margin-top:24px;color:#666;font-size:12px">このメールに返信すると、お問い合わせ者のメールアドレス宛に送信されます。</p></body></html>`,
    textContent: [
      'Webサイトからお問い合わせがありました。',
      '',
      `企業名/組織名：${submission.company}`,
      `お名前：${fullName}`,
      `電話番号：${submission.phone}`,
      `メールアドレス：${submission.email}`,
      `お問い合わせ種別：${submission.type}`,
      '',
      'お問い合わせ内容：',
      submission.message,
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
    htmlContent: `<!doctype html><html lang="ja"><body style="font-family:sans-serif;color:#292929;line-height:1.7"><p>${escapeHtml(fullName)} 様</p><p>このたびはHAJIMEコンサルティング株式会社へお問い合わせいただき、誠にありがとうございます。</p><p>以下の内容でお問い合わせを受け付けました。内容を確認のうえ、通常3営業日以内に担当者よりご連絡いたします。</p><div style="padding:16px;background:#f5f5f5;border-radius:6px"><p><strong>お問い合わせ種別：</strong>${escapeHtml(submission.type)}</p><div style="white-space:pre-wrap">${escapeHtml(submission.message)}</div></div><p>お急ぎの場合は、06-7172-3752（平日 9:00〜18:00）までご連絡ください。</p><hr style="border:0;border-top:1px solid #ddd"><p style="font-size:12px;color:#666">HAJIMEコンサルティング株式会社<br><a href="https://hajime-jp.co.jp/">https://hajime-jp.co.jp/</a></p></body></html>`,
    textContent: [
      `${fullName} 様`,
      '',
      'このたびはHAJIMEコンサルティング株式会社へお問い合わせいただき、誠にありがとうございます。',
      '以下の内容でお問い合わせを受け付けました。内容を確認のうえ、通常3営業日以内に担当者よりご連絡いたします。',
      '',
      `お問い合わせ種別：${submission.type}`,
      submission.message,
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

  const submission = parseSubmission(formData);
  const consent = formData.get('プライバシーポリシーへの同意') === 'on';
  const validationError = validateSubmission(submission, consent);
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
