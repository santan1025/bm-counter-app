import { createBrowserClient } from '@supabase/ssr';

// One shared Supabase client for the whole app. Uses the "anon" public key,
// which is safe to expose in the browser — actual data access is enforced by
// the Row-Level Security policies on the database side (see supabase/schema.sql),
// not by keeping this key secret.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
