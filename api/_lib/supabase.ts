import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const BUCKET = 'celebrations'
/** A celebration link lives for exactly 1 hour after creation. */
export const TTL_MS = 60 * 60 * 1000
/** Free-tier guard: refuse new celebrations when this many are already live. */
export const MAX_ACTIVE_CELEBRATIONS = 100

export interface CelebrationRow {
  id: string
  birthday_name: string
  god_name: string
  custom_message: string | null
  photo_paths: string[]
  audio_path: string | null
  surprise_path: string | null
  manage_token_hash: string
  status: 'pending' | 'ready'
  created_at: string
  expires_at: string
}

/** Every stored file of a celebration, in upload order: 4 photos, surprise image, music. */
export function filePaths(row: Pick<CelebrationRow, 'photo_paths' | 'surprise_path' | 'audio_path'>) {
  return [...row.photo_paths, row.surprise_path, row.audio_path].filter((p): p is string => !!p)
}

let client: SupabaseClient | null = null

/**
 * Server-side Supabase client using the service_role key.
 * It bypasses Row Level Security, so it must only ever run inside /api.
 */
export function admin(): SupabaseClient {
  if (client) return client
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Server is not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  }
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return client
}
