import type { VercelRequest, VercelResponse } from '@vercel/node'
import { deleteCelebration } from '../_lib/cleanup.js'
import { isValidId, methodNotAllowed, sendError, serverError, tokenMatches } from '../_lib/http.js'
import { admin, BUCKET, filePaths, type CelebrationRow } from '../_lib/supabase.js'

/**
 * GET    /api/celebrations/:id  -> public: the birthday person's page loads this
 * PATCH  /api/celebrations/:id  -> organizer: "uploads finished, make it live"
 * DELETE /api/celebrations/:id  -> organizer: "end the show now"
 *
 * PATCH and DELETE need the organizer's manage token (header x-manage-token).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = req.query.id
  if (!isValidId(id)) return sendError(res, 404, 'Celebration not found')

  try {
    const db = admin()
    const { data: row, error } = await db.from('celebrations').select('*').eq('id', id).maybeSingle<CelebrationRow>()
    if (error) throw error
    if (!row) return sendError(res, 404, 'Celebration not found')

    const expired = Date.parse(row.expires_at) <= Date.now()

    switch (req.method) {
      case 'GET':
        return await getCelebration(res, row, expired)
      case 'PATCH':
        if (!tokenMatches(req.headers['x-manage-token'], row.manage_token_hash)) return sendError(res, 403, 'Not allowed')
        if (expired) return sendError(res, 410, 'This celebration has expired')
        return await finalizeCelebration(res, row)
      case 'DELETE':
        if (!tokenMatches(req.headers['x-manage-token'], row.manage_token_hash)) return sendError(res, 403, 'Not allowed')
        await deleteCelebration(db, row)
        return res.status(204).end()
      default:
        return methodNotAllowed(res, ['GET', 'PATCH', 'DELETE'])
    }
  } catch (err) {
    return serverError(res, err)
  }
}

async function getCelebration(res: VercelResponse, row: CelebrationRow, expired: boolean) {
  res.setHeader('Cache-Control', 'no-store')
  if (row.status !== 'ready') return sendError(res, 404, 'Celebration not found')
  if (expired) return sendError(res, 410, 'This celebration has expired')

  // Signed URLs stop working when the celebration expires (minimum 60 s).
  const secondsLeft = Math.max(60, Math.ceil((Date.parse(row.expires_at) - Date.now()) / 1000))
  const { data, error } = await admin().storage.from(BUCKET).createSignedUrls(filePaths(row), secondsLeft)
  if (error) throw error

  const signed = new Map<string, string>()
  for (const item of data) {
    if (item.error || !item.signedUrl || !item.path) throw new Error(`Could not sign ${item.path}: ${item.error}`)
    signed.set(item.path, item.signedUrl)
  }
  const urlFor = (path: string | null) => (path ? (signed.get(path) ?? null) : null)

  return res.status(200).json({
    id: row.id,
    birthdayName: row.birthday_name,
    godName: row.god_name,
    customMessage: row.custom_message,
    photos: row.photo_paths.map((p) => urlFor(p)),
    surprise: urlFor(row.surprise_path),
    audio: urlFor(row.audio_path),
    expiresAt: row.expires_at,
  })
}

async function finalizeCelebration(res: VercelResponse, row: CelebrationRow) {
  const { data: files, error } = await admin().storage.from(BUCKET).list(row.id, { limit: 20 })
  if (error) throw error

  const uploaded = new Set(files.map((f) => `${row.id}/${f.name}`))
  const expected = filePaths(row)
  const missing = expected.filter((p) => !uploaded.has(p))
  if (missing.length > 0) return sendError(res, 400, `Some files did not upload (${missing.length} missing). Please try again.`)

  const { error: updateError } = await admin().from('celebrations').update({ status: 'ready' }).eq('id', row.id)
  if (updateError) throw updateError

  return res.status(200).json({ id: row.id, expiresAt: row.expires_at })
}
