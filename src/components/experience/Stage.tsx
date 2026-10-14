import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import type { CelebrationData } from '../../lib/types'
import Cake from './Cake'
import { celebrate } from './confetti'
import Knife from './Knife'

/**
 * messages -> candles -> blowing -> ready -> knife -> cut -> finale
 *   messages : the 2-3 messages appear one after another
 *   candles  : "blow the candles" button (the birthday song starts here)
 *   ready    : "Cut the cake" button
 *   knife    : knife follows the pointer, hold right-click + drag to cut (touch: drag)
 *   cut      : the cake opens and a slice rises (confetti waits for it)
 *   finale   : confetti, fireworks, replay button
 */
type Step = 'messages' | 'candles' | 'blowing' | 'ready' | 'knife' | 'cut' | 'finale'

const MESSAGE_TIMES = [900, 2600, 4300]
const PHOTO_TILT = [-4, 3, 3, -4]

const CONFETTI_DELAY = 1300
const FINALE_DELAY = 3000

interface Props {
  data: CelebrationData
  /** Called inside the click that blows the candles, so the browser allows audio. */
  onCandlesBlown: () => void
  onReplay: () => void
}

export default function Stage({ data, onCandlesBlown, onReplay }: Props) {
  const [step, setStep] = useState<Step>('messages')
  const [shown, setShown] = useState(0)
  const [hint, setHint] = useState<{ text: string; at: number } | null>(null)
  const cakeRef = useRef<HTMLDivElement>(null)
  const stopConfetti = useRef<(() => void) | null>(null)
  const isTouch = useRef(window.matchMedia('(pointer: coarse)').matches).current

  const messageCount = data.customMessage ? 3 : 2

  useEffect(() => {
    const timers = MESSAGE_TIMES.slice(0, messageCount).map((t, i) => setTimeout(() => setShown(i + 1), t))
    timers.push(setTimeout(() => setStep('candles'), MESSAGE_TIMES[messageCount - 1] + 1600))
    return () => timers.forEach(clearTimeout)
  }, [messageCount])

  useEffect(() => {
    if (step === 'blowing') {
      const t = setTimeout(() => setStep('ready'), 1700)
      return () => clearTimeout(t)
    }
    if (step === 'cut') {
      // Let the cutting animation play first, then the confetti, then the finale.
      const confetti = setTimeout(() => (stopConfetti.current = celebrate()), CONFETTI_DELAY)
      const finale = setTimeout(() => setStep('finale'), FINALE_DELAY)
      return () => {
        clearTimeout(confetti)
        clearTimeout(finale)
      }
    }
  }, [step])

  // The knife stays in hand while the cake opens, and leaves at the finale.
  const holdingKnife = step === 'knife' || step === 'cut'

  useEffect(() => {
    if (!holdingKnife) return
    document.documentElement.classList.add('knife-mode')
    return () => document.documentElement.classList.remove('knife-mode')
  }, [holdingKnife])

  useEffect(() => {
    if (!hint) return
    const t = setTimeout(() => setHint(null), 2800)
    return () => clearTimeout(t)
  }, [hint])

  useEffect(() => () => stopConfetti.current?.(), [])

  const blowCandles = () => {
    onCandlesBlown()
    setStep('blowing')
  }

  return (
    <div className="absolute inset-x-0 bottom-0 top-[max(11dvh,4rem)] z-[2] flex flex-col items-center justify-center gap-[3dvh] overflow-y-auto overflow-x-hidden px-[9vw] pb-[4dvh] pt-[calc(2dvh+28px)]">
      <div className="grid w-full max-w-5xl grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)] items-center gap-x-[3vw] gap-y-[3dvh]">
        <Photo src={data.photos[0]} index={0} />
        <Messages data={data} shown={shown} />
        <Photo src={data.photos[1]} index={1} />

        <Photo src={data.photos[2]} index={2} />
        <div ref={cakeRef}>
          <Cake
            surpriseSrc={data.surprise}
            lit={step === 'messages' || step === 'candles'}
            onBlow={step === 'candles' ? blowCandles : undefined}
            knifeActive={step === 'knife'}
            onCut={() => setStep('cut')}
            onHint={(text) => setHint({ text, at: Date.now() })}
          />
        </div>
        <Photo src={data.photos[3]} index={3} />
      </div>

      <div className="flex min-h-16 flex-col items-center justify-center text-center">
        <AnimatePresence mode="wait">
          {step === 'candles' && (
            <Action key="candles">
              <button type="button" className="btn-gold text-sm sm:text-base" onClick={blowCandles}>
                🌬️ Make a wish &amp; blow the candles
              </button>
            </Action>
          )}
          {step === 'blowing' && (
            <Action key="blowing">
              <p className="font-script text-3xl text-gold sm:text-4xl">Your wish is on its way ✨</p>
            </Action>
          )}
          {step === 'ready' && (
            <Action key="ready">
              <button type="button" className="btn-gold text-base sm:text-lg" onClick={() => setStep('knife')}>
                🔪 Cut the Cake
              </button>
            </Action>
          )}
          {step === 'knife' && (
            <Action key="knife">
              <motion.p
                key={hint?.at ?? 'instruction'}
                className={`max-w-md rounded-full bg-black/50 px-4 py-2 text-xs font-medium sm:text-sm ${hint ? 'text-gold' : 'text-cream'}`}
                animate={hint ? { scale: [1, 1.06, 1] } : { opacity: [0.75, 1, 0.75] }}
                transition={hint ? { duration: 0.35 } : { repeat: Infinity, duration: 1.6 }}
              >
                {hint?.text ??
                  (isTouch
                    ? '🔪 Press and drag your finger DOWN through the cake'
                    : '🔪 Hold the RIGHT mouse button and drag the knife DOWN through the cake')}
              </motion.p>
            </Action>
          )}
          {step === 'finale' && (
            <Action key="finale">
              <p className="gold-text font-script text-4xl sm:text-5xl">Happy Birthday, {data.birthdayName}! 🎉</p>
              <button type="button" className="btn-ghost mt-3 text-sm" onClick={onReplay}>
                ↻ Watch the show again
              </button>
            </Action>
          )}
        </AnimatePresence>
      </div>

      {holdingKnife && <Knife startAt={cakeRef} />}
    </div>
  )
}

