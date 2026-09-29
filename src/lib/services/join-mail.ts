import { env } from 'cloudflare:workers';
import { EmailMessage } from 'cloudflare:email';
import type { NewJoinRequest } from './join';

/**
 * Emails a new "Join us" application to the editorial inboxes, via the
 * Cloudflare Email Routing `send_email` binding (no API key; recipients must be
 * verified destination addresses in Email Routing for awamimohabbat.com).
 *
 * Recipients come from the JOIN_NOTIFY_TO var (comma-separated) in
 * wrangler.jsonc, so changing them is a config edit, not a code change.
 *
 * Applicant text only ever goes into the base64 body. The one header that
 * carries applicant data (Reply-To) is a schema-validated email with CR/LF
 * stripped, so nothing a visitor types can add headers (CWE-93).
 */
const FROM = 'join@awamimohabbat.com';
const FROM_NAME = 'Awami Mohabbat website';

const noCrlf = (v: string) => v.replace(/[\r\n]+/g, ' ').trim();
const b64 = (v: string) => {
  const bytes = new TextEncoder().encode(v);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};
/** RFC 2047 encoded-word, so non-ASCII subjects survive every mail client. */
const encodeHeader = (v: string) => `=?UTF-8?B?${b64(noCrlf(v))}?=`;
/** Base64 bodies must wrap at 76 characters (RFC 2045). */
const wrap76 = (v: string) => v.replace(/.{1,76}/g, (line) => `${line}\r\n`);

export function recipients(): string[] {
  const raw = env.JOIN_NOTIFY_TO ?? '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[^\s@,<>"]+@[^\s@,<>"]+\.[^\s@,<>"]+$/.test(s));
}

export function buildMessage(to: string, app: NewJoinRequest, id: number, now = new Date()): string {
  const subject = `New "Join us" application #${id}`;
  const when = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(now);
  const body = [
    'A new application was sent from the "Join us" form on awamimohabbat.com.',
    '',
    `Name:       ${app.name}`,
    `Profession: ${app.profession}`,
    `Address:    ${app.address}`,
    `Email:      ${app.email}`,
    `Phone:      ${app.phone}`,
    `Page:       ${app.locale === 'en' ? 'English' : 'Urdu'}`,
    `Received:   ${when} (Pakistan time)`,
    `Reference:  #${id}`,
    '',
    'Reply to this email to answer the applicant directly.',
  ].join('\r\n');

  const domain = FROM.split('@')[1];
  return [
    `From: ${encodeHeader(FROM_NAME)} <${FROM}>`,
    `To: <${noCrlf(to)}>`,
    `Reply-To: <${noCrlf(app.email)}>`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${now.toUTCString()}`,
    `Message-ID: <join-${id}-${now.getTime()}@${domain}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(b64(body)),
  ].join('\r\n');
}

/**
 * Best effort: the application is already saved, so a mail failure must not
 * fail the visitor's submission. Logs outcome only — never the applicant's
 * details (rule 09).
 */
export async function notifyJoinRequest(app: NewJoinRequest, id: number): Promise<void> {
  const binding = env.JOIN_MAIL as SendEmail | undefined;
  const to = recipients();
  if (!binding || to.length === 0) {
    console.warn(`join-mail: skipped for #${id} (binding ${binding ? 'ok' : 'missing'}, ${to.length} recipients)`);
    return;
  }
  const results = await Promise.allSettled(
    to.map((addr) => binding.send(new EmailMessage(FROM, addr, buildMessage(addr, app, id)))),
  );
  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed) console.error(`join-mail: #${id} failed for ${failed} of ${to.length} recipients`);
}
