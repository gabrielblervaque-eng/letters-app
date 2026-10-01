import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

let cachedProviderToken = '';
let cachedTokenCreatedAt = 0;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authHeader = req.headers.get('Authorization');
  if (!url || !anonKey || !serviceRoleKey || !authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Configuration or authorization missing.' }, 401);
  }

  const authClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: { user }, error: authError } = await authClient.auth.getUser(authHeader.slice(7));
  if (authError || !user) return json({ error: 'Session invalide.' }, 401);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Requête invalide.' }, 400);
  }
  const kind = payload.kind;
  const spaceId = payload.space_id;
  if (!['mood', 'letter'].includes(String(kind)) || typeof spaceId !== 'string') {
    return json({ error: 'Type de notification invalide.' }, 400);
  }

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { data: space, error: spaceError } = await admin.from('spaces')
      .select('id,user1_id,user2_id').eq('id', spaceId).maybeSingle();
    if (spaceError) throw spaceError;
    if (!space || (space.user1_id !== user.id && space.user2_id !== user.id)) {
      return json({ error: 'Espace introuvable.' }, 403);
    }
    const partnerId = space.user1_id === user.id ? space.user2_id : space.user1_id;

    const { data: blocks, error: blockError } = await admin.from('user_blocks')
      .select('blocker_id').or(`and(blocker_id.eq.${user.id},blocked_id.eq.${partnerId}),and(blocker_id.eq.${partnerId},blocked_id.eq.${user.id})`)
      .limit(1);
    if (blockError) throw blockError;
    if (blocks?.length) return json({ ok: true, sent: false, reason: 'blocked' }, 200);

    const { data: sender, error: senderError } = await admin.from('user_profiles')
      .select('name').eq('id', user.id).maybeSingle();
    if (senderError) throw senderError;
    const senderName = String(sender?.name || 'Ta moitié').slice(0, 60);

    let title = '';
    let body = '';
    if (kind === 'mood') {
      const emoji = typeof payload.emoji === 'string' ? payload.emoji.slice(0, 12) : '';
      const label = typeof payload.label === 'string' ? payload.label.slice(0, 50) : '';
      if (!emoji || !label) return json({ error: 'Humeur invalide.' }, 400);
      title = `${senderName} a choisi son humeur`;
      body = `${emoji} ${label}`;
    } else {
      const preview = typeof payload.preview === 'string' ? payload.preview.trim().slice(0, 100) : '';
      title = `Une lettre de ${senderName} ✉`;
      body = preview || 'Tu as reçu une nouvelle lettre.';
    }

    const { data: registration, error: registrationError } = await admin.from('push_subscriptions')
      .select('apns_token').eq('user_id', partnerId).maybeSingle();
    if (registrationError) throw registrationError;
    if (!registration?.apns_token) return json({ ok: true, sent: false, reason: 'notifications_disabled' }, 200);

    const keyId = Deno.env.get('APNS_KEY_ID');
    const teamId = Deno.env.get('APNS_TEAM_ID');
    const privateKey = Deno.env.get('APNS_PRIVATE_KEY');
    const topic = Deno.env.get('APNS_BUNDLE_ID') || 'com.gabrielblervaque.letters';
    const environment = Deno.env.get('APNS_ENVIRONMENT') || 'production';
    if (!keyId || !teamId || !privateKey || !['production', 'sandbox'].includes(environment)) {
      console.error('APNs secrets are not configured.');
      return json({ error: 'Notifications Apple pas encore configurées.' }, 503);
    }

    const token = await getProviderToken(teamId, keyId, privateKey);
    const host = environment === 'sandbox' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';
    const apnsResponse = await fetch(`${host}/3/device/${encodeURIComponent(registration.apns_token)}`, {
      method: 'POST',
      headers: {
        authorization: `bearer ${token}`,
        'apns-topic': topic,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ aps: { alert: { title, body }, sound: 'default' } }),
    });
    if (apnsResponse.status === 410 || apnsResponse.status === 400) {
      const details = await apnsResponse.text();
      if (details.includes('Unregistered') || details.includes('BadDeviceToken')) {
        await admin.from('push_subscriptions').delete().eq('user_id', partnerId);
      }
      console.error('APNs rejected a device token:', apnsResponse.status, details.slice(0, 300));
      return json({ error: 'Apple a refusé le jeton de notification.' }, 502);
    }
    if (!apnsResponse.ok) {
      console.error('APNs request failed:', apnsResponse.status, (await apnsResponse.text()).slice(0, 300));
      return json({ error: 'Envoi de la notification impossible.' }, 502);
    }
    return json({ ok: true, sent: true }, 200);
  } catch (error) {
    console.error('Partner notification failed:', error);
    return json({ error: 'La notification n’a pas pu être envoyée.' }, 500);
  }
});

async function getProviderToken(teamId: string, keyId: string, pem: string) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedProviderToken && now - cachedTokenCreatedAt < 45 * 60) return cachedProviderToken;
  const header = encodeBase64Url(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const claims = encodeBase64Url(JSON.stringify({ iss: teamId, iat: now }));
  const signingInput = `${header}.${claims}`;
  const cleanPem = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const keyBytes = Uint8Array.from(atob(cleanPem), (char) => char.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', keyBytes, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(signingInput));
  cachedProviderToken = `${signingInput}.${encodeBase64Url(new Uint8Array(signature))}`;
  cachedTokenCreatedAt = now;
  return cachedProviderToken;
}

function encodeBase64Url(value: string | Uint8Array) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
