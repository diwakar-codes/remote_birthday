import { useState } from 'react'
import { celebrationUrl } from '../../lib/api'
import type { SavedCelebration } from '../../lib/myCelebrations'
import { formatCountdown, useCountdown } from '../../lib/useCountdown'

interface Props {
  celebration: SavedCelebration
  onEnd: (c: SavedCelebration) => void
  onCreateAnother: () => void
}

export default function ShareCard({ celebration, onEnd, onCreateAnother }: Props) {
  const url = celebrationUrl(celebration.id)
  const left = useCountdown(celebration.expiresAt) ?? 0
  const [copied, setCopied] = useState(false)
  const shareText = `🎭🎂 A surprise birthday show for ${celebration.birthdayName}! Open it here (valid for 1 hour): ${url}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy this link:', url)
    }
  }

  const share = () => {
    navigator.share?.({ title: 'Birthday Theatre', text: shareText }).catch(() => {})
  }

  return (
    <div className="card p-6 text-center sm:p-8">
      <p className="text-4xl">🎉</p>
      <h2 className="mt-2 font-display text-2xl font-bold text-gold">The show is ready!</h2>
      <p className="mt-1 text-sm text-cream/75">
        Send this link to <span className="font-semibold text-cream">{celebration.birthdayName}</span>.
      </p>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <input readOnly value={url} className="field flex-1 text-center text-sm sm:text-left" onFocus={(e) => e.target.select()} />
        <button type="button" className="btn-gold whitespace-nowrap" onClick={copy}>
          {copied ? '✓ Copied' : 'Copy link'}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <a className="btn-ghost text-sm" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer">
          WhatsApp
        </a>
        {'share' in navigator && (
          <button type="button" className="btn-ghost text-sm" onClick={share}>
            Share…
          </button>
        )}
        <a className="btn-ghost text-sm" href={url} target="_blank" rel="noreferrer">
          Open show ↗
        </a>
      </div>

      <p className={`mt-5 text-sm ${left > 0 ? 'text-gold' : 'text-red-300'}`}>
        {left > 0 ? `⏳ Link expires in ${formatCountdown(left)}` : '⌛ This link has expired'}
      </p>

      <div className="mt-6 flex flex-wrap justify-center gap-3 border-t border-gold/15 pt-5">
        <button type="button" className="btn-ghost text-sm" onClick={onCreateAnother}>
          ＋ Create another show
        </button>
        {left > 0 && (
          <button type="button" className="text-sm text-red-300 underline-offset-4 hover:underline" onClick={() => onEnd(celebration)}>
            End this show now
          </button>
        )}
      </div>
    </div>
  )
}
