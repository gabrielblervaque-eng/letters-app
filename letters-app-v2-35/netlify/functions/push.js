// Web Push manuel sans dépendance externe
async function signVapid(audience, subject, publicKey, privateKey) {
  const header = { typ: 'JWT', alg: 'ES256' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud: audience, exp: now + 43200, sub: subject };

  const encode = obj => btoa(JSON.stringify(obj)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const sigInput = encode(header) + '.' + encode(payload);

  const keyData = base64ToBytes(privateKey);
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(sigInput)
  );
  const sigB64 = bytesToBase64Url(new Uint8Array(sig));
  return sigInput + '.' + sigB64;
}

function base64ToBytes(b64) {
  const s = atob(b64.replace(/-/g,'+').replace(/_/g,'/'));
  return Uint8Array.from(s, c => c.charCodeAt(0));
}

function bytesToBase64Url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}

export default async (req, context) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { subscription, title, body } = await req.json();
    if (!subscription?.endpoint) {
      return new Response(JSON.stringify({ error: 'Invalid subscription' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const vapidPublic = Netlify.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivate = Netlify.env.get('VAPID_PRIVATE_KEY');
    const vapidEmail = Netlify.env.get('VAPID_EMAIL');

    const endpoint = subscription.endpoint;
    const audience = new URL(endpoint).origin;
    const jwt = await signVapid(audience, `mailto:${vapidEmail}`, vapidPublic, vapidPrivate);

    const payload = JSON.stringify({ title, body, icon: '/icon-192.png' });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `vapid t=${jwt},k=${vapidPublic}`,
        'TTL': '86400',
      },
      body: payload,
    });

    return new Response(JSON.stringify({ ok: true, status: response.status }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
};

export const config = { path: '/api/push' };
