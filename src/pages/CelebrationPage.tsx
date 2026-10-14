import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import Experience from '../components/experience/Experience'
import { ApiError, fetchCelebration } from '../lib/api'
import type { CelebrationData } from '../lib/types'
import { formatCountdown, useCountdown } from '../lib/useCountdown'

type State =
  | { status: 'loading' }
  | { status: 'ready'; data: CelebrationData }
  | { status: 'error'; kind: 'expired' | 'notfound' | 'error'; message: string }

/** Wait for the photos to download, so the curtain reveals a complete stage. */
function preloadImages(urls: string[], timeoutMs = 10_000) {
  const all = Promise.all(
    urls.map(
      (src) =>
        new Promise<void>((resolve) => {
          const img = new Image()
          img.onload = img.onerror = () => resolve()
          img.src = src
        }),
    ),
  )
  return Promise.race([all, new Promise<void>((r) => setTimeout(r, timeoutMs))])
}

/**
 * /birthday/:id  - what the birthday person opens.
 * Nothing is saved about their progress, so a refresh replays the whole show
 * (as long as the 1-hour link is still valid).
 */
export default function CelebrationPage() {
  const { id = '' } = useParams()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [run, setRun] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchCelebration(id)
      .then(async (data) => {
        await preloadImages(data.surprise ? [...data.photos, data.surprise] : data.photos)
        if (!cancelled) setState({ status: 'ready', data })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const status = err instanceof ApiError ? err.status : 0
        setState({
          status: 'error',
          kind: status === 410 ? 'expired' : status === 404 ? 'notfound' : 'error',
          message: err instanceof Error ? err.message : 'Something went wrong',
        })
      })
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    if (state.status === 'ready') document.title = `Happy Birthday, ${state.data.birthdayName}! 🎂`
  }, [state])

  if (state.status === 'loading') {
    return (
      <CurtainMessage>
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-gold/30 border-t-gold" />
        <p className="mt-4 font-display tracking-widest text-gold">THE SHOW IS ABOUT TO BEGIN…</p>
      </CurtainMessage>
    )
  }

  if (state.status === 'error') {
    const copy = {
      expired: ['This show has ended 🎭', 'Birthday links are only valid for 1 hour, and this one has expired.'],
      notfound: ['No show found 🎭', 'This link is wrong, was ended early by the organizer, or has expired.'],
      error: ['The curtain is stuck 😅', state.message],
    }[state.kind]
    return (
      <CurtainMessage>
        <h1 className="font-display text-2xl font-bold text-gold sm:text-3xl">{copy[0]}</h1>
        <p className="mt-3 text-cream/80">{copy[1]}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {state.kind === 'error' && (
            <button type="button" className="btn-ghost" onClick={() => window.location.reload()}>
              Try again
            </button>
          )}
          <Link to="/organize" className="btn-gold">
            Create a birthday show
          </Link>
        </div>
      </CurtainMessage>
    )
  }

  return (
    <>
      <Experience key={run} data={state.data} onReplay={() => setRun((r) => r + 1)} />
      <ExpiryBadge expiresAt={state.data.expiresAt} />
    </>
  )
}

function ExpiryBadge({ expiresAt }: { expiresAt: string | null }) {
  const left = useCountdown(expiresAt)
  if (left === null) return null
  return (
    <div className="fixed left-3 top-3 z-50 rounded-full border border-gold/40 bg-black/55 px-3 py-1 text-[11px] font-medium text-gold backdrop-blur sm:text-xs">
      {left > 0 ? `⏳ Link expires in ${formatCountdown(left)}` : '⌛ This link has expired'}
    </div>
  )
}

function CurtainMessage({ children }: { children: React.ReactNode }) {
  return (
    <main className="velvet grid min-h-dvh place-items-center px-5">
      <div className="card max-w-md px-6 py-8 text-center">{children}</div>
    </main>
  )
}
