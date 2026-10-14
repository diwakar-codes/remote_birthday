import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

interface Props {
  /** true once the rope was pulled -> curtains part sideways */
  open: boolean
  /** Fired inside the pointer-up / key handler (a real user gesture, so music may start). */
  onPull: () => void
  birthdayName: string
}

/** Each panel is squeezed towards its side, like velvet gathering at the edge of the stage. */
const OPEN_SCALE = 0.14
const TRIGGER_RATIO = 0.6

const maxPullFor = () => Math.round(Math.min(220, window.innerHeight * 0.25))

export default function Curtains({ open, onPull, birthdayName }: Props) {
  const pull = useMotionValue(0)
  const gather = useMotionValue(1)
  const ropeHeight = useTransform(pull, (v) => `calc(30dvh + ${v}px)`)
  const [maxPull, setMaxPull] = useState(maxPullFor)
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef<number | null>(null)

  useEffect(() => {
    const onResize = () => setMaxPull(maxPullFor())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!open) return
    const controls = animate(gather, OPEN_SCALE, { duration: 1.9, ease: [0.7, 0, 0.25, 1] })
    return () => controls.stop()
  }, [open, gather])

  const setPull = (v: number) => {
    pull.set(v)
    // The curtains part a little while the rope is pulled - feels connected.
    gather.set(1 - Math.min(v / maxPull, 1) * 0.06)
  }

  const release = (triggered: boolean) => {
    animate(pull, 0, { type: 'spring', stiffness: 260, damping: triggered ? 8 : 18 })
    if (triggered) onPull()
    else animate(gather, 1, { duration: 0.35 })
  }

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (open) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragStart.current = e.clientY - pull.get()
    setDragging(true)
  }

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (dragStart.current === null) return
    setPull(Math.max(0, Math.min(maxPull * 1.1, e.clientY - dragStart.current)))
  }

  const onPointerEnd = (e: PointerEvent<HTMLButtonElement>) => {
    if (dragStart.current === null) return
    dragStart.current = null
    setDragging(false)
    release(e.type === 'pointerup' && pull.get() >= maxPull * TRIGGER_RATIO)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (open || !['Enter', ' ', 'ArrowDown'].includes(e.key)) return
    e.preventDefault()
    animate(pull, maxPull, { duration: 0.25 }).then(() => animate(pull, 0, { type: 'spring', stiffness: 260, damping: 8 }))
    onPull()
  }

  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
        <motion.div className="velvet absolute inset-y-0 left-0 w-[51%]" style={{ scaleX: gather, originX: 0 }}>
          <div className="fringe absolute inset-x-0 bottom-0" />
        </motion.div>
        <motion.div className="velvet absolute inset-y-0 right-0 w-[51%]" style={{ scaleX: gather, originX: 1 }}>
          <div className="fringe absolute inset-x-0 bottom-0" />
        </motion.div>

        <motion.div
          className="absolute inset-x-0 top-[60%] flex justify-center px-6 sm:top-[40%] sm:pr-[14vw] lg:pr-6"
          animate={{ opacity: open ? 0 : 1, y: open ? -20 : 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="rounded-2xl border border-gold/50 bg-black/45 px-6 py-5 text-center shadow-2xl backdrop-blur-sm">
            <p className="font-display text-xs tracking-[0.35em] text-gold/80 sm:text-sm">✦ TONIGHT'S SPECIAL SHOW ✦</p>
            <p className="mt-2 font-script text-4xl text-cream sm:text-5xl">for {birthdayName}</p>
            <p className="mt-3 text-sm text-cream/75">
              Pull the golden rope <span className="text-gold">↓</span> to raise the curtain
            </p>
          </div>
        </motion.div>
      </div>

      <motion.div
        className="absolute right-[6vw] top-[max(11dvh,4rem)] z-40 flex flex-col items-center"
        animate={{ opacity: open ? 0 : 1 }}
        transition={{ delay: open ? 0.6 : 0, duration: 0.5 }}
        style={{ pointerEvents: open ? 'none' : 'auto' }}
      >
        <motion.div className="rope w-2.5" style={{ height: ropeHeight }} />
        <button
          type="button"
          aria-label="Pull the rope down to open the curtains"
          className={`-mt-1 flex touch-none select-none flex-col items-center px-4 pb-2 outline-none focus-visible:ring-2 focus-visible:ring-gold ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onKeyDown={onKeyDown}
        >
          <span className="block h-7 w-7 rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff1c1,#c9952f_55%,#6b4a14)] shadow-[0_4px_10px_rgb(0_0_0/0.6)]" />
          <span className="tassel-skirt -mt-1.5 block h-16 w-11 shadow-lg" />
        </button>
        {!dragging && !open && (
          <motion.span
            className="mt-1 text-xs font-semibold tracking-widest text-gold drop-shadow"
            animate={{ y: [0, 6, 0], opacity: [0.7, 1, 0.7] }}
            transition={{ repeat: Infinity, duration: 1.4 }}
          >
            PULL ↓
          </motion.span>
        )}
      </motion.div>
    </>
  )
}
