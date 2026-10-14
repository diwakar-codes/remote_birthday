import { getSupabase } from './supabase'
import type { CelebrationData } from './types'

const BUCKET = 'celebrations'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    throw new ApiError(0, 'Network error. Check your internet connection and try again.')
  }
  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`)
  return body as T
}

export function fetchCelebration(id: string) {
  return request<CelebrationData & { id: string; expiresAt: string }>(`/api/celebrations/${encodeURIComponent(id)}`)
}

export interface CreateInput {
  birthdayName: string
  godName: string
  customMessage: string
  photos: Blob[]
  /** Optional image revealed inside the cake after the cut. */
  surprise: Blob | null
  audio: File | null
}

export interface CreatedCelebration {
  id: string
  manageToken: string
  expiresAt: string
}

/**
 * 3-step creation:
 *  1. POST details -> server saves a pending row, returns signed upload URLs
 *  2. Browser uploads each file directly to Supabase Storage
 *  3. PATCH -> server checks files exist and marks the celebration live
 */
export async function createCelebration(
  input: CreateInput,
  onProgress: (message: string) => void,
): Promise<CreatedCelebration> {
  onProgress('Setting up the stage…')
  const created = await request<CreatedCelebration & { uploads: { path: string; token: string }[] }>(
    '/api/celebrations',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        birthdayName: input.birthdayName,
        godName: input.godName,
        customMessage: input.customMessage,
        photoTypes: input.photos.map((p) => p.type),
        surprise: input.surprise ? { type: input.surprise.type } : null,
        audio: input.audio ? { type: input.audio.type, size: input.audio.size } : null,
      }),
    },
  )

  // Must match the server's upload order: photos, surprise, music.
  const files: { blob: Blob; label: string }[] = [
    ...input.photos.map((blob, i) => ({ blob, label: `photo ${i + 1} of 4` })),
    ...(input.surprise ? [{ blob: input.surprise, label: 'surprise image' }] : []),
    ...(input.audio ? [{ blob: input.audio as Blob, label: 'music' }] : []),
  ]

  const storage = getSupabase().storage.from(BUCKET)
  for (let i = 0; i < files.length; i++) {
    const { blob, label } = files[i]
    const { path, token } = created.uploads[i]
    onProgress(`Uploading ${label}…`)
    const { error } = await storage.uploadToSignedUrl(path, token, blob, { contentType: blob.type })
    if (error) throw new ApiError(0, `Upload failed for ${label}: ${error.message}`)
  }

  onProgress('Raising the curtain…')
  await request(`/api/celebrations/${created.id}`, {
    method: 'PATCH',
    headers: { 'x-manage-token': created.manageToken },
  })

  return { id: created.id, manageToken: created.manageToken, expiresAt: created.expiresAt }
}

export function endCelebration(id: string, manageToken: string) {
  return request<void>(`/api/celebrations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'x-manage-token': manageToken },
  })
}

export function celebrationUrl(id: string) {
  return `${window.location.origin}/birthday/${id}`
}
