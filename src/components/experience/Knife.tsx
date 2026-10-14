import { motion, useMotionValue } from 'motion/react'
import { useEffect, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'

const WIDTH = 38
const HEIGHT = 160

/**
 * A cake knife that follows the pointer. Its TIP (bottom centre) sits exactly
 * on the pointer, so what you see is where you cut.
 */
export default function Knife({ startAt }: { startAt: RefObject<HTMLElement | null> }) {
  const x = useMotionValue(-300)
  const y = useMotionValue(-300)
  const [pressed, setPressed] = useState(false)

  useEffect(() => {
    // Start hovering just above the cake so the user sees the knife immediately.
    const rect = startAt.current?.getBoundingClientRect()
    if (rect) {
      x.set(rect.left + rect.width * 0.62)
      y.set(rect.top + rect.height * 0.25)
    }

    const move = (e: PointerEvent) => {
      x.set(e.clientX)
      y.set(e.clientY)
      setPressed(e.buttons !== 0)
    }
    const up = () => setPressed(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerdown', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerdown', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [startAt, x, y])

  return createPortal(
    <motion.div className="pointer-events-none fixed left-0 top-0 z-[9999]" style={{ x, y }} aria-hidden>
      <motion.div
        style={{ width: WIDTH, height: HEIGHT, marginLeft: -WIDTH / 2, marginTop: -HEIGHT, originX: 0.5, originY: 1 }}
        animate={{ rotate: pressed ? 4 : -22, scale: pressed ? 0.96 : 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      >
        <KnifeSvg />
      </motion.div>
    </motion.div>,
    document.body,
  )
}

function KnifeSvg() {
  return (
    <svg viewBox="0 0 40 170" width={WIDTH} height={HEIGHT} className="drop-shadow-[3px_6px_6px_rgb(0_0_0/0.55)]">
      <defs>
        <linearGradient id="knife-wood" x1="0" x2="1">
          <stop offset="0" stopColor="#4a250e" />
          <stop offset="0.45" stopColor="#a0612f" />
          <stop offset="1" stopColor="#4a250e" />
        </linearGradient>
        <linearGradient id="knife-steel" x1="0" x2="1">
          <stop offset="0" stopColor="#8e96a3" />
          <stop offset="0.4" stopColor="#f5f7fa" />
          <stop offset="0.6" stopColor="#d5dae2" />
          <stop offset="1" stopColor="#7d8592" />
        </linearGradient>
        <linearGradient id="knife-gold" x1="0" x2="1">
          <stop offset="0" stopColor="#8a6420" />
          <stop offset="0.5" stopColor="#ffe7a3" />
          <stop offset="1" stopColor="#8a6420" />
        </linearGradient>
      </defs>
      {/* handle */}
      <rect x="10" y="2" width="20" height="58" rx="8" fill="url(#knife-wood)" />
      <circle cx="20" cy="18" r="2.4" fill="url(#knife-gold)" />
      <circle cx="20" cy="40" r="2.4" fill="url(#knife-gold)" />
      {/* bolster */}
      <rect x="8" y="56" width="24" height="9" rx="3" fill="url(#knife-gold)" />
      {/* blade - tip at (20,170) */}
      <path d="M12 65 H28 V148 Q28 163 20 170 Q12 163 12 148 Z" fill="url(#knife-steel)" />
      <path d="M12 72 l-2 4 l2 4 l-2 4 l2 4 l-2 4 l2 4 l-2 4 l2 4 l-2 4 l2 4 l-2 4 l2 4" fill="none" stroke="#9aa2ae" strokeWidth="1" />
      <path d="M22 70 V145" stroke="rgb(255 255 255 / 0.8)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
