import { createClient } from '@supabase/supabase-js';

// IMPORTANT: this client uses the SERVICE ROLE key, which bypasses Row-Level
// Security entirely. It must only ever be imported into server-side code
// (API routes), never into a 'use client' component — if it were, the key
// would be bundled into the browser JS and anyone could steal full admin
// access to your database. Next.js keeps files under app/api/ server-only
// by nature, which is why the staff-creation logic lives there.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
