import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { VercelResponse } from '@vercel/node'

export function sendError(res: VercelResponse, status: number, error: string) {
  return res.status(status).json({ error })
}

export function methodNotAllowed(res: VercelResponse, allowed: string[]) {
  res.setHeader('Allow', allowed.join(', '))
  return sendError(res, 405, 'Method not allowed')
}

/** Logs the real error on the server, returns a safe message to the browser. */
export function serverError(res: VercelResponse, err: unknown) {
  console.error(err)
  const message = err instanceof Error && err.message.startsWith('Server is not configured')
    ? err.message
    : 'Something went wrong on the server'
  return sendError(res, 500, message)
}

// 32 characters -> each random byte maps evenly (256 % 32 === 0). No 0/O/1/l confusion.
const ID_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'

export function newCelebrationId(length = 10) {
  return Array.from(randomBytes(length), (b) => ID_ALPHABET[b % 32]).join('')
}

export function isValidId(id: unknown): id is string {
  return typeof id === 'string' && /^[a-z0-9]{6,20}$/.test(id)
}

/** Secret given only to the organizer's browser. We store just its hash. */
export function newManageToken() {
  return randomBytes(24).toString('base64url')
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function tokenMatches(token: unknown, storedHash: string) {
  if (typeof token !== 'string' || token.length === 0) return false
  const a = Buffer.from(hashToken(token), 'hex')
  const b = Buffer.from(storedHash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}
