import confetti from 'canvas-confetti'

const COLORS = ['#f3c969', '#ff4d6d', '#ffffff', '#ff8fab', '#ffd166', '#9bf6ff']

/** Big confetti burst + side cannons + fireworks. Returns a stop function. */
export function celebrate(durationMs = 7000): () => void {
  const base = { colors: COLORS, zIndex: 9000, disableForReducedMotion: true }
  const end = Date.now() + durationMs

  confetti({ ...base, particleCount: 180, spread: 110, startVelocity: 45, origin: { x: 0.5, y: 0.65 } })

  const cannons = setInterval(() => {
    if (Date.now() > end) return clearInterval(cannons)
    confetti({ ...base, particleCount: 5, angle: 60, spread: 55, origin: { x: 0, y: 0.8 } })
    confetti({ ...base, particleCount: 5, angle: 120, spread: 55, origin: { x: 1, y: 0.8 } })
  }, 140)

  const fireworks = setInterval(() => {
    if (Date.now() > end) return clearInterval(fireworks)
    confetti({
      ...base,
      particleCount: 70,
      spread: 360,
      startVelocity: 26,
      ticks: 80,
      gravity: 0.6,
      origin: { x: 0.15 + Math.random() * 0.7, y: 0.1 + Math.random() * 0.3 },
    })
  }, 700)

  return () => {
    clearInterval(cannons)
    clearInterval(fireworks)
    confetti.reset()
  }
}
