import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authHeader = req.headers.get('Authorization');
  if (!url || !anonKey || !serviceRoleKey || !authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Missing configuration or authorization.' }, 401);
  }

  const token = authHeader.slice('Bearer '.length);
  const authClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: { user }, error: authError } = await authClient.auth.getUser(token);
  if (authError || !user) return json({ error: 'Session invalide. Reconnecte-toi et réessaie.' }, 401);

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const uid = user.id;

  try {
    const { data: spaces, error: spacesError } = await admin.from('spaces')
      .select('id').or(`user1_id.eq.${uid},user2_id.eq.${uid}`);
    if (spacesError) throw spacesError;
    const spaceIds = (spaces || []).map((row) => row.id);

    // Remove the user's messages and every shared-space record before deleting
    // the space and auth identity. Any database error aborts the operation.
    const { error: lettersError } = await admin.from('letters')
      .delete().or(`from_id.eq.${uid},to_id.eq.${uid}`);
    if (lettersError) throw lettersError;

    if (spaceIds.length) {
      for (const table of ['abc_dates', 'questions_custom', 'questions', 'playlist', 'todos', 'boite_questions']) {
        const { error } = await admin.from(table).delete().in('space_id', spaceIds);
        if (error) throw new Error(`Nettoyage ${table}: ${error.message}`);
      }
    }

    for (const [table, column] of [['moods', 'user_id'], ['push_subscriptions', 'user_id']]) {
      const { error } = await admin.from(table).delete().eq(column, uid);
      if (error) throw new Error(`Nettoyage ${table}: ${error.message}`);
    }

    const { error: reportsError } = await admin.from('content_reports')
      .delete().or(`reporter_id.eq.${uid},reported_user_id.eq.${uid}`);
    if (reportsError) throw new Error(`Nettoyage des signalements: ${reportsError.message}`);
    const { error: blocksError } = await admin.from('user_blocks')
      .delete().or(`blocker_id.eq.${uid},blocked_id.eq.${uid}`);
    if (blocksError) throw new Error(`Nettoyage des blocages: ${blocksError.message}`);

    // Photos are stored under a per-user folder in the private "photos" bucket.
    for (let offset = 0; ; offset += 1000) {
      const { data: files, error } = await admin.storage.from('photos').list(uid, { limit: 1000, offset });
      if (error) throw new Error(`Nettoyage des photos: ${error.message}`);
      if (!files?.length) break;
      const paths = files.filter((f) => f.name && f.id).map((f) => `${uid}/${f.name}`);
      if (paths.length) {
        const { error: removeError } = await admin.storage.from('photos').remove(paths);
        if (removeError) throw new Error(`Suppression des photos: ${removeError.message}`);
      }
      if (files.length < 1000) break;
    }

    if (spaceIds.length) {
      const { error } = await admin.from('spaces').delete().in('id', spaceIds);
      if (error) throw error;
    }
    const { error: profileError } = await admin.from('user_profiles').delete().eq('id', uid);
    if (profileError) throw profileError;

    const { error: deleteAuthError } = await admin.auth.admin.deleteUser(uid);
    if (deleteAuthError) throw deleteAuthError;

    return json({ ok: true }, 200);
  } catch (error) {
    console.error('Account deletion failed:', error);
    return json({ error: 'La suppression n’a pas pu être terminée. Réessaie ou contacte hello@letters-app.xyz.' }, 500);
  }
});

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
