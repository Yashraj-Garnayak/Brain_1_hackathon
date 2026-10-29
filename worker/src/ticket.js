/* Verify the short-lived match ticket minted by the Vercel API.
 *
 * Format: base64url(JSON payload) + '.' + base64url(HMAC-SHA256(payload))
 * Payload: { v: 1, uid, name, exp }
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytes(value) {
  const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4));
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export async function verifyTicket(ticket, env) {
  const secret = env && env.MATCH_SECRET;
  if (!secret || typeof ticket !== 'string') return null;
  if (ticket.length < 16 || ticket.length > 1536) return null;

  const dot = ticket.indexOf('.');
  if (dot <= 0 || dot !== ticket.lastIndexOf('.')) return null;

  const body = ticket.slice(0, dot);
  const signature = ticket.slice(dot + 1);
  if (!body || !signature) return null;

  let ok = false;
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    ok = await crypto.subtle.verify('HMAC', key, bytes(signature), encoder.encode(body));
  } catch {
    return null;
  }
  if (!ok) return null;

  let payload;
  try {
    payload = JSON.parse(decoder.decode(bytes(body)));
  } catch {
    return null;
  }
  if (!payload || payload.v !== 1) return null;
  if (!payload.uid || !payload.name) return null;
  if (!Number.isFinite(payload.exp) || payload.exp < Date.now()) return null;

  return {
    uid: String(payload.uid).slice(0, 64),
    name: String(payload.name).trim().slice(0, 32),
    role: payload.role === 'spectator' ? 'spectator' : 'player',
    exp: payload.exp
  };
}
