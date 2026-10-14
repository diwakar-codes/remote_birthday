import { useRef, useState, type ChangeEvent } from 'react'
import { compressImage } from '../../lib/image'

export interface PickedPhoto {
  blob: Blob
  url: string
}

interface Props {
  photos: (PickedPhoto | null)[]
  onChange: (index: number, photo: PickedPhoto | null) => void
  onError: (message: string) => void
}

const LABELS = ['Top left', 'Top right', 'Bottom left', 'Bottom right']

/** 4 photo slots laid out exactly like the stage: 1 ✦ 2 / 3 🎂 4 */
export default function PhotoSlots({ photos, onChange, onError }: Props) {
  const [busy, setBusy] = useState<number[]>([])
  const multiInput = useRef<HTMLInputElement>(null)

  const load = async (index: number, file: File) => {
    if (!file.type.startsWith('image/')) return onError('Please choose an image file.')
    setBusy((b) => [...b, index])
    try {
      const blob = await compressImage(file)
      onChange(index, { blob, url: URL.createObjectURL(blob) })
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not load that image.')
    } finally {
      setBusy((b) => b.filter((i) => i !== index))
    }
  }

  const onPickOne = (index: number) => (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) void load(index, file)
  }

  // Fill empty slots first, in order; if all are full, replace from slot 1.
  const onPickMany = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, 4)
    e.target.value = ''
    const empty = photos.map((p, i) => (p ? -1 : i)).filter((i) => i >= 0)
    const order = [...empty, ...[0, 1, 2, 3].filter((i) => !empty.includes(i))]
    files.forEach((file, n) => void load(order[n], file))
  }

  const slot = (index: number) => {
    const photo = photos[index]
    const loading = busy.includes(index)
    return (
      <label
        key={index}
        className="group relative flex aspect-[4/5] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-gold/35 bg-black/30 text-center transition hover:border-gold/70"
      >
        <input type="file" accept="image/*" className="sr-only" onChange={onPickOne(index)} />
        {photo ? (
          <>
            <img src={photo.url} alt={`Photo ${index + 1}`} className="absolute inset-0 h-full w-full object-cover" />
            <span className="absolute inset-x-0 bottom-0 bg-black/60 py-1 text-[11px] text-cream opacity-0 transition group-hover:opacity-100">
              Change
            </span>
            <button
              type="button"
              aria-label={`Remove photo ${index + 1}`}
              className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/70 text-xs text-cream hover:bg-velvet"
              onClick={(e) => {
                e.preventDefault()
                onChange(index, null)
              }}
            >
              ✕
            </button>
          </>
        ) : (
          <>
            <span className="text-2xl text-gold/80">{loading ? '⏳' : '＋'}</span>
            <span className="mt-1 px-1 text-[11px] leading-tight text-cream/70">{LABELS[index]}</span>
          </>
        )}
        <span className="absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-gold text-[11px] font-bold text-night">
          {index + 1}
        </span>
      </label>
    )
  }

  return (
    <div>
      <div className="grid grid-cols-[1fr_1.2fr_1fr] items-center gap-2 sm:gap-3">
        {slot(0)}
        <div className="grid h-full place-items-center rounded-xl bg-gold/5 p-2 text-center text-[11px] leading-tight text-cream/55">
          ✦ Birthday messages ✦
        </div>
        {slot(1)}
        {slot(2)}
        <div className="grid h-full place-items-center rounded-xl bg-gold/5 p-2 text-center text-3xl">🎂</div>
        {slot(3)}
      </div>
      <button type="button" className="mt-3 text-xs text-gold underline-offset-4 hover:underline" onClick={() => multiInput.current?.click()}>
        Or select up to 4 photos at once
      </button>
      <input ref={multiInput} type="file" accept="image/*" multiple className="sr-only" onChange={onPickMany} />
    </div>
  )
}
