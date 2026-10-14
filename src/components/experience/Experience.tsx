import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import type { CelebrationData } from '../../lib/types'
import Curtains from './Curtains'
import Stage from './Stage'

type Act = 'closed' | 'opening' | 'lit'

/** Default birthday song (public/audio). An organizer-uploaded song replaces it. */
const DEFAULT_SONG = '/audio/happy-birthday.mp3'

interface Props {
  data: CelebrationData
  /** Restart the whole show from closed curtains. */
  onReplay: () => void
}

/**
 * The full birthday show, layered back to front:
 *   backdrop + floor -> spotlight -> stage content -> curtains -> valance -> rope
 */
export default function Experience({ data, onReplay }: Props) {
  const [act, setAct] = useState<Act>('closed')
  const music = useMusic(data.audio ?? DEFAULT_SONG)

  useEffect(() => {
    if (act !== 'opening') return
    const t = setTimeout(() => setAct('lit'), 1700)
    return () => clearTimeout(t)
  }, [act])

  const handlePull = () => {
    if (act !== 'closed') return
    setAct('opening')
  }

  return (
    // overflow-clip (not hidden): a clipped box can never be scrolled, even by touch or focus.
    <div className="fixed inset-0 select-none overflow-clip bg-night" onContextMenu={(e) => e.preventDefault()}>
      <div className="stage-backdrop absolute inset-0" />
      <div className="stage-floor absolute inset-x-0 bottom-0 h-[16dvh]" />
      <div className="absolute inset-x-0 bottom-[1.2dvh] z-[3] flex justify-around px-[8vw]">
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className="footlight" />
        ))}
      </div>

      <Spotlight on={act === 'lit'} />
      {act === 'lit' && <Stage data={data} onCandlesBlown={music.play} onReplay={onReplay} />}

      <Curtains open={act !== 'closed'} onPull={handlePull} birthdayName={data.birthdayName} />
      <Valance />

      {music.started && (
        <button
          type="button"
          onClick={music.toggle}
          className="fixed bottom-4 right-4 z-50 rounded-full border border-gold/50 bg-black/60 px-3 py-2 text-sm text-gold backdrop-blur"
          aria-label={music.muted ? 'Unmute music' : 'Mute music'}
        >
          {music.blocked ? '▶ Play music' : music.muted ? '🔇' : '🔊'}
        </button>
      )}
    </div>
  )
}

function Valance() {
  return (
    <div className="velvet absolute inset-x-0 top-0 z-30 h-[11dvh] min-h-16 shadow-[0_10px_30px_rgb(0_0_0/0.6)]">
      <div className="absolute inset-0 flex items-end justify-center pb-[2.2dvh]">
        <span className="font-display text-[10px] font-bold tracking-[0.4em] text-gold/90 sm:text-sm">
          ✦ THE BIRTHDAY THEATRE ✦
        </span>
      </div>
      <div className="absolute inset-x-0 top-full">
        <div className="gold-braid" />
        <div className="fringe" />
      </div>
    </div>
  )
}

/** Hybrid reveal: the stage is dark after the curtains part, then a spotlight flickers on. */
function Spotlight({ on }: { on: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[1]">
      <motion.div
        className="absolute inset-0 bg-black"
        initial={{ opacity: 0.92 }}
        animate={on ? { opacity: [0.92, 0.35, 0.8, 0.1, 0] } : { opacity: 0.92 }}
        transition={{ duration: 1.1, times: [0, 0.2, 0.35, 0.6, 1] }}
      />
      <motion.div
        className="absolute inset-0 bg-[radial-gradient(ellipse_48%_55%_at_50%_58%,transparent_45%,rgb(0_0_0/0.75)_100%)]"
        initial={{ opacity: 0 }}
        animate={{ opacity: on ? 1 : 0 }}
        transition={{ duration: 1 }}
      />
      <motion.div
        className="absolute left-1/2 top-0 h-full w-[90vw] -translate-x-1/2 bg-[linear-gradient(180deg,rgb(255_240_200/0.28),rgb(255_240_200/0.06)_75%,transparent)] mix-blend-screen [clip-path:polygon(44%_0,56%_0,100%_100%,0_100%)]"
        initial={{ opacity: 0 }}
        animate={on ? { opacity: [0, 0.6, 0.2, 1] } : { opacity: 0 }}
        transition={{ duration: 1.1, times: [0, 0.25, 0.4, 1] }}
      />
      <motion.div
        className="absolute bottom-[2dvh] left-1/2 h-[14dvh] w-[70vw] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(ellipse,rgb(255_235_180/0.35),transparent_70%)]"
        initial={{ opacity: 0 }}
        animate={{ opacity: on ? 1 : 0 }}
        transition={{ duration: 1.2, delay: 0.4 }}
      />
    </div>
  )
}

/**
 * Birthday song, looping. play() is called from the "blow the candles" click:
 * browsers only allow sound that starts inside a user gesture.
 */
function useMusic(url: string) {
  const audio = useRef<HTMLAudioElement | null>(null)
  const [started, setStarted] = useState(false)
  const [muted, setMuted] = useState(false)
  const [blocked, setBlocked] = useState(false)

  useEffect(() => {
    const a = new Audio(url)
    a.loop = true
    a.preload = 'auto' // download during the curtain/messages so it starts instantly
    audio.current = a
    return () => {
      a.pause()
      audio.current = null
    }
  }, [url])

  const play = () => {
    const a = audio.current
    if (!a) return
    setStarted(true)
    a.currentTime = 0
    a.play().then(
      () => setBlocked(false),
      () => setBlocked(true),
    )
  }

  const toggle = () => {
    const a = audio.current
    if (!a) return
    if (blocked) return play()
    a.muted = !a.muted
    setMuted(a.muted)
  }

  return { started, muted, blocked, play, toggle }
}
