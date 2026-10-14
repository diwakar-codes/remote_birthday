import { useEffect, useState } from 'react'

/** Milliseconds left until `expiresAt`, updated every second. null if no deadline. */
export function useCountdown(expiresAt: string | null) {
  const target = expiresAt ? Date.parse(expiresAt) : null
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (target === null) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [target])

  return target === null ? null : Math.max(0, target - now)
}

export function formatCountdown(ms: number) {
  const total = Math.ceil(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
