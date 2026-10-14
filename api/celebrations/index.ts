import type { VercelRequest, VercelResponse } from '@vercel/node'
import { cleanupExpired } from '../_lib/cleanup.js'
import {
  hashToken,
  methodNotAllowed,
  newCelebrationId,
  newManageToken,
  sendError,
  serverError,
} from '../_lib/http.js'
import { admin, BUCKET, filePaths, MAX_ACTIVE_CELEBRATIONS, TTL_MS } from '../_lib/supabase.js'

const MAX_AUDIO_BYTES = 8 * 1024 * 1024

const PHOTO_EXT: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
}

const AUDIO_EXT: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
}

interface CreateInput {
  birthdayName: string
  godName: string
  customMessage: string | null
  photoExts: string[]
  surpriseExt: string | null
  audioExt: string | null
}

function cleanText(value: unknown, max: number) {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

function parseBody(body: unknown): CreateInput | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>

  const birthdayName = cleanText(b.birthdayName, 60)
  if (!birthdayName) return { error: "Birthday person's name is required" }

  const godName = cleanText(b.godName, 40)
  if (!godName) return { error: 'Name of God is required' }

  const customMessage = typeof b.customMessage === 'string' ? b.customMessage.trim().slice(0, 300) : ''

  const photoTypes = b.photoTypes
  if (!Array.isArray(photoTypes) || photoTypes.length !== 4) return { error: 'Exactly 4 photos are required' }
  const photoExts = photoTypes.map((t) => PHOTO_EXT[String(t)])
  if (photoExts.some((ext) => !ext)) return { error: 'Photos must be WEBP, JPG or PNG' }

  let surpriseExt: string | null = null
  if (b.surprise != null) {
    surpriseExt = PHOTO_EXT[String((b.surprise as Record<string, unknown>).type ?? '')] ?? null
    if (!surpriseExt) return { error: 'Surprise image must be WEBP, JPG or PNG' }
  }

  let audioExt: string | null = null
  if (b.audio != null) {
    const audio = b.audio as Record<string, unknown>
    const type = String(audio.type ?? '')
    const size = Number(audio.size)
    if (!type.startsWith('audio/')) return { error: 'Music must be an audio file' }
    if (!Number.isFinite(size) || size <= 0 || size > MAX_AUDIO_BYTES) return { error: 'Music file must be 8 MB or smaller' }
    audioExt = AUDIO_EXT[type] ?? 'audio'
  }

  return { birthdayName, godName, customMessage: customMessage || null, photoExts, surpriseExt, audioExt }
}

/**
 * POST /api/celebrations
 * Step 1 of creating a celebration:
 *   - saves the text details as a "pending" row (expires in 1 hour)
 *   - returns one signed upload URL per file, so the browser uploads the
 *     photos/music straight to Supabase Storage (no 4.5 MB Vercel body limit)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  const input = parseBody(req.body)
  if ('error' in input) return sendError(res, 400, input.error)

  try {
    const db = admin()

    // Opportunistic cleanup: piggy-back on traffic so expired data never piles up.
    await cleanupExpired(db, 10).catch((err) => console.error('cleanup during create failed', err))

    const { count, error: countError } = await db
      .from('celebrations')
      .select('id', { count: 'exact', head: true })
      .gt('expires_at', new Date().toISOString())
    if (countError) throw countError
    if ((count ?? 0) >= MAX_ACTIVE_CELEBRATIONS) {
      return sendError(res, 503, 'Too many live celebrations right now. Please try again in a little while.')
    }

    const id = newCelebrationId()
    const manageToken = newManageToken()
    const now = Date.now()
    const expiresAt = new Date(now + TTL_MS).toISOString()
    const photoPaths = input.photoExts.map((ext, i) => `${id}/photo-${i + 1}.${ext}`)
    const surprisePath = input.surpriseExt ? `${id}/surprise.${input.surpriseExt}` : null
    const audioPath = input.audioExt ? `${id}/music.${input.audioExt}` : null

    const { error: insertError } = await db.from('celebrations').insert({
      id,
      birthday_name: input.birthdayName,
      god_name: input.godName,
      custom_message: input.customMessage,
      photo_paths: photoPaths,
      audio_path: audioPath,
      surprise_path: surprisePath,
      manage_token_hash: hashToken(manageToken),
      status: 'pending',
      created_at: new Date(now).toISOString(),
      expires_at: expiresAt,
    })
    if (insertError) throw insertError

    // Same order the browser uploads in: photos, surprise, music.
    const allPaths = filePaths({ photo_paths: photoPaths, surprise_path: surprisePath, audio_path: audioPath })
    const uploads = await Promise.all(
      allPaths.map(async (path) => {
        const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path)
        if (error) throw error
        return { path, token: data.token }
      }),
    )

    return res.status(201).json({ id, manageToken, expiresAt, uploads })
  } catch (err) {
    return serverError(res, err)
  }
}
