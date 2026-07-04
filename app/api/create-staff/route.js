import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';

// This endpoint is how the Owner Dashboard creates a new staff login without
// anyone ever touching the Supabase Table Editor by hand (which is where the
// earlier typos — "tester" instead of "owner", a stray trailing space — came
// from). It does three things, in order, and refuses to continue if any
// check fails:
//   1. Verify the request actually comes from a logged-in user
//   2. Verify that user's role is 'owner' (staff cannot create other staff)
//   3. Create the Supabase Auth user AND their profiles row together, atomically
export async function POST(req) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) {
    return NextResponse.json({ error: 'Missing authentication token' }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: { user }, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !user) {
    return NextResponse.json({ error: 'Invalid or expired session — please log in again' }, { status: 401 });
  }

  const { data: callerProfile, error: profileLookupErr } = await admin
    .from('profiles').select('role').eq('id', user.id).single();
  if (profileLookupErr || !callerProfile || callerProfile.role !== 'owner') {
    return NextResponse.json({ error: 'Only the owner can add staff accounts' }, { status: 403 });
  }

  const { email, password, full_name, shop_id } = await req.json();
  if (!email || !password || !full_name || !shop_id) {
    return NextResponse.json({ error: 'Email, password, full name, and shop are all required' }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
  }

  const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // skips the "click the link in your email" step, same as the manual dashboard checkbox
  });
  if (createErr) {
    return NextResponse.json({ error: createErr.message }, { status: 400 });
  }

  const { error: insertErr } = await admin
    .from('profiles')
    .insert({ id: newUser.user.id, full_name, role: 'staff', shop_id });

  if (insertErr) {
    // Roll back the auth user so we don't end up with a login that has no
    // matching profile — better to fail cleanly than leave a half-created account.
    await admin.auth.admin.deleteUser(newUser.user.id);
    return NextResponse.json({ error: 'Could not create profile: ' + insertErr.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, id: newUser.user.id });
}
