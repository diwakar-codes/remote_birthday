import { motion } from 'motion/react'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

interface Props {
  lit: boolean
  /** When set, clicking the candles blows them out. */
  onBlow?: () => void
  /** Knife mode: a cutting stroke through the cake is detected. */
  knifeActive: boolean
  onCut: () => void
  /** Short tip for the user, e.g. "use the right mouse button". */
  onHint: (hint: string) => void
  /** Organizer's image revealed after the cut (null -> a cake slice rises instead). */
  surpriseSrc: string | null
}

// ---- Cake geometry (SVG viewBox 0 0 300 270) ----
const BOTTOM = { left: 40, right: 260, top: 160, bottom: 228, rx: 110, ry: 18 }
const TOP = { left: 78, right: 222, top: 102, bottom: 156, rx: 72, ry: 12 }
const CANDLES = [
  { x: 114, base: 104 },
  { x: 132, base: 108 },
  { x: 150, base: 110 },
  { x: 168, base: 108 },
  { x: 186, base: 104 },
]
const CANDLE_COLORS = ['#ff8fab', '#9bf6ff', '#ffd166', '#b9fbc0', '#cdb4db']

// ---- Cut detection ----
// The VISIBLE cake (top of the frosting -> front bottom of the chocolate tier) is split
// into horizontal bands. The knife "cuts" a band when it passes through the cake inside it.
// Progress adds up over several drags, and 60% of the height counts as a full cut, so a
// natural "press on the cake, drag down" works without needing pixel-perfect aim.
const CUT_TOP = TOP.top - TOP.ry
const CUT_BOTTOM = BOTTOM.bottom + BOTTOM.ry
const BANDS = 8
const CUT_DONE = 0.6

function insideCake(x: number, y: number) {
  if (y >= CUT_TOP && y < BOTTOM.top) return x >= TOP.left && x <= TOP.right
  if (y >= BOTTOM.top && y <= CUT_BOTTOM) return x >= BOTTOM.left && x <= BOTTOM.right
  return false
}

// ---- Surprise revealed inside the cake after the cut ----
// Only the organizer's uploaded image - there is no default image.
// Without an upload (or if it fails to load), a classic cake slice rises instead.

/** Preloads the organizer's surprise image, so it pops instantly after the cut. */
function useRevealImage(custom: string | null) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    const tryLoad = (url: string) =>
      new Promise<boolean>((resolve) => {
        const img = new Image()
        img.onload = () => resolve(img.naturalWidth > 0)
        img.onerror = () => resolve(false)
        img.src = url
      })
    setSrc(null)
    if (custom) void tryLoad(custom).then((ok) => !cancelled && ok && setSrc(custom))
    return () => {
      cancelled = true
    }
  }, [custom])
  return src
}

const frontRimY = (x: number, cx: number, rx: number, y: number, ry: number) =>
  y + ry * Math.sqrt(Math.max(0, 1 - ((x - cx) / rx) ** 2))

interface Crumb {
  id: number
  x: number
  y: number
  /** horizontal drift */
  dx: number
  /** y where it lands */
  ty: number
  r: number
  color: string
  duration: number
}

interface Stroke {
  active: boolean
  bands: Set<number>
  xs: number[]
  last: { x: number; y: number } | null
}

