/**
 * Disposable inbox for hosted GoTrue.
 *
 * Hosted Auth (built-in SMTP) runs DNS/MX checks when it actually sends.
 * `example.com` publishes a null MX, so the mailer returns
 * `Email address "…" is invalid` as soon as a send slot is free.
 * Guerrilla Mail domains have real MX records and a public JSON API,
 * so the suite can also follow a confirmation link if Confirm email is still on.
 */

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; LifeResetQA/1.0)' };

export type Inbox = { email: string; sid: string };

async function gm(params: Record<string, string>, sid?: string): Promise<Record<string, unknown>> {
  const url = `https://api.guerrillamail.com/ajax.php?${new URLSearchParams(params)}`;
  const headers: Record<string, string> = { ...UA };
  if (sid) headers.Cookie = `PHPSESSID=${sid}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Guerrilla Mail ${res.status} for ${params.f}`);
  return (await res.json()) as Record<string, unknown>;
}

export async function allocateInbox(): Promise<Inbox> {
  const created = await gm({ f: 'get_email_address' });
  const sid = String(created.sid_token ?? '');
  const local = `playwright.reset.${Date.now()}`;
  const set = await gm({ f: 'set_email_user', email_user: local, sid_token: sid }, sid);
  const email = String(set.email_addr ?? '');
  const nextSid = String(set.sid_token ?? sid);
  if (!email || !nextSid) throw new Error('Guerrilla Mail did not return an inbox');
  return { email, sid: nextSid };
}

function extractVerifyLink(body: string): string | null {
  const decoded = body.replace(/&amp;/g, '&');
  const match = decoded.match(/https?:\/\/[^\s"'<>]+\/auth\/v1\/verify[^\s"'<>]*/i)
    ?? decoded.match(/https?:\/\/[^\s"'<>]+\/auth\/confirm[^\s"'<>]*/i);
  return match ? match[0] : null;
}

export async function waitForConfirmLink(inbox: Inbox, timeoutMs = 90_000): Promise<string | null> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const list = await gm({ f: 'get_email_list', offset: '0', sid_token: inbox.sid }, inbox.sid);
    const messages = Array.isArray(list.list) ? (list.list as Array<Record<string, unknown>>) : [];
    for (const mail of messages) {
      const blob = `${mail.mail_from ?? ''} ${mail.mail_subject ?? ''} ${mail.mail_excerpt ?? ''}`;
      if (!/supabase|confirm|verify|life.?reset/i.test(blob)) continue;
      if (/guerrillamail/i.test(String(mail.mail_from ?? ''))) continue;
      const full = await gm(
        { f: 'fetch_email', email_id: String(mail.mail_id ?? ''), sid_token: inbox.sid },
        inbox.sid,
      );
      const link = extractVerifyLink(String(full.mail_body ?? full.mail_html ?? ''));
      if (link) return link;
    }
    await new Promise((resolve) => setTimeout(resolve, 4000));
  }
  return null;
}
