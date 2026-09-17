/**
 * Web Push helpers for Cloudflare Workers (Web Crypto / RFC 8291 + VAPID).
 */
import { buildPushPayload } from '@block65/webcrypto-web-push';

export function getVapidConfig(env = {}) {
  const get = (k) =>
    env?.[k] ||
    (typeof process !== 'undefined' ? process.env?.[k] : undefined);

  const publicKey = get('VAPID_PUBLIC_KEY') || get('VITE_VAPID_PUBLIC_KEY');
  const privateKey = get('VAPID_PRIVATE_KEY');
  const subject = get('VAPID_SUBJECT') || 'mailto:infobigbazar01@gmail.com';

  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

/**
 * Send one encrypted push. Returns { ok, status, gone }.
 */
export async function sendWebPush(subscription, payload, vapid) {
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return { ok: false, status: 0, gone: false };
  }

  try {
    const message = {
      data: typeof payload === 'string' ? payload : JSON.stringify(payload),
      options: { ttl: 60 * 60 * 12, urgency: 'normal' },
    };

    const init = await buildPushPayload(message, subscription, vapid);
    const res = await fetch(subscription.endpoint, init);
    const gone = res.status === 404 || res.status === 410;
    return { ok: res.ok || res.status === 201, status: res.status, gone };
  } catch (err) {
    console.error('sendWebPush error:', err?.message || err);
    return { ok: false, status: 0, gone: false };
  }
}

/**
 * Fan-out with limited concurrency. Deletes gone subscriptions via callback.
 */
export async function sendWebPushBatch(subscriptions, payload, vapid, { concurrency = 8, onGone } = {}) {
  let delivered = 0;
  let failed = 0;
  let gone = 0;
  const queue = [...subscriptions];

  async function worker() {
    while (queue.length) {
      const sub = queue.shift();
      if (!sub) break;
      const result = await sendWebPush(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
          expirationTime: null,
        },
        payload,
        vapid
      );
      if (result.gone) {
        gone += 1;
        if (onGone) await onGone(sub);
      } else if (result.ok) {
        delivered += 1;
      } else {
        failed += 1;
      }
    }
  }

  const n = Math.min(concurrency, Math.max(1, subscriptions.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return { delivered, failed, gone };
}
