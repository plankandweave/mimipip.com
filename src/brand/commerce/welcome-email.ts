/** Durable first-opt-in welcome; uses the store's existing Resend account. */
type Statement = {
  bind(...values: unknown[]): Statement;
  run(): Promise<unknown>;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{results: T[]}>;
};
export type WelcomeEnv = { DB?: {prepare(sql: string): Statement}; RESEND_API_KEY?: string };
type Welcome = {signup_id: number; email: string; leave_key: string; attempts: number; payload: string | null};

export function welcomeMessage(email: string, key: string) {
  const leave = `https://mimipip.com/unsubscribe?key=${key}`;
  return {
    from: 'MimiPip <hello@mimipip.com>', to: [email], reply_to: 'hello@mimipip.com',
    subject: 'Welcome to MimiPip',
    text: `Welcome to MimiPip\n\nThank you for joining us. Discover wallpapers, floor games and creative corners for playful rooms. We’ll share new designs and launches here.\n\nExplore the collection: https://mimipip.com/browse/collection\n\nNeed a hand choosing? Reply to this email.\n\nYou received this because you signed up at mimipip.com. Leave our email list: ${leave}`,
    html: `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#f8f6f1;color:#493b30;font-family:Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:32px 24px"><a href="https://mimipip.com" style="color:#714414;font-size:28px;font-weight:bold;text-decoration:none">MimiPip</a><h1 style="font-size:28px;line-height:1.25;margin-top:32px">A little more play, every day.</h1><p style="font-size:16px;line-height:1.7">Thank you for joining us. Discover wallpapers, floor games and creative corners for playful rooms. We’ll share new designs and launches here.</p><p style="margin:28px 0"><a href="https://mimipip.com/browse/collection" style="display:inline-block;padding:14px 20px;background:#714414;color:#fff;text-decoration:none;border-radius:8px">Explore MimiPip</a></p><p style="font-size:16px;line-height:1.7">Need a hand choosing? Reply to this email.</p><p style="font-size:12px;line-height:1.6;margin-top:40px">You received this because you signed up at mimipip.com.<br><a href="${leave}" style="color:#714414">Leave our email list</a></p></div></body></html>`,
  };
}

export async function sendWelcomeEmails(env: WelcomeEnv, email?: string, send: typeof fetch = fetch, now = Date.now()) {
  if (!env.DB || !env.RESEND_API_KEY) return;
  const db = env.DB;
  // Never retry an ambiguous provider result beyond its 24-hour idempotency window.
  await db.prepare(`UPDATE mimipip_welcome_email SET state='review',last_error='retry_window_expired'
    WHERE state='pending' AND first_attempt_at IS NOT NULL AND first_attempt_at<=?`).bind(now - 23 * 3600000).run();
  await db.prepare(`UPDATE mimipip_welcome_email SET state='cancelled' WHERE state='pending'
    AND signup_id IN (SELECT id FROM mimipip_signups WHERE unsubscribed_at IS NOT NULL)`).bind().run();
  const {results} = await db.prepare(`SELECT w.signup_id,s.email,s.leave_key,w.attempts,w.payload
    FROM mimipip_welcome_email w JOIN mimipip_signups s ON s.id=w.signup_id
    WHERE w.state='pending' AND w.next_attempt_at<=? AND s.unsubscribed_at IS NULL
    AND (? IS NULL OR s.email=?) ORDER BY w.signup_id LIMIT 10`).bind(now,email ?? null,email ?? null).all<Welcome>();
  for (const row of results) {
    const payload = row.payload ?? JSON.stringify(welcomeMessage(row.email,row.leave_key));
    // Atomic lease: concurrent requests/cron cannot send the same welcome together.
    const claimed = await db.prepare(`UPDATE mimipip_welcome_email SET attempts=attempts+1,
      next_attempt_at=?,first_attempt_at=COALESCE(first_attempt_at,?),payload=COALESCE(payload,?)
      WHERE signup_id=? AND state='pending' AND next_attempt_at<=?
      AND EXISTS(SELECT 1 FROM mimipip_signups WHERE id=? AND unsubscribed_at IS NULL)
      RETURNING signup_id`).bind(now + 300000,now,payload,row.signup_id,now,row.signup_id).first();
    if (!claimed) continue;
    try {
      const response = await send('https://api.resend.com/emails', {
        method:'POST', signal:AbortSignal.timeout(10000),
        headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`mimipip-welcome-v1/${row.signup_id}`},body:payload,
      });
      const result = await response.json() as {id?: string; name?: string};
      if (response.ok && result.id) {
        await db.prepare(`UPDATE mimipip_welcome_email SET state='accepted',provider_id=?,accepted_at=?,last_error=NULL WHERE signup_id=?`)
          .bind(result.id,now,row.signup_id).run();
      } else {
        const retry = response.status===429 || response.status>=500 || (response.status===409 && result.name==='concurrent_idempotent_requests');
        await db.prepare(`UPDATE mimipip_welcome_email SET state=?,last_error=?,next_attempt_at=? WHERE signup_id=?`)
          .bind(retry?'pending':'review',`provider_${response.status}`,now + Math.min(3600000,300000 * 2 ** Math.min(row.attempts,4)),row.signup_id).run();
        console.error('mimipip_welcome_provider',response.status);
      }
    } catch {
      // A timeout or DB error may follow provider acceptance. Reuse the stored payload and key.
      console.error('mimipip_welcome_retry');
    }
  }
}
