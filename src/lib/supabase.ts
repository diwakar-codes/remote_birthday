import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

/**
 * Browser Supabase client with the PUBLIC anon key.
 * It is only used to upload files to signed upload URLs that our /api created.
 * RLS blocks it from reading or writing anything else.
 */
export function getSupabase(): SupabaseClient {
  if (client) return client
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!url || !key) {
    throw new Error('Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
  }
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return client
}
