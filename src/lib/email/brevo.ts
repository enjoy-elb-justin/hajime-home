import { env } from 'cloudflare:workers';

export interface EmailRecipient {
  email: string;
  name?: string;
}

export interface SendEmailPayload {
  to: EmailRecipient[];
  replyTo?: EmailRecipient;
  subject: string;
  htmlContent: string;
  textContent: string;
  tags?: string[];
}

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface ContactEmailConfig {
  sender: EmailRecipient;
  recipient: EmailRecipient;
  replyTo: EmailRecipient;
}

export function getContactEmailConfig(): ContactEmailConfig {
  return {
    sender: {
      name: env.BREVO_SENDER_NAME,
      email: env.BREVO_SENDER_EMAIL,
    },
    recipient: {
      name: env.CONTACT_RECIPIENT_NAME,
      email: env.CONTACT_RECIPIENT_EMAIL,
    },
    replyTo: {
      name: env.CONTACT_REPLY_TO_NAME,
      email: env.CONTACT_REPLY_TO_EMAIL,
    },
  };
}

function cleanRecipient(recipient: EmailRecipient): EmailRecipient | null {
  const email = recipient.email.trim().toLowerCase();
  if (!email || !email.includes('@') || email.length > 254) return null;

  const name = recipient.name?.trim();
  return { email, name: name || undefined };
}

export async function sendBrevoEmail(payload: SendEmailPayload): Promise<EmailSendResult> {
  const apiKey: unknown = Reflect.get(env, 'BREVO_API_KEY');
  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    console.error(JSON.stringify({
      message: 'Brevo email configuration is incomplete',
      missing: 'BREVO_API_KEY',
    }));
    return { success: false, error: 'Email service is not configured' };
  }

  const config = getContactEmailConfig();
  const sender = cleanRecipient(config.sender);
  const to = payload.to.map(cleanRecipient).filter((item): item is EmailRecipient => item !== null);
  const replyTo = payload.replyTo ? cleanRecipient(payload.replyTo) : null;

  if (!sender || to.length === 0) {
    console.error(JSON.stringify({ message: 'Brevo sender or recipient is invalid' }));
    return { success: false, error: 'Email sender or recipient is invalid' };
  }

  const requestBody = {
    sender,
    to,
    replyTo: replyTo ?? undefined,
    subject: payload.subject,
    htmlContent: payload.htmlContent,
    textContent: payload.textContent,
    tags: Array.from(new Set(['hajime-contact', 'transactional', ...(payload.tags ?? [])])).slice(0, 8),
    headers: {
      'Auto-Submitted': 'auto-generated',
    },
  };

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.error(JSON.stringify({
        message: 'Brevo rejected an email request',
        status: response.status,
      }));
      return { success: false, error: `Brevo returned HTTP ${response.status}` };
    }

    const result: unknown = await response.json();
    const messageId =
      typeof result === 'object' && result !== null &&
      typeof Reflect.get(result, 'messageId') === 'string'
        ? String(Reflect.get(result, 'messageId'))
        : undefined;

    return { success: true, messageId };
  } catch (error) {
    console.error(JSON.stringify({
      message: 'Brevo request failed',
      error: error instanceof Error ? error.message : String(error),
    }));
    return { success: false, error: 'Email service request failed' };
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
