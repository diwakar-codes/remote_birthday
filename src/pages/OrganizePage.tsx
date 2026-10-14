import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import Experience from '../components/experience/Experience'
import MyCelebrations from '../components/organize/MyCelebrations'
import PhotoSlots, { type PickedPhoto } from '../components/organize/PhotoSlots'
import ShareCard from '../components/organize/ShareCard'
import { ApiError, createCelebration, endCelebration } from '../lib/api'
import { compressImage } from '../lib/image'
import {
  forgetCelebration,
  loadMyCelebrations,
  rememberCelebration,
  type SavedCelebration,
} from '../lib/myCelebrations'

const MAX_AUDIO_MB = 8
const GOD_SUGGESTIONS = [
  'God', 'Lord Ganesha', 'Lord Krishna', 'Lord Shiva', 'Lord Rama', 'Hanuman Ji', 'Mata Rani',
  'Sai Baba', 'Waheguru', 'Allah', 'Jesus', 'Lord Buddha', 'Mahavir Swami',
]

/** /organize - the organizer fills in the details and gets a 1-hour share link. */
export default function OrganizePage() {
  const [birthdayName, setBirthdayName] = useState('')
  const [godName, setGodName] = useState('')
  const [customMessage, setCustomMessage] = useState('')
  const [photos, setPhotos] = useState<(PickedPhoto | null)[]>([null, null, null, null])
  const [audio, setAudio] = useState<{ file: File; url: string } | null>(null)
  const [surprise, setSurprise] = useState<PickedPhoto | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [created, setCreated] = useState<SavedCelebration | null>(null)
  const [mine, setMine] = useState<SavedCelebration[]>(loadMyCelebrations)
  const [previewRun, setPreviewRun] = useState<number | null>(null)

  // Free the in-memory photo/music previews when they are replaced or the page closes.
  const objectUrls = useRef<string[]>([])
  objectUrls.current = [...photos.map((p) => p?.url), surprise?.url, audio?.url].filter((u): u is string => !!u)
  useEffect(() => () => objectUrls.current.forEach((u) => URL.revokeObjectURL(u)), [])

  useEffect(() => {
    document.title = 'Birthday Theatre – Create a show'
  }, [])

  const setPhoto = (index: number, photo: PickedPhoto | null) => {
    setPhotos((prev) => {
      if (prev[index]) URL.revokeObjectURL(prev[index]!.url)
      const next = [...prev]
      next[index] = photo
      return next
    })
  }

  const onAudio = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('audio/')) return setError('Please choose an audio file (MP3, M4A, WAV, OGG).')
    if (file.size > MAX_AUDIO_MB * 1024 * 1024) return setError(`Music must be ${MAX_AUDIO_MB} MB or smaller.`)
    if (audio) URL.revokeObjectURL(audio.url)
    setError(null)
    setAudio({ file, url: URL.createObjectURL(file) })
  }

  const onSurprise = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return setError('Please choose an image file for the surprise.')
    try {
      // WEBP keeps transparent backgrounds, so a cut-out PNG still looks like it pops out of the cake.
      const blob = await compressImage(file, 900)
      if (surprise) URL.revokeObjectURL(surprise.url)
      setError(null)
      setSurprise({ blob, url: URL.createObjectURL(blob) })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load that image.')
    }
  }

  const removeSurprise = () => {
    if (surprise) URL.revokeObjectURL(surprise.url)
    setSurprise(null)
  }

  const removeAudio = () => {
    if (audio) URL.revokeObjectURL(audio.url)
    setAudio(null)
  }

  const missing = [
    !birthdayName.trim() && "birthday person's name",
    !godName.trim() && 'name of God',
    photos.some((p) => !p) && `${photos.filter((p) => !p).length} more photo(s)`,
  ].filter(Boolean) as string[]
  const ready = missing.length === 0

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!ready || progress) return
    setError(null)
    setProgress('Preparing…')
    try {
      const result = await createCelebration(
        { birthdayName: birthdayName.trim(), godName: godName.trim(), customMessage, photos: photos.map((p) => p!.blob), surprise: surprise?.blob ?? null, audio: audio?.file ?? null },
        setProgress,
      )
      const saved = { ...result, birthdayName: birthdayName.trim() }
      rememberCelebration(saved)
      setMine(loadMyCelebrations())
      setCreated(saved)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setProgress(null)
    }
  }

  const onEnd = async (c: SavedCelebration) => {
    if (!window.confirm(`End the show for ${c.birthdayName} now? The link stops working and the photos are deleted.`)) return
    try {
      await endCelebration(c.id, c.manageToken)
    } catch (err) {
      // 404 = already gone; anything else is a real failure.
      if (!(err instanceof ApiError && err.status === 404)) {
        return window.alert(err instanceof Error ? err.message : 'Could not end the show.')
      }
    }
    forgetCelebration(c.id)
    setMine(loadMyCelebrations())
    if (created?.id === c.id) setCreated(null)
  }

  const resetForm = () => {
    photos.forEach((p) => p && URL.revokeObjectURL(p.url))
    if (audio) URL.revokeObjectURL(audio.url)
    if (surprise) URL.revokeObjectURL(surprise.url)
    setSurprise(null)
    setBirthdayName('')
    setGodName('')
    setCustomMessage('')
    setPhotos([null, null, null, null])
    setAudio(null)
    setCreated(null)
  }

  return (
    <main className="theatre-bg min-h-dvh px-4 pb-16 pt-10 sm:pt-14">
      <header className="mx-auto max-w-3xl text-center">
        <p className="inline-block rounded-full border border-gold/30 bg-gold/5 px-3 py-1 text-[11px] tracking-wide text-gold/90">
          Free · No sign-up · Disappears after 1 hour
        </p>
        <h1 className="gold-text mt-4 font-display text-4xl font-black tracking-wide sm:text-6xl">Birthday Theatre</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-cream/75 sm:text-base">
          Create a theatre-style birthday surprise: curtains, a spotlight, their photos, a cake they cut themselves, and
          confetti. Then share the link.
        </p>
      </header>

      <section className="mx-auto mt-8 max-w-3xl">
        {created ? (
          <ShareCard celebration={created} onEnd={onEnd} onCreateAnother={resetForm} />
        ) : (
          <form className="card space-y-6 p-5 sm:p-8" onSubmit={onSubmit}>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Birthday person's name" required>
                <input
                  className="field"
                  value={birthdayName}
                  maxLength={60}
                  placeholder="e.g. Riya"
                  onChange={(e) => setBirthdayName(e.target.value)}
                />
              </Field>
              <Field label="Name of God (for the blessing)" required hint={`Shows as: “${godName.trim() || 'God'} Bless You”`}>
                <input
                  className="field"
                  value={godName}
                  maxLength={40}
                  list="god-suggestions"
                  placeholder="e.g. Lord Ganesha"
                  onChange={(e) => setGodName(e.target.value)}
                />
                <datalist id="god-suggestions">
                  {GOD_SUGGESTIONS.map((g) => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
              </Field>
            </div>

            <Field label="Personal message" hint={`Optional · ${customMessage.length}/300`}>
              <textarea
                className="field min-h-24 resize-y"
                value={customMessage}
                maxLength={300}
                placeholder="e.g. Wish I could be there to celebrate with you! Have the best year ahead ❤️"
                onChange={(e) => setCustomMessage(e.target.value)}
              />
            </Field>

            <Field label="4 photos for the stage" required hint="They appear around the messages and the cake, exactly like this:">
              <PhotoSlots photos={photos} onChange={setPhoto} onError={setError} />
            </Field>

            <Field label="Surprise inside the cake" hint="Optional · revealed when the cake is cut">
              <div className="flex items-center gap-4 rounded-xl border border-gold/25 bg-black/30 p-3">
                <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-[radial-gradient(circle,rgb(255_210_110/0.35),transparent_70%)]">
                  {surprise ? (
                    <img src={surprise.url} alt="Surprise preview" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <span className="text-3xl opacity-60">🎁</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-cream">{surprise ? '🎁 Your surprise image' : 'No surprise image: a cake slice rises instead'}</p>
                  <p className="text-[11px] text-cream/50">A PNG with a transparent background looks best.</p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs">
                    <label className="cursor-pointer text-gold underline-offset-4 hover:underline">
                      <input type="file" accept="image/*" className="sr-only" onChange={onSurprise} />
                      {surprise ? 'Change image' : 'Upload your own'}
                    </label>
                    {surprise && (
                      <button type="button" className="text-red-300 hover:underline" onClick={removeSurprise}>
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </Field>

            <Field label="Birthday music" hint={`Optional · replaces the default Happy Birthday song · max ${MAX_AUDIO_MB} MB`}>
              {audio ? (
                <div className="flex flex-col gap-2 rounded-xl border border-gold/25 bg-black/30 p-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-cream">🎵 {audio.file.name}</p>
                    <p className="text-xs text-cream/50">{(audio.file.size / 1024 / 1024).toFixed(1)} MB</p>
                  </div>
                  <audio controls src={audio.url} className="h-9 w-full sm:w-56" />
                  <button type="button" className="text-xs text-red-300 hover:underline" onClick={removeAudio}>
                    Remove
                  </button>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gold/35 bg-black/30 px-4 py-4 text-sm text-cream/70 transition hover:border-gold/70">
                  <input type="file" accept="audio/*" className="sr-only" onChange={onAudio} />
                  🎵 Upload your own song (MP3, M4A, WAV…)
                </label>
              )}
            </Field>

            <p className="-mt-3 text-[11px] text-cream/50">
              🎶 The song starts (and loops) the moment the candles are blown. Without an upload, a Happy Birthday song plays.
            </p>

            <p className="rounded-xl bg-gold/5 px-4 py-3 text-xs leading-relaxed text-cream/70">
              ⏳ The link works for <b className="text-gold">1 hour</b> from the moment you create it. Opening or refreshing it
              replays the whole show. After 1 hour, the photos, music and details are <b className="text-gold">deleted automatically</b>.
            </p>

            {error && <p className="rounded-xl border border-red-400/40 bg-red-900/30 px-4 py-3 text-sm text-red-200">{error}</p>}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-cream/50">{ready ? 'All set ✨' : `Still needed: ${missing.join(', ')}`}</p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <button type="button" className="btn-ghost" disabled={!ready} onClick={() => setPreviewRun(0)}>
                  👀 Preview
                </button>
                <button type="submit" className="btn-gold" disabled={!ready || !!progress}>
                  ✨ Create share link
                </button>
              </div>
            </div>
          </form>
        )}
      </section>

      <MyCelebrations items={mine} onEnd={onEnd} />

      <HowItWorks />

      {progress && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/70 px-6 backdrop-blur-sm">
          <div className="card px-8 py-7 text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-gold/30 border-t-gold" />
            <p className="mt-4 text-sm text-cream">{progress}</p>
          </div>
        </div>
      )}

      {previewRun !== null && ready && (
        <Preview
          run={previewRun}
          onReplay={() => setPreviewRun((r) => (r ?? 0) + 1)}
          onClose={() => setPreviewRun(null)}
          data={{
            birthdayName: birthdayName.trim(),
            godName: godName.trim(),
            customMessage: customMessage.trim() || null,
            photos: photos.map((p) => p!.url),
            surprise: surprise?.url ?? null,
            audio: audio?.url ?? null,
            expiresAt: null,
          }}
        />
      )}
    </main>
  )
}

function Preview({
  run,
  data,
  onReplay,
  onClose,
}: {
  run: number
  data: React.ComponentProps<typeof Experience>['data']
  onReplay: () => void
  onClose: () => void
}) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[100]">
      <Experience key={run} data={data} onReplay={onReplay} />
      <span className="fixed left-3 top-3 z-[110] rounded-full bg-gold px-3 py-1 text-[11px] font-bold tracking-wider text-night">
        PREVIEW
      </span>
      <button
        type="button"
        className="fixed right-3 top-3 z-[110] rounded-full border border-gold/50 bg-black/70 px-3 py-1.5 text-xs text-gold"
        onClick={onClose}
      >
        ✕ Close preview
      </button>
    </div>
  )
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-sm font-medium text-cream">
          {label} {required && <span className="text-gold">*</span>}
        </span>
        {hint && <span className="text-[11px] text-cream/50">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function HowItWorks() {
  const steps = [
    ['🎭', 'Curtains', 'They pull a golden rope and the red curtains part'],
    ['💡', 'Spotlight', 'The stage lights up with their photos and your messages'],
    ['🕯️', 'Candles', 'They make a wish and blow out the candles'],
    ['🔪', 'Cake cutting', 'They hold right-click (or a finger) and cut the cake'],
  ]
  return (
    <section className="mx-auto mt-10 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
      {steps.map(([icon, title, text]) => (
        <div key={title} className="rounded-2xl border border-gold/15 bg-black/20 p-4 text-center">
          <p className="text-2xl">{icon}</p>
          <p className="mt-1 font-display text-sm font-bold text-gold">{title}</p>
          <p className="mt-1 text-[11px] leading-snug text-cream/60">{text}</p>
        </div>
      ))}
    </section>
  )
}
