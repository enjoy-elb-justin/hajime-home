import type { APIRoute } from 'astro';
import { getContactEmailConfig, sendBrevoEmail } from '../../lib/email/brevo';

export const prerender = false;

const TEST_RECIPIENT = 'enjoy.elb.justin@gmail.com';

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}

export const POST: APIRoute = async ({ request }) => {
  if (!import.meta.env.DEV) {
    return json({ ok: false, message: 'Not found' }, 404);
  }

  if (!isAllowedOrigin(request)) {
    return json({ ok: false, message: 'Origin is not allowed' }, 403);
  }

  const config = getContactEmailConfig();
  if (
    config.recipient.email.trim().toLowerCase() !== TEST_RECIPIENT ||
    config.replyTo.email.trim().toLowerCase() !== TEST_RECIPIENT
  ) {
    return json({
      ok: false,
      message: `CONTACT_RECIPIENT_EMAIL and CONTACT_REPLY_TO_EMAIL must both be ${TEST_RECIPIENT}`,
    }, 500);
  }

  const requestId = crypto.randomUUID();
  const sentAt = new Date().toISOString();
  const result = await sendBrevoEmail({
    to: [{ email: TEST_RECIPIENT, name: 'HAJIME 開発テスト' }],
    replyTo: config.replyTo,
    subject: `【HAJIME】メール送信テスト ${sentAt}`,
    htmlContent: `<!doctype html><html lang="ja"><body style="font-family:sans-serif;color:#292929;line-height:1.7"><h1 style="font-size:20px">メール送信テスト成功</h1><p>HAJIME 公式サイトのローカル開発環境から Brevo への接続確認メールです。</p><dl><dt>Request ID</dt><dd>${requestId}</dd><dt>Sent at</dt><dd>${sentAt}</dd></dl></body></html>`,
    textContent: [
      'メール送信テスト成功',
      'HAJIME 公式サイトのローカル開発環境から Brevo への接続確認メールです。',
      `Request ID: ${requestId}`,
      `Sent at: ${sentAt}`,
    ].join('\n'),
    tags: ['connectivity-test'],
  });

  if (!result.success) {
    return json({ ok: false, requestId, message: result.error ?? 'Email delivery failed' }, 502);
  }

  return json({ ok: true, requestId, messageId: result.messageId });
};

export const ALL: APIRoute = () => json({ ok: false, message: 'POST method required' }, 405);
