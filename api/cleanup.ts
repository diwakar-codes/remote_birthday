import type { VercelRequest, VercelResponse } from '@vercel/node'
import { cleanupExpired } from './_lib/cleanup.js'
import { methodNotAllowed, sendError, serverError } from './_lib/http.js'
import { admin } from './_lib/supabase.js'

/**
 * GET/POST /api/cleanup
 * Called by: Supabase pg_cron every 10 min, and Vercel Cron once a day (backup).
 * Both send "Authorization: Bearer <CRON_SECRET>".
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return methodNotAllowed(res, ['GET', 'POST'])

  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return sendError(res, 401, 'Unauthorized')
  }

  try {
    const result = await cleanupExpired(admin())
    return res.status(200).json(result)
  } catch (err) {
    return serverError(res, err)
  }
}
