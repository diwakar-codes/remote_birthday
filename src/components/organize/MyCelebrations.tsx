import { celebrationUrl } from '../../lib/api'
import type { SavedCelebration } from '../../lib/myCelebrations'
import { formatCountdown, useCountdown } from '../../lib/useCountdown'

interface Props {
  items: SavedCelebration[]
  onEnd: (c: SavedCelebration) => void
}

/** Live shows created from THIS browser (remembered in localStorage). */
export default function MyCelebrations({ items, onEnd }: Props) {
  if (items.length === 0) return null
  return (
    <section className="card mx-auto mt-8 max-w-3xl p-5 sm:p-6">
      <h2 className="font-display text-lg font-bold text-gold">Your live shows</h2>
      <p className="text-xs text-cream/60">Only visible in this browser. Ended or expired shows disappear automatically.</p>
      <ul className="mt-4 divide-y divide-gold/10">
        {items.map((c) => (
          <Row key={c.id} item={c} onEnd={onEnd} />
        ))}
      </ul>
    </section>
  )
}

function Row({ item, onEnd }: { item: SavedCelebration; onEnd: (c: SavedCelebration) => void }) {
  const left = useCountdown(item.expiresAt) ?? 0
  if (left <= 0) return null
  const url = celebrationUrl(item.id)
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div>
        <p className="font-medium text-cream">🎂 {item.birthdayName}</p>
        <p className="text-xs text-gold/80">⏳ {formatCountdown(left)} left</p>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <button type="button" className="btn-ghost px-3 py-1.5" onClick={() => navigator.clipboard?.writeText(url)}>
          Copy link
        </button>
        <a className="btn-ghost px-3 py-1.5" href={url} target="_blank" rel="noreferrer">
          Open
        </a>
        <button type="button" className="px-2 text-red-300 hover:underline" onClick={() => onEnd(item)}>
          End now
        </button>
      </div>
    </li>
  )
}