export default function Cake({ lit, onBlow, knifeActive, onCut, onHint, surpriseSrc }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const ids = {
    choco: `${uid}-choco`,
    pink: `${uid}-pink`,
    plate: `${uid}-plate`,
    flame: `${uid}-flame`,
    glow: `${uid}-glow`,
    layersChoco: `${uid}-lc`,
    layersPink: `${uid}-lp`,
    shape: `${uid}-shape`,
    left: `${uid}-left`,
    right: `${uid}-right`,
  }

  const svgRef = useRef<SVGSVGElement>(null)
  const stroke = useRef<Stroke>({ active: false, bands: new Set(), xs: [], last: null })
  /** One polyline per drag; earlier cut marks stay visible. */
  const [marks, setMarks] = useState<{ x: number; y: number }[][]>([])
  const [progress, setProgress] = useState(0)
  const [splitX, setSplitX] = useState<number | null>(null)
  const [crumbs, setCrumbs] = useState<Crumb[]>([])
  const crumbId = useRef(0)
  const revealSrc = useRevealImage(surpriseSrc)
  const lastCrumbAt = useRef<{ x: number; y: number } | null>(null)

  const spawnCrumbs = (x: number, y: number, count: number, spread: number, landOnPlate: boolean) => {
    const colors = y < BOTTOM.top ? ['#f7d9a8', '#ffe3ee', '#fff8f0'] : ['#7a4320', '#fff3e0', '#94562b']
    const fresh = Array.from({ length: count }, (): Crumb => {
      const ty = landOnPlate ? 226 + Math.random() * 12 : Math.min(y + 18 + Math.random() * 16, 236)
      return {
        id: ++crumbId.current,
        x,
        y,
        dx: (Math.random() - 0.5) * spread,
        ty,
        r: 1.3 + Math.random() * 1.8,
        color: colors[Math.floor(Math.random() * colors.length)],
        duration: landOnPlate ? 0.7 + Math.random() * 0.5 : 0.6,
      }
    })
    setCrumbs((c) => [...c.slice(-60), ...fresh])
  }

  const finish = (cutAt: number) => {
    stroke.current.active = false
    const x = Math.max(105, Math.min(195, cutAt))
    setSplitX(x)
    setMarks([])
    setProgress(0)
    // Crumbs spill out of the whole cut and land on the plate.
    for (let y = CUT_TOP + 6; y < BOTTOM.bottom; y += 12) spawnCrumbs(x, y, 2, 46, true)
    onCut()
  }

  const toSvg = (clientX: number, clientY: number) => {
    const ctm = svgRef.current?.getScreenCTM()
    if (!ctm) return null
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }

  const addPoint = (clientX: number, clientY: number) => {
    const p = toSvg(clientX, clientY)
    if (!p) return
    const s = stroke.current
    // Interpolate between samples so a fast swipe doesn't skip bands.
    const from = s.last ?? p
    const steps = Math.max(1, Math.ceil(Math.hypot(p.x - from.x, p.y - from.y) / 3))
    for (let i = 1; i <= steps; i++) {
      const x = from.x + ((p.x - from.x) * i) / steps
      const y = from.y + ((p.y - from.y) * i) / steps
      if (!insideCake(x, y)) continue
      s.bands.add(Math.min(BANDS - 1, Math.floor(((y - CUT_TOP) / (CUT_BOTTOM - CUT_TOP)) * BANDS)))
      s.xs.push(x)
    }
    s.last = p
    setMarks((all) => [...all.slice(0, -1), [...(all.at(-1) ?? []), p]])

    // Crumbs fall from the blade while it moves through the cake.
    const prev = lastCrumbAt.current
    if (insideCake(p.x, p.y) && (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) > 7)) {
      spawnCrumbs(p.x, p.y, 2, 18, false)
      lastCrumbAt.current = p
    }

    const done = s.bands.size / BANDS
    setProgress(done)
    if (done >= CUT_DONE) {
      const sorted = [...s.xs].sort((a, b) => a - b)
      finish(sorted[Math.floor(sorted.length / 2)])
    }
  }

  const canCut = knifeActive && splitX === null

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!canCut) return
    // Mouse: RIGHT button only. Touch/pen have no right button, so a normal press cuts.
    if (e.pointerType === 'mouse' && e.button !== 2) {
      onHint('🖱️ Use the RIGHT mouse button: hold it and drag down')
      return
    }
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    // Keep the bands already cut: a new drag continues the cut instead of restarting it.
    stroke.current = { ...stroke.current, active: true, last: null }
    lastCrumbAt.current = null
    setMarks((all) => [...all, []])
    addPoint(e.clientX, e.clientY)
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (stroke.current.active) addPoint(e.clientX, e.clientY)
  }

  const onPointerUp = () => {
    if (!stroke.current.active) return
    stroke.current.active = false
    if (stroke.current.bands.size > 0) onHint('Keep going! Drag the knife down through the rest of the cake ⬇️')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (canCut && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      finish(150)
    } else if (lit && onBlow && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      onBlow()
    }
  }

  const body = <CakeBody ids={ids} lit={lit} smoke={splitX === null} />

  return (
    <div
      className={`relative mx-auto w-full max-w-[38dvh] outline-none ${canCut ? 'touch-none' : ''}`}
      tabIndex={canCut || (lit && onBlow) ? 0 : -1}
      aria-label={canCut ? 'Birthday cake. Hold the right mouse button and drag down to cut it, or press Enter.' : 'Birthday cake'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    >
      <motion.svg
        ref={svgRef}
        viewBox="0 0 300 270"
        className="block w-full overflow-visible drop-shadow-[0_16px_24px_rgb(0_0_0/0.55)]"
        initial={{ opacity: 0, scale: 0.7, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 0.5, type: 'spring', stiffness: 110, damping: 14 }}
      >
        <Defs ids={ids} splitX={splitX} />

        {/* plate */}
        <ellipse cx="150" cy="238" rx="142" ry="22" fill={`url(#${ids.plate})`} />
        <ellipse cx="150" cy="235" rx="124" ry="15" fill="#f4f4f8" opacity="0.7" />

        {splitX === null ? (
          body
        ) : (
          <>
            {/* 2) the two halves swing open like a book, pivoting on their outer bottom corners */}
            <motion.g
              clipPath={`url(#${ids.left})`}
              style={{ originX: 0, originY: 1 }}
              initial={{ x: 0, rotate: 0 }}
              animate={{ x: -30, rotate: -7 }}
              transition={{ delay: 0.35, duration: 0.9, ease: [0.34, 1.56, 0.64, 1] }}
            >
              {body}
              <CrossSection x={splitX - 8} ids={ids} />
            </motion.g>
            <motion.g
              clipPath={`url(#${ids.right})`}
              style={{ originX: 1, originY: 1 }}
              initial={{ x: 0, rotate: 0 }}
              animate={{ x: 30, rotate: 7 }}
              transition={{ delay: 0.35, duration: 0.9, ease: [0.34, 1.56, 0.64, 1] }}
            >
              {body}
              <CrossSection x={splitX} ids={ids} />
            </motion.g>

            {/* 1) a bright flash runs down the cut line */}
            <motion.path
              d={`M${splitX} ${CUT_TOP - 14} V${CUT_BOTTOM}`}
              stroke="#fffdf5"
              strokeWidth="3.5"
              strokeLinecap="round"
              fill="none"
              style={{ filter: 'drop-shadow(0 0 5px #fff6d0)' }}
              initial={{ pathLength: 0, opacity: 1 }}
              animate={{ pathLength: 1, opacity: [1, 1, 0] }}
              transition={{ duration: 0.7, times: [0, 0.55, 1] }}
            />

            {/* 3) the organizer's surprise image - or a cake slice - rises out of the gap */}
            {revealSrc ? (
              <Reveal x={splitX} src={revealSrc} ids={ids} />
            ) : (
              <motion.g
                style={{ originX: 0.5, originY: 1 }}
                initial={{ opacity: 0, y: 40, scale: 0.5 }}
                animate={{ opacity: 1, y: [40, -46, -30], scale: 1, rotate: [0, -8, -4] }}
                transition={{ delay: 1.05, duration: 1.2, ease: 'easeOut' }}
              >
                <Slice x={splitX} ids={ids} />
              </motion.g>
            )}
            <Sparkles x={splitX} />
          </>
        )}

        {/* the open cut follows the knife while dragging */}
        {marks.map((mark, i) => mark.length > 1 && (
          <g key={i} clipPath={`url(#${ids.shape})`} pointerEvents="none">
            <polyline
              points={mark.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="#1f0d04"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points={mark.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={`url(#${ids.layersChoco})`}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.9"
            />
            <polyline
              points={mark.map((p) => `${p.x + 3},${p.y}`).join(' ')}
              fill="none"
              stroke="rgb(255 255 255 / 0.6)"
              strokeWidth="1"
              strokeLinecap="round"
            />
          </g>
        ))}

        {crumbs.map((c) => (
          <motion.circle
            key={c.id}
            cx={c.x}
            cy={c.y}
            r={c.r}
            fill={c.color}
            initial={{ x: 0, y: 0, opacity: 1 }}
            animate={{ x: c.dx, y: c.ty - c.y, opacity: [1, 1, 0] }}
            transition={{
              x: { duration: c.duration, ease: 'easeOut' },
              y: { duration: c.duration, ease: 'easeIn' },
              opacity: { duration: c.duration + 0.8, times: [0, c.duration / (c.duration + 0.8), 1] },
            }}
            onAnimationComplete={() => setCrumbs((all) => all.filter((x) => x.id !== c.id))}
          />
        ))}

        {lit && onBlow && (
          <rect
            x="95"
            y="40"
            width="110"
            height="75"
            fill="transparent"
            className="cursor-pointer"
            onClick={onBlow}
          />
        )}
      </motion.svg>

      {progress > 0 && (
        <div className="absolute inset-x-[15%] -bottom-3 h-1.5 overflow-hidden rounded-full bg-black/50">
          <div className="h-full rounded-full bg-gold transition-[width] duration-75" style={{ width: `${Math.min(100, (progress / CUT_DONE) * 100)}%` }} />
        </div>
      )}
    </div>
  )
}

type Ids = Record<'choco' | 'pink' | 'plate' | 'flame' | 'glow' | 'layersChoco' | 'layersPink' | 'shape' | 'left' | 'right', string>

function Defs({ ids, splitX }: { ids: Ids; splitX: number | null }) {
  const cylinder = (id: string, dark: string, mid: string, light: string) => (
    <linearGradient id={id} x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stopColor={dark} />
      <stop offset="0.35" stopColor={mid} />
      <stop offset="0.52" stopColor={light} />
      <stop offset="0.72" stopColor={mid} />
      <stop offset="1" stopColor={dark} />
    </linearGradient>
  )
  const layers = (id: string, sponge: string, cream: string, jam: string) => (
    <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
      {[
        [0, cream], [0.1, cream], [0.1, sponge], [0.38, sponge], [0.38, jam], [0.46, jam],
        [0.46, sponge], [0.72, sponge], [0.72, cream], [0.8, cream], [0.8, sponge], [1, sponge],
      ].map(([o, c], i) => (
        <stop key={i} offset={o} stopColor={c as string} />
      ))}
    </linearGradient>
  )

  return (
    <defs>
      {cylinder(ids.choco, '#3b1d0c', '#6e3b1c', '#94562b')}
      {cylinder(ids.pink, '#ad1457', '#ec6aa0', '#f8b4cf')}
      {layers(ids.layersChoco, '#7a4320', '#fff3e0', '#e63e62')}
      {layers(ids.layersPink, '#f7d9a8', '#fff8f0', '#ff6f91')}
      <radialGradient id={ids.plate} cx="0.5" cy="0.35" r="0.7">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="0.6" stopColor="#d9d9e3" />
        <stop offset="1" stopColor="#8d8da0" />
      </radialGradient>
      <radialGradient id={ids.flame} cx="0.5" cy="0.7" r="0.6">
        <stop offset="0" stopColor="#fffbe6" />
        <stop offset="0.35" stopColor="#ffe082" />
        <stop offset="0.75" stopColor="#ff9800" />
        <stop offset="1" stopColor="#ff5722" />
      </radialGradient>
      <radialGradient id={ids.glow}>
        <stop offset="0" stopColor="rgb(255 210 110 / 0.75)" />
        <stop offset="1" stopColor="rgb(255 210 110 / 0)" />
      </radialGradient>
      <clipPath id={ids.shape}>
        <path d={tierPath(BOTTOM)} />
        <ellipse cx="150" cy={BOTTOM.top} rx={BOTTOM.rx} ry={BOTTOM.ry} />
        <path d={tierPath(TOP)} />
        <ellipse cx="150" cy={TOP.top} rx={TOP.rx} ry={TOP.ry} />
      </clipPath>
      {splitX !== null && (
        <>
          <clipPath id={ids.left}>
            <rect x="-100" y="-100" width={splitX + 100} height="500" />
          </clipPath>
          <clipPath id={ids.right}>
            <rect x={splitX} y="-100" width="500" height="500" />
          </clipPath>
        </>
      )}
    </defs>
  )
}

function tierPath(t: typeof BOTTOM) {
  return `M${t.left} ${t.top} V${t.bottom} A${t.rx} ${t.ry} 0 0 0 ${t.right} ${t.bottom} V${t.top} Z`
}

function band(t: typeof BOTTOM, y1: number, y2: number) {
  return `M${t.left} ${y1} A${t.rx} ${t.ry} 0 0 0 ${t.right} ${y1} V${y2} A${t.rx} ${t.ry} 0 0 1 ${t.left} ${y2} Z`
}

function Drips({ t, color, lengths, step }: { t: typeof BOTTOM; color: string; lengths: number[]; step: number }) {
  const xs: number[] = []
  for (let x = t.left + 8; x <= t.right - 8; x += step) xs.push(x)
  return (
    <g fill={color}>
      <path d={band(t, t.top, t.top + 6)} />
      {xs.map((x, i) => (
        <rect key={x} x={x - 5} y={frontRimY(x, 150, t.rx, t.top, t.ry) - 2} width="10" height={lengths[i % lengths.length]} rx="5" />
      ))}
    </g>
  )
}

function Pearls({ t, color, step, r }: { t: typeof BOTTOM; color: string; step: number; r: number }) {
  const xs: number[] = []
  for (let x = t.left + 4; x <= t.right - 4; x += step) xs.push(x)
  return (
    <g fill={color}>
      {xs.map((x) => (
        <circle key={x} cx={x} cy={frontRimY(x, 150, t.rx, t.bottom, t.ry) - r + 1} r={r} />
      ))}
    </g>
  )
}

const SPRINKLES = Array.from({ length: 26 }, (_, i) => ({
  x: 52 + ((i * 37) % 196),
  y: 182 + ((i * 13) % 16) + (i % 2) * 22,
  r: (i * 47) % 180,
  c: ['#ffd166', '#ff8fab', '#9bf6ff', '#b9fbc0', '#ffffff'][i % 5],
}))

function CakeBody({ ids, lit, smoke }: { ids: Ids; lit: boolean; smoke: boolean }) {
  return (
    <g>
      {/* bottom tier: chocolate */}
      <path d={tierPath(BOTTOM)} fill={`url(#${ids.choco})`} />
      {SPRINKLES.map((s, i) => (
        <rect key={i} x={s.x} y={s.y} width="7" height="2.4" rx="1.2" fill={s.c} transform={`rotate(${s.r} ${s.x + 3.5} ${s.y + 1.2})`} />
      ))}
      <path d={band(BOTTOM, 204, 214)} fill="#f3c969" />
      <path d={band(BOTTOM, 207, 209)} fill="#b8862b" opacity="0.6" />
      <Pearls t={BOTTOM} color="#fff3e0" step={10} r={3.5} />
      <ellipse cx="150" cy={BOTTOM.top} rx={BOTTOM.rx} ry={BOTTOM.ry} fill="#fff3e0" />
      <Drips t={BOTTOM} color="#fff3e0" step={17} lengths={[12, 20, 9, 24, 14, 17, 10, 22, 15, 11, 19, 9, 16]} />

      {/* top tier: pink */}
      <path d={tierPath(TOP)} fill={`url(#${ids.pink})`} />
      <Pearls t={TOP} color="#ffffff" step={9} r={3} />
      <ellipse cx="150" cy={TOP.top} rx={TOP.rx} ry={TOP.ry} fill="#ffe3ee" />
      <Drips t={TOP} color="#fff7fb" step={14} lengths={[9, 15, 7, 18, 11, 13, 8, 16, 10, 14, 7]} />

      {/* candles */}
      {CANDLES.map(({ x, base }, i) => (
        <g key={x}>
          <rect x={x - 3.5} y={base - 30} width="7" height="30" rx="2" fill={CANDLE_COLORS[i]} />
          {[6, 14, 22].map((dy) => (
            <path key={dy} d={`M${x - 3.5} ${base - 30 + dy} l7 -4 v3 l-7 4 Z`} fill="rgb(255 255 255 / 0.55)" />
          ))}
          <line x1={x} y1={base - 30} x2={x} y2={base - 35} stroke="#3a2a1a" strokeWidth="1.4" strokeLinecap="round" />
          <g className={`flame ${lit ? '' : 'out'}`} style={{ transitionDelay: `${i * 0.12}s` }}>
            <circle cx={x} cy={base - 42} r="11" fill={`url(#${ids.glow})`} />
            <path
              d={`M${x} ${base - 54} C${x + 6} ${base - 45} ${x + 5} ${base - 36} ${x} ${base - 35} C${x - 5} ${base - 36} ${x - 6} ${base - 45} ${x} ${base - 54} Z`}
              fill={`url(#${ids.flame})`}
            />
          </g>
          {!lit && smoke && (
            <path
              className="smoke"
              style={{ animationDelay: `${0.25 + i * 0.12}s` }}
              d={`M${x} ${base - 36} c-4 -6 4 -10 0 -16 c-4 -6 4 -10 0 -14`}
              fill="none"
              stroke="rgb(220 220 220 / 0.8)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          )}
        </g>
      ))}
    </g>
  )
}

const REVEAL_SIZE = 130

/** The surprise image pops out of the middle of the cut cake, with a golden glow behind it. */
function Reveal({ x, src, ids }: { x: number; src: string; ids: Ids }) {
  return (
    <motion.g
      style={{ originX: 0.5, originY: 1 }}
      initial={{ opacity: 0, y: 60, scale: 0.25 }}
      animate={{ opacity: 1, y: [60, -84, -66], scale: [0.25, 1.1, 1], rotate: [0, -5, 0] }}
      transition={{ delay: 1.05, duration: 1.4, ease: 'easeOut' }}
    >
      <circle cx={x} cy={170} r={REVEAL_SIZE * 0.62} fill={`url(#${ids.glow})`} />
      <image
        href={src}
        x={x - REVEAL_SIZE / 2}
        y={240 - REVEAL_SIZE}
        width={REVEAL_SIZE}
        height={REVEAL_SIZE}
        preserveAspectRatio="xMidYMid meet"
        style={{ filter: 'drop-shadow(0 8px 10px rgb(0 0 0 / 0.55))' }}
      />
    </motion.g>
  )
}

/** The first piece, lifted out of the cake: both tiers' layers + frosting + a cherry. */
function Slice({ x, ids }: { x: number; ids: Ids }) {
  const w = 34
  const left = x - w / 2
  return (
    <g style={{ filter: 'drop-shadow(0 6px 6px rgb(0 0 0 / 0.45))' }}>
      <rect x={left} y={BOTTOM.top} width={w} height={BOTTOM.bottom - BOTTOM.top + 6} rx="2" fill={`url(#${ids.layersChoco})`} />
      <rect x={left + w - 6} y={BOTTOM.top} width="6" height={BOTTOM.bottom - BOTTOM.top + 6} fill="rgb(0 0 0 / 0.22)" />
      <rect x={left + 2} y={TOP.top} width={w - 4} height={BOTTOM.top - TOP.top + 2} rx="2" fill={`url(#${ids.layersPink})`} />
      <rect x={left + w - 7} y={TOP.top} width="5" height={BOTTOM.top - TOP.top + 2} fill="rgb(0 0 0 / 0.18)" />
      <rect x={left} y={TOP.top - 6} width={w} height="9" rx="4.5" fill="#fff7fb" />
      {[left + 6, left + 15, left + 26].map((dx, i) => (
        <rect key={dx} x={dx - 3} y={TOP.top - 2} width="6" height={6 + i * 2} rx="3" fill="#fff7fb" />
      ))}
      <circle cx={x} cy={TOP.top - 12} r="6" fill="#d7263d" />
      <circle cx={x - 2} cy={TOP.top - 14} r="1.8" fill="rgb(255 255 255 / 0.7)" />
      <path d={`M${x} ${TOP.top - 17} q3 -8 9 -9`} stroke="#3c7a2d" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </g>
  )
}

const SPARKLE_SPOTS = [
  { dx: -34, dy: 70, s: 1, d: 1.6 },
  { dx: 32, dy: 58, s: 0.8, d: 1.75 },
  { dx: -22, dy: 30, s: 0.6, d: 1.9 },
  { dx: 26, dy: 96, s: 0.7, d: 2.0 },
  { dx: 0, dy: 40, s: 1.1, d: 2.15 },
]

function Sparkles({ x }: { x: number }) {
  return (
    <g pointerEvents="none">
      {SPARKLE_SPOTS.map(({ dx, dy, s, d }, i) => (
        <motion.path
          key={i}
          d={`M${x + dx} ${dy - 8} L${x + dx + 2} ${dy - 2} L${x + dx + 8} ${dy} L${x + dx + 2} ${dy + 2} L${x + dx} ${dy + 8} L${x + dx - 2} ${dy + 2} L${x + dx - 8} ${dy} L${x + dx - 2} ${dy - 2} Z`}
          fill="#fff3c4"
          style={{ originX: 0.5, originY: 0.5, filter: 'drop-shadow(0 0 4px #f3c969)' }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, s * 1.2, 0], opacity: [0, 1, 0], rotate: [0, 45] }}
          transition={{ delay: d, duration: 0.8, repeat: 2, repeatDelay: 0.4 }}
        />
      ))}
    </g>
  )
}

/** The inside of the cake, visible on the cut edge of each half. */
function CrossSection({ x, ids }: { x: number; ids: Ids }) {
  return (
    <g>
      <rect x={x} y={TOP.top} width="8" height={TOP.bottom - TOP.top + 8} fill={`url(#${ids.layersPink})`} />
      <rect x={x} y={BOTTOM.top} width="8" height={BOTTOM.bottom - BOTTOM.top + 14} fill={`url(#${ids.layersChoco})`} />
    </g>
  )
}
