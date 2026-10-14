import type { SupabaseClient } from '@supabase/supabase-js'
import { BUCKET, filePaths, type CelebrationRow } from './supabase.js'

type FileRefs = Pick<CelebrationRow, 'id' | 'photo_paths' | 'surprise_path' | 'audio_path'>

/**
 * Deletes the files first, then the row.
 * If the row delete fails, the next run simply retries: removing files
 * that are already gone is not an error, so this is safe to repeat.
 */
export async function deleteCelebration(db: SupabaseClient, row: FileRefs) {
  const { error: storageError } = await db.storage.from(BUCKET).remove(filePaths(row))
  if (storageError) throw storageError

  const { error: dbError } = await db.from('celebrations').delete().eq('id', row.id)
  if (dbError) throw dbError
}

/** Removes every celebration whose 1-hour window has passed. */
export async function cleanupExpired(db: SupabaseClient, limit = 50) {
  const { data, error } = await db
    .from('celebrations')
    .select('id, photo_paths, surprise_path, audio_path')
    .lte('expires_at', new Date().toISOString())
    .limit(limit)
  if (error) throw error

  let deleted = 0
  for (const row of data as FileRefs[]) {
    try {
      await deleteCelebration(db, row)
      deleted++
    } catch (err) {
      console.error(`cleanup: failed to delete ${row.id}`, err)
    }
  }
  return { checked: data.length, deleted }
}