function Action({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      className="flex flex-col items-center"
      initial={{ opacity: 0, y: 14, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.4 }}
    >
      {children}
    </motion.div>
  )
}

function Photo({ src, index }: { src: string; index: number }) {
  return (
    <motion.div
      className="photo-frame mx-auto aspect-[4/5] w-full max-w-[22dvh]"
      initial={{ opacity: 0, scale: 0.5, rotate: PHOTO_TILT[index] * 4 }}
      animate={{ opacity: 1, scale: 1, rotate: PHOTO_TILT[index] }}
      transition={{ delay: 0.2 + index * 0.18, type: 'spring', stiffness: 110, damping: 13 }}
    >
      <img src={src} alt="" draggable={false} className="h-full w-full rounded-md object-cover" />
    </motion.div>
  )
}

function Messages({ data, shown }: { data: CelebrationData; shown: number }) {
  const reveal = {
    initial: { opacity: 0, y: 18, scale: 0.92, filter: 'blur(6px)' },
    animate: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' },
    transition: { duration: 0.9, ease: 'easeOut' as const },
  }

  return (
    <div className="flex min-h-[20dvh] flex-col items-center justify-center gap-[1.2dvh] text-center">
      {shown >= 1 && (
        <motion.div {...reveal}>
          <p className="gold-text font-script text-[clamp(1.7rem,4.6vw,4.2rem)] leading-[1.1]">Happy Birthday</p>
          <p className="font-display text-[clamp(1.05rem,3vw,2.6rem)] font-bold leading-tight text-cream [text-shadow:0_0_18px_rgb(243_201_105/0.55)]">
            {data.birthdayName} 🎂
          </p>
        </motion.div>
      )}
      {shown >= 2 && (
        <motion.p {...reveal} className="font-display text-[clamp(0.8rem,1.8vw,1.45rem)] font-semibold tracking-wide text-gold">
          ✨ {data.godName} Bless You ✨
        </motion.p>
      )}
      {shown >= 3 && data.customMessage && (
        <motion.p
          {...reveal}
          className="max-w-prose whitespace-pre-line text-[clamp(0.72rem,1.3vw,1.05rem)] font-light italic leading-snug text-cream/90"
        >
          “{data.customMessage}”
        </motion.p>
      )}
    </div>
  )
}
