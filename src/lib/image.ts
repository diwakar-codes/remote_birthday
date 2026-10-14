/**
 * Shrinks a photo in the browser before upload (max 1280px side, WEBP or JPEG).
 * A 5 MB phone photo usually becomes ~150-300 KB, which keeps us well inside
 * the free Supabase storage quota and makes the birthday page load fast.
 */
export async function compressImage(file: File, maxSide = 1280, quality = 0.82): Promise<Blob> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('This image format is not supported here. Please use JPG, PNG or WEBP.')
  }

  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const toBlob = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))

  // Older Safari can't encode WEBP and silently returns PNG -> fall back to JPEG.
  let blob = await toBlob('image/webp')
  if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg')
  if (!blob) throw new Error('Could not process this image.')
  return blob
}
