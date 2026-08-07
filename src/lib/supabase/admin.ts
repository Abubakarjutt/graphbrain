import { createClient } from '@supabase/supabase-js'

// Service-role client — never expose to the browser.
// Used server-side only for operations that require bypassing RLS,
// such as reading auth.users emails for workspace member lists.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
