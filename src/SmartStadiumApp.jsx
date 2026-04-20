import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  MapPin, Clock, Users, Zap, Coffee, Utensils, Navigation,
  Sparkles, X, Check, ChevronRight, AlertCircle, Activity,
  Trophy, Bell, Flame, Wind, ShoppingBag, ArrowRight, Radio,
  Target, Volume2, TrendingUp, TrendingDown, CircleDot,
} from 'lucide-react';

/* =========================================================
   SMART STADIUM ASSISTANT — IPL MATCH-DAY COMPANION
   Mocked entirely in-memory. No network calls.
   Demo flow: open → inspect queues → "Simulate Innings Break"
   → watch wait times spike, recommendation switch, route redraw.
   ========================================================= */

// ---------- Static data (deterministic + realistic labels) ----------
const MATCH = {
  venue: 'Eden Gardens, Kolkata',
  home: { code: 'KKR', name: 'Kolkata Knight Riders', color: '#8b5cf6' },
  away: { code: 'CSK', name: 'Chennai Super Kings',  color: '#fbbf24' },
  status: '1ST INNINGS',
  score: '168/4',
  overs: '16.2',
  batter: 'V. Iyer',
  bowler: 'R. Jadeja',
};

const USER = {
  block: 'Block B — Upper Tier',
  row: 'Row 14, Seat 22',
  x: 268, y: 320, // position on the 400×400 SVG
};

// Five stalls covering drinks, snacks, full meals. Each has a
// baseWait (normal) and surgeWait (after innings break). The surgeWait
// values are tuned so the *optimal* stall changes post-surge — the
// nearest stall gets swamped while a slightly farther one stays calm.
const STALLS_SEED = [
  {
    id: 'champions',
    name: 'Champions Café',
    tag: 'Coffee • Snacks',
    block: 'Block C — Lower',
    icon: 'coffee',
    distance: 45,   // metres (approx)
    baseWait: 4,
    surgeWait: 26,  // gets swamped (closest → biggest surge)
    x: 320, y: 205,
    items: [
      { name: 'Cold Coffee',      price: 180 },
      { name: 'Veg Sandwich',     price: 150 },
      { name: 'Masala Samosa',    price: 60  },
    ],
  },
  {
    id: 'kathi',
    name: 'Kolkata Kathi Rolls',
    tag: 'Regional • Street Food',
    block: 'Block D — Upper',
    icon: 'flame',
    distance: 85,
    baseWait: 6,
    surgeWait: 9,   // stays calm → becomes optimal after surge
    x: 330, y: 125,
    items: [
      { name: 'Chicken Kathi Roll', price: 220 },
      { name: 'Paneer Kathi Roll',  price: 190 },
      { name: 'Sweet Lassi',        price: 90  },
    ],
  },
  {
    id: 'sixout',
    name: 'Six & Out Beverages',
    tag: 'Cold Drinks • Water',
    block: 'Block L — Lower',
    icon: 'wind',
    distance: 105,
    baseWait: 3,
    surgeWait: 11,
    x: 165, y: 325,
    items: [
      { name: 'Thums Up (500ml)',  price: 70  },
      { name: 'Red Bull',           price: 140 },
      { name: 'Packaged Water',     price: 40  },
    ],
  },
  {
    id: 'burger',
    name: 'Boundary Burgers',
    tag: 'Fast Food',
    block: 'Block F — Upper',
    icon: 'shopping',
    distance: 175,
    baseWait: 9,
    surgeWait: 24,
    x: 200, y: 70,
    items: [
      { name: 'Classic Veg Burger', price: 260 },
      { name: 'Loaded Chicken Burger', price: 320 },
      { name: 'Crispy Fries',          price: 150 },
    ],
  },
  {
    id: 'spice',
    name: 'Spice Route',
    tag: 'Biryani • Curries',
    block: 'Block H — Upper',
    icon: 'utensils',
    distance: 215,
    baseWait: 11,
    surgeWait: 16,
    x: 90, y: 180,
    items: [
      { name: 'Hyderabadi Biryani',   price: 380 },
      { name: 'Butter Chicken + Naan', price: 420 },
      { name: 'Dal Makhani',           price: 280 },
    ],
  },
];

const GATES = [
  { id: 'g2', label: 'G2', x: 245, y: 388 },
  { id: 'g4', label: 'G4', x: 385, y: 305 },
  { id: 'g7', label: 'G7', x: 370, y: 95  },
  { id: 'g11',label: 'G11',x: 180, y: 18  },
  { id: 'g13',label: 'G13',x: 22,  y: 190 },
  { id: 'g17',label: 'G17',x: 115, y: 388 },
];

// Blocks rendered as wedges around the oval. Order = clockwise from top.
const BLOCKS = [
  { id: 'F',  label: 'F',  start: -100, end: -80 },
  { id: 'E',  label: 'E',  start: -80,  end: -55 },
  { id: 'D1', label: 'D1', start: -55,  end: -30 },
  { id: 'D',  label: 'D',  start: -30,  end: -5  },
  { id: 'C',  label: 'C',  start: -5,   end: 20  },
  { id: 'B',  label: 'B',  start: 20,   end: 50  },
  { id: 'L1', label: 'L1', start: 50,   end: 80  },
  { id: 'L',  label: 'L',  start: 80,   end: 105 },
  { id: 'K',  label: 'K',  start: 105,  end: 130 },
  { id: 'J',  label: 'J',  start: 130,  end: 160 },
  { id: 'H',  label: 'H',  start: 160,  end: 195 },
  { id: 'G',  label: 'G',  start: 195,  end: 225 },
  { id: 'F1', label: 'F1', start: 225,  end: 260 },
];

const STALL_TO_BLOCK = {
  champions: 'C', kathi: 'D', sixout: 'L', burger: 'F1', spice: 'H',
};

// ---------- Scoring: score = wait + 0.5·distance. Lower = better. ----------
const scoreOf = (s) => s.waitTime + 0.5 * s.distance;

// ---------- Helpers ----------
const cx = (...c) => c.filter(Boolean).join(' ');
const waitColor = (w) =>
  w <= 6  ? { text: 'text-emerald-300', bg: 'bg-emerald-500/15', ring: 'ring-emerald-400/40', dot: 'bg-emerald-400', hex: '#34d399' } :
  w <= 15 ? { text: 'text-amber-300',   bg: 'bg-amber-500/15',   ring: 'ring-amber-400/40',   dot: 'bg-amber-400',   hex: '#fbbf24' } :
            { text: 'text-rose-300',    bg: 'bg-rose-500/15',    ring: 'ring-rose-400/40',    dot: 'bg-rose-400',    hex: '#fb7185' };

const iconFor = (key, cls = 'w-5 h-5') => ({
  coffee:   <Coffee className={cls} />,
  flame:    <Flame className={cls} />,
  wind:     <Wind className={cls} />,
  shopping: <ShoppingBag className={cls} />,
  utensils: <Utensils className={cls} />,
}[key] ?? <Utensils className={cls} />);

// ---------- Animated number (counts to target smoothly) ----------
function AnimatedNumber({ value, className }) {
  const [display, setDisplay] = useState(value);
  const raf = useRef();
  const from = useRef(value);
  const start = useRef(0);
  useEffect(() => {
    from.current = display;
    start.current = performance.now();
    const dur = 700;
    const animate = (t) => {
      const p = Math.min(1, (t - start.current) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from.current + (value - from.current) * eased));
      if (p < 1) raf.current = requestAnimationFrame(animate);
    };
    raf.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line
  }, [value]);
  return <span className={className}>{display}</span>;
}

// ---------- Toast ----------
function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md animate-[slideDown_.4s_ease]">
      <div className={cx(
        'flex items-start gap-3 rounded-2xl px-4 py-3 backdrop-blur-xl border shadow-2xl',
        toast.kind === 'alert'
          ? 'bg-rose-500/15 border-rose-400/30 text-rose-100'
          : 'bg-emerald-500/15 border-emerald-400/30 text-emerald-50'
      )}>
        <div className={cx(
          'mt-0.5 grid place-items-center w-8 h-8 rounded-full',
          toast.kind === 'alert' ? 'bg-rose-500/25' : 'bg-emerald-500/25'
        )}>
          {toast.kind === 'alert'
            ? <AlertCircle className="w-4 h-4" />
            : <Sparkles className="w-4 h-4" />}
        </div>
        <div className="flex-1 text-sm leading-snug">
          <div className="font-semibold tracking-wide uppercase text-[11px] opacity-80">
            {toast.title}
          </div>
          <div className="mt-0.5">{toast.message}</div>
        </div>
      </div>
    </div>
  );
}

// ---------- Match Ticker (sticky top) ----------
function MatchTicker({ inningsBreak }) {
  return (
    <div className="sticky top-0 z-30 backdrop-blur-xl bg-slate-950/75 border-b border-white/5">
      <div className="px-4 pt-3 pb-3 flex items-center gap-3">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-rose-500/15 border border-rose-400/30">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
          <span className="text-[10px] font-bold tracking-[0.15em] text-rose-200">LIVE</span>
        </div>
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <Team code={MATCH.home.code} color={MATCH.home.color} />
          <span className="font-display text-xl text-white/40">vs</span>
          <Team code={MATCH.away.code} color={MATCH.away.color} />
        </div>
        <div className="text-right">
          <div className="font-mono text-[11px] text-white/50 leading-none">
            {inningsBreak ? 'INNINGS BREAK' : MATCH.status}
          </div>
          <div className="font-display text-lg text-white leading-none mt-0.5 tracking-wide">
            {MATCH.score} <span className="text-white/40 text-sm">({MATCH.overs})</span>
          </div>
        </div>
      </div>
      {inningsBreak && (
        <div className="px-4 pb-2">
          <div className="h-0.5 w-full bg-rose-500/30 overflow-hidden rounded-full">
            <div className="h-full w-1/2 bg-rose-400 animate-[slideRight_2s_ease-in-out_infinite]" />
          </div>
        </div>
      )}
    </div>
  );
}

function Team({ code, color }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <div
        className="w-6 h-6 rounded-md grid place-items-center font-display text-[11px] font-bold tracking-wider text-slate-950"
        style={{ background: color }}
      >
        {code.slice(0, 3)}
      </div>
      <span className="font-display text-sm text-white tracking-wide truncate">{code}</span>
    </div>
  );
}

// ---------- Stadium Map (custom SVG) ----------
function StadiumMap({ stalls, recommended, inningsBreak }) {
  // Build wedge paths for the inner ring of blocks
  const cxMap = 200, cyMap = 200;
  const rInner = 90, rOuter = 155;

  const wedgePath = (startDeg, endDeg) => {
    const toXY = (r, deg) => {
      const a = (deg - 90) * Math.PI / 180;
      return [cxMap + r * Math.cos(a), cyMap + r * Math.sin(a)];
    };
    const [x1, y1] = toXY(rInner, startDeg);
    const [x2, y2] = toXY(rOuter, startDeg);
    const [x3, y3] = toXY(rOuter, endDeg);
    const [x4, y4] = toXY(rInner, endDeg);
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${x1} ${y1} L ${x2} ${y2} A ${rOuter} ${rOuter} 0 ${large} 1 ${x3} ${y3} L ${x4} ${y4} A ${rInner} ${rInner} 0 ${large} 0 ${x1} ${y1} Z`;
  };

  const blockCrowd = (blockId) => {
    // compute a "heat" 0–1 from stalls in that block
    const stall = stalls.find(s => STALL_TO_BLOCK[s.id] === blockId);
    if (!stall) return inningsBreak ? 0.35 : 0.12;
    return Math.min(1, stall.waitTime / 25);
  };

  const heatFill = (h) => {
    if (h < 0.25) return 'rgba(52,211,153,0.18)';      // green
    if (h < 0.6)  return 'rgba(251,191,36,0.22)';      // amber
    return 'rgba(251,113,133,0.32)';                    // rose
  };

  // Animated route from user → recommended
  const pathKey = recommended?.id ?? 'none';

  return (
    <div className="relative mx-4 mt-3 rounded-3xl overflow-hidden border border-white/10 bg-gradient-to-br from-slate-900/80 via-slate-950/80 to-slate-900/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      {/* Header strip */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <Radio className="w-3.5 h-3.5 text-emerald-300" />
          <span className="font-display tracking-[0.25em] text-[10px] text-emerald-200/80">STADIUM RADAR</span>
        </div>
        <div className="flex items-center gap-1.5">
          <CircleDot className="w-3 h-3 text-white/40" />
          <span className="text-[10px] font-mono text-white/50">{MATCH.venue}</span>
        </div>
      </div>

      <svg viewBox="0 0 400 400" className="w-full h-[340px] block">
        <defs>
          <radialGradient id="field" cx="50%" cy="50%" r="50%">
            <stop offset="0%"  stopColor="#14532d" />
            <stop offset="70%" stopColor="#0f3d22" />
            <stop offset="100%" stopColor="#052b14" />
          </radialGradient>
          <radialGradient id="glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%"  stopColor="rgba(34,197,94,0.25)" />
            <stop offset="100%" stopColor="rgba(34,197,94,0)" />
          </radialGradient>
          <linearGradient id="pitch" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#e7d6a0" />
            <stop offset="100%" stopColor="#b89a5f" />
          </linearGradient>
          <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>

        {/* radar concentric circles */}
        {[40, 75, 115, 155, 190].map((r) => (
          <circle key={r} cx="200" cy="200" r={r}
            fill="none" stroke="rgba(255,255,255,0.04)" strokeDasharray="2 4" />
        ))}

        {/* outer stadium boundary */}
        <circle cx="200" cy="200" r="185" fill="none"
          stroke="rgba(255,255,255,0.08)" strokeWidth="1" />

        {/* blocks ring */}
        <g>
          {BLOCKS.map((b) => {
            const heat = blockCrowd(b.id);
            return (
              <path
                key={b.id}
                d={wedgePath(b.start, b.end)}
                fill={heatFill(heat)}
                stroke="rgba(255,255,255,0.09)"
                strokeWidth="0.5"
                style={{ transition: 'fill 0.9s ease' }}
              />
            );
          })}
        </g>

        {/* inner field */}
        <circle cx="200" cy="200" r="195" fill="url(#glow)" opacity="0.5" />
        <ellipse cx="200" cy="200" rx="80" ry="78" fill="url(#field)" />
        <ellipse cx="200" cy="200" rx="80" ry="78" fill="none"
          stroke="rgba(255,255,255,0.28)" strokeWidth="1" />
        <ellipse cx="200" cy="200" rx="32" ry="30" fill="none"
          stroke="rgba(255,255,255,0.22)" strokeWidth="0.75" strokeDasharray="3 3" />
        {/* pitch */}
        <rect x="191" y="180" width="18" height="40" rx="2"
          fill="url(#pitch)" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5" />

        {/* block labels */}
        {BLOCKS.map((b) => {
          const mid = (b.start + b.end) / 2;
          const rLbl = 122;
          const a = (mid - 90) * Math.PI / 180;
          const lx = 200 + rLbl * Math.cos(a);
          const ly = 200 + rLbl * Math.sin(a);
          return (
            <text key={b.id} x={lx} y={ly}
              textAnchor="middle" dominantBaseline="middle"
              fill="rgba(255,255,255,0.65)"
              className="font-display"
              style={{ fontSize: 9, letterSpacing: 1 }}>
              {b.label}
            </text>
          );
        })}

        {/* gates */}
        {GATES.map((g) => (
          <g key={g.id}>
            <rect x={g.x - 9} y={g.y - 7} width="18" height="14" rx="3"
              fill="rgba(15,23,42,0.8)" stroke="rgba(255,255,255,0.25)" />
            <text x={g.x} y={g.y + 3} textAnchor="middle"
              fill="rgba(255,255,255,0.6)" style={{ fontSize: 8, fontFamily: 'monospace' }}>
              {g.label}
            </text>
          </g>
        ))}

        {/* animated optimized route from user to recommended */}
        {recommended && (
          <g key={pathKey}>
            <line
              x1={USER.x} y1={USER.y}
              x2={recommended.x} y2={recommended.y}
              stroke="#fbbf24"
              strokeWidth="2"
              strokeDasharray="4 4"
              strokeLinecap="round"
              style={{
                filter: 'drop-shadow(0 0 4px rgba(251,191,36,0.6))',
                animation: 'dashFlow 1.4s linear infinite',
              }}
            />
          </g>
        )}

        {/* stall markers */}
        {stalls.map((s) => {
          const c = waitColor(s.waitTime);
          const isRec = recommended && recommended.id === s.id;
          return (
            <g key={s.id}>
              {isRec && (
                <>
                  <circle cx={s.x} cy={s.y} r="18" fill="rgba(251,191,36,0.1)"
                    style={{ animation: 'pulseRing 2s ease-out infinite' }} />
                  <circle cx={s.x} cy={s.y} r="14" fill="none"
                    stroke="#fbbf24" strokeWidth="1.5" opacity="0.7" />
                </>
              )}
              <circle cx={s.x} cy={s.y} r="9"
                fill={isRec ? '#fbbf24' : c.hex}
                stroke="#0b1220" strokeWidth="2"
                style={{ transition: 'fill 0.6s ease' }}
              />
              <circle cx={s.x} cy={s.y} r="3.5" fill="#0b1220" />
            </g>
          );
        })}

        {/* user position — pulsing */}
        <g>
          <circle cx={USER.x} cy={USER.y} r="14" fill="rgba(96,165,250,0.18)"
            style={{ animation: 'pulseRing 1.8s ease-out infinite' }} />
          <circle cx={USER.x} cy={USER.y} r="6" fill="#60a5fa"
            stroke="#0b1220" strokeWidth="2" />
        </g>
      </svg>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 flex items-center gap-3 px-3 py-1.5 rounded-full bg-slate-950/70 backdrop-blur border border-white/10">
        <LegendDot color="#60a5fa" label="You" />
        <LegendDot color="#fbbf24" label="Best route" />
        <LegendDot color="#34d399" label="Stall" />
      </div>
      <div className="absolute top-3 right-3 px-2 py-1 rounded-md bg-slate-950/70 backdrop-blur border border-white/10 text-[10px] font-mono text-white/60">
        {USER.block}
      </div>
    </div>
  );
}

function LegendDot({ color, label }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full" style={{ background: color }} />
      <span className="text-[10px] text-white/70 tracking-wide">{label}</span>
    </div>
  );
}

// ---------- Recommendation banner ----------
function RecommendationBanner({ stall, onOrder, key: _k }) {
  if (!stall) return null;
  const eta = Math.max(1, Math.round(stall.distance / 80 + stall.waitTime * 0.3));
  return (
    <div className="mx-4 mt-3">
      <div className="relative overflow-hidden rounded-3xl border border-amber-300/30 bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-emerald-500/10 p-4 shadow-[0_10px_40px_-10px_rgba(251,191,36,0.35)] animate-[fadeSlide_.5s_ease]">
        {/* corner glow */}
        <div className="absolute -top-16 -right-16 w-40 h-40 rounded-full bg-amber-400/25 blur-3xl pointer-events-none" />
        <div className="relative flex items-start gap-3">
          <div className="grid place-items-center w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-300 to-amber-500 text-slate-950 shadow-lg">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-display tracking-[0.2em] text-[10px] text-amber-200">SMART PICK</span>
              <span className="text-[10px] text-white/40">•</span>
              <span className="text-[10px] text-white/50 font-mono">score {scoreOf(stall).toFixed(0)}</span>
            </div>
            <div className="font-display text-2xl text-white mt-0.5 tracking-wide">{stall.name}</div>
            <div className="mt-0.5 text-xs text-white/60">{stall.block} · {stall.distance}m away</div>
            <div className="mt-3 flex items-center gap-4">
              <Stat icon={<Clock className="w-3.5 h-3.5" />} label="Wait" value={`${stall.waitTime}m`} />
              <Stat icon={<Navigation className="w-3.5 h-3.5" />} label="Walk" value={`${eta}m`} />
              <Stat icon={<Users className="w-3.5 h-3.5" />} label="Crowd" value={stall.waitTime <= 8 ? 'Low' : stall.waitTime <= 15 ? 'Med' : 'High'} />
            </div>
          </div>
        </div>
        <button
          onClick={() => onOrder(stall)}
          className="mt-4 w-full group flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 font-display text-sm tracking-[0.15em] shadow-lg hover:shadow-amber-400/30 hover:brightness-110 active:scale-[0.98] transition">
          PRE-ORDER & SKIP THE LINE
          <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition" />
        </button>
        <p className="mt-2 text-[11px] text-white/50 text-center">
          Don't miss the next over — your food will be ready in ~{eta + stall.waitTime} min.
        </p>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="text-white/40">{icon}</div>
      <div>
        <div className="text-[10px] text-white/40 uppercase tracking-wider">{label}</div>
        <div className="font-display text-sm text-white leading-none">{value}</div>
      </div>
    </div>
  );
}

// ---------- Stall card ----------
function StallCard({ stall, isRecommended, onOrder }) {
  const c = waitColor(stall.waitTime);
  const crowdPct = Math.min(100, (stall.waitTime / 30) * 100);
  return (
    <div className={cx(
      'relative rounded-2xl border bg-white/[0.04] backdrop-blur p-3 transition-all duration-500',
      isRecommended
        ? 'border-amber-300/40 ring-1 ring-amber-300/20'
        : 'border-white/10'
    )}>
      <div className="flex items-center gap-3">
        <div className={cx(
          'grid place-items-center w-11 h-11 rounded-xl shrink-0 ring-1',
          c.bg, c.ring
        )}>
          <span className={c.text}>{iconFor(stall.icon)}</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-display text-white text-base tracking-wide truncate">{stall.name}</div>
            {isRecommended && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold tracking-[0.12em] bg-amber-400 text-slate-950">
                <Sparkles className="w-2.5 h-2.5" /> BEST
              </span>
            )}
          </div>
          <div className="text-[11px] text-white/50 truncate">
            {stall.tag} · {stall.block} · {stall.distance}m
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className={cx('font-display text-2xl leading-none tracking-wide', c.text)}>
            <AnimatedNumber value={stall.waitTime} />
            <span className="text-xs text-white/40 ml-0.5">min</span>
          </div>
          <div className="text-[10px] text-white/40 mt-1 font-mono">
            q·{Math.round(stall.waitTime * 1.8)}
          </div>
        </div>
      </div>

      {/* crowd meter */}
      <div className="mt-3 flex items-center gap-2">
        <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${crowdPct}%`,
              background: c.hex,
              boxShadow: `0 0 8px ${c.hex}`,
            }}
          />
        </div>
        <button
          onClick={() => onOrder(stall)}
          className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-[11px] font-medium text-white/80 hover:bg-white/10 active:scale-95 transition">
          Order
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// ---------- Simulate / Reset button ----------
function SimulateBar({ inningsBreak, onSimulate, onReset }) {
  return (
    <div className="sticky bottom-0 z-30 px-4 pt-3 pb-4 bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent">
      {!inningsBreak ? (
        <button
          onClick={onSimulate}
          className="relative w-full group overflow-hidden rounded-2xl py-4 bg-gradient-to-r from-rose-500 via-orange-500 to-amber-500 text-white font-display text-base tracking-[0.2em] shadow-[0_10px_40px_-10px_rgba(244,63,94,0.6)] active:scale-[0.98] transition"
        >
          <span className="relative z-10 inline-flex items-center gap-2">
            <Zap className="w-4 h-4" />
            SIMULATE INNINGS BREAK
          </span>
          <span className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-700" />
        </button>
      ) : (
        <button
          onClick={onReset}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-white/15 bg-white/5 text-white/80 font-display text-sm tracking-[0.2em] hover:bg-white/10 active:scale-[0.98] transition"
        >
          <Wind className="w-4 h-4" />
          RESET TO NORMAL PLAY
        </button>
      )}
    </div>
  );
}

// ---------- Pre-order Modal ----------
function PreOrderModal({ stall, onClose }) {
  const [step, setStep] = useState('select'); // 'select' | 'confirmed'
  const [selected, setSelected] = useState([stall.items[0].name]);
  const total = stall.items
    .filter(i => selected.includes(i.name))
    .reduce((sum, i) => sum + i.price, 0);
  const pickupMin = 5;

  const toggle = (name) =>
    setSelected(prev =>
      prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center animate-[fadeIn_.25s_ease]">
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-slate-900 border-t sm:border border-white/10 sm:rounded-3xl rounded-t-3xl p-5 animate-[slideUp_.35s_cubic-bezier(.22,.68,.35,1.2)] max-h-[92vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 grid place-items-center w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-white/70">
          <X className="w-4 h-4" />
        </button>

        {step === 'select' ? (
          <>
            <div className="flex items-center gap-3">
              <div className="grid place-items-center w-11 h-11 rounded-xl bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30">
                {iconFor(stall.icon)}
              </div>
              <div>
                <div className="font-display text-xl text-white tracking-wide">{stall.name}</div>
                <div className="text-[11px] text-white/50">{stall.block} · {stall.tag}</div>
              </div>
            </div>

            <div className="mt-5 space-y-2">
              {stall.items.map((it) => {
                const picked = selected.includes(it.name);
                return (
                  <button
                    key={it.name}
                    onClick={() => toggle(it.name)}
                    className={cx(
                      'w-full flex items-center gap-3 p-3 rounded-2xl border transition',
                      picked
                        ? 'bg-emerald-500/15 border-emerald-400/30'
                        : 'bg-white/[0.03] border-white/10 hover:bg-white/5'
                    )}
                  >
                    <div className={cx(
                      'grid place-items-center w-6 h-6 rounded-md border',
                      picked
                        ? 'bg-emerald-400 border-emerald-400 text-slate-950'
                        : 'border-white/20'
                    )}>
                      {picked && <Check className="w-3.5 h-3.5" />}
                    </div>
                    <div className="flex-1 text-left">
                      <div className="text-sm text-white">{it.name}</div>
                    </div>
                    <div className="font-mono text-sm text-white/80">₹{it.price}</div>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/10">
              <div>
                <div className="text-[10px] text-white/40 uppercase tracking-widest">Total</div>
                <div className="font-display text-xl text-white">₹{total}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-white/40 uppercase tracking-widest">Pickup in</div>
                <div className="font-display text-xl text-emerald-300">~{pickupMin} min</div>
              </div>
            </div>

            <button
              onClick={() => setStep('confirmed')}
              disabled={selected.length === 0}
              className="mt-4 w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-400 to-emerald-500 text-slate-950 font-display tracking-[0.2em] disabled:opacity-40 active:scale-[0.98] transition"
            >
              CONFIRM PRE-ORDER
            </button>
            <p className="mt-2 text-[11px] text-white/40 text-center">
              Avoid peak crowd zones — we'll ping you when it's ready.
            </p>
          </>
        ) : (
          <div className="py-2 text-center">
            <div className="mx-auto grid place-items-center w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/40 animate-[popIn_.4s_cubic-bezier(.22,.68,.35,1.2)]">
              <Check className="w-8 h-8" />
            </div>
            <div className="mt-4 font-display text-2xl tracking-wide text-white">Order confirmed</div>
            <div className="mt-1 text-sm text-white/60">
              {selected.length} item{selected.length > 1 ? 's' : ''} · ₹{total}
            </div>
            <div className="mt-5 p-4 rounded-2xl bg-white/5 border border-white/10">
              <div className="text-[10px] tracking-[0.2em] text-white/40">PICKUP IN</div>
              <div className="font-display text-5xl text-emerald-300 tracking-wide mt-1">
                ~{pickupMin}<span className="text-xl text-white/40">min</span>
              </div>
              <div className="mt-2 text-[11px] text-white/50">
                {stall.name} · {stall.block}
              </div>
              {/* fake QR */}
              <div className="mt-4 mx-auto grid place-items-center w-24 h-24 rounded-xl bg-white p-2">
                <div className="w-full h-full grid grid-cols-8 grid-rows-8 gap-0.5">
                  {Array.from({ length: 64 }).map((_, i) => (
                    <div key={i}
                      className={(i * 37 + 11) % 3 === 0 ? 'bg-slate-950' : 'bg-white'} />
                  ))}
                </div>
              </div>
              <div className="mt-2 font-mono text-[11px] text-white/50">
                ORDER #IPL{Math.floor(Math.random() * 9000 + 1000)}
              </div>
            </div>
            <button
              onClick={onClose}
              className="mt-5 w-full py-3 rounded-2xl bg-white/10 text-white font-display tracking-[0.2em] hover:bg-white/15 transition">
              CLOSE
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Fonts & keyframes (injected once) ----------
function StyleBlock() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap');
      .font-display { font-family: 'Bebas Neue', system-ui, sans-serif; }
      .font-sans { font-family: 'Instrument Sans', system-ui, sans-serif; }
      .font-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }

      @keyframes pulseRing {
        0%   { transform: scale(0.6); opacity: 0.9; }
        100% { transform: scale(1.9); opacity: 0;   }
      }
      @keyframes dashFlow {
        to { stroke-dashoffset: -16; }
      }
      @keyframes slideDown {
        from { transform: translate(-50%, -16px); opacity: 0; }
        to   { transform: translate(-50%, 0);     opacity: 1; }
      }
      @keyframes slideUp {
        from { transform: translateY(40px); opacity: 0; }
        to   { transform: translateY(0);    opacity: 1; }
      }
      @keyframes slideRight {
        0%   { transform: translateX(-100%); }
        100% { transform: translateX(200%);  }
      }
      @keyframes fadeSlide {
        from { transform: translateY(8px); opacity: 0; }
        to   { transform: translateY(0);   opacity: 1; }
      }
      @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
      @keyframes popIn  {
        0%   { transform: scale(0.5); opacity: 0; }
        60%  { transform: scale(1.1); opacity: 1; }
        100% { transform: scale(1);   opacity: 1; }
      }
      /* SVG pulse rings need CSS transform-origin set on the circle */
      svg circle { transform-origin: center; transform-box: fill-box; }

      /* page grain */
      .grain::before{
        content:""; position:fixed; inset:0; pointer-events:none; z-index:1; opacity:.05;
        background-image:
          radial-gradient(rgba(255,255,255,.8) 1px, transparent 1px),
          radial-gradient(rgba(255,255,255,.6) 1px, transparent 1px);
        background-size: 3px 3px, 7px 7px;
        background-position: 0 0, 1px 2px;
        mix-blend-mode: overlay;
      }
    `}</style>
  );
}

// ---------- Main App ----------
export default function SmartStadiumApp() {
  // Stalls start with baseWait as their live waitTime
  const [stalls, setStalls] = useState(
    STALLS_SEED.map(s => ({ ...s, waitTime: s.baseWait }))
  );
  const [inningsBreak, setInningsBreak] = useState(false);
  const [toast, setToast] = useState(null);
  const [orderStall, setOrderStall] = useState(null);

  // Gentle ambient drift — makes the app feel live even at rest
  useEffect(() => {
    if (inningsBreak) return;
    const id = setInterval(() => {
      setStalls(prev => prev.map(s => {
        const drift = (Math.random() - 0.5) * 1.2; // ±0.6 min
        return { ...s, waitTime: Math.max(1, Math.round(s.baseWait + drift)) };
      }));
    }, 3500);
    return () => clearInterval(id);
  }, [inningsBreak]);

  // Best option (lowest score) — recomputed every state change
  const recommended = useMemo(() => {
    return [...stalls]
      .map(s => ({ ...s, score: scoreOf(s) }))
      .sort((a, b) => a.score - b.score)[0];
  }, [stalls]);

  // Sort list by score so the best always floats up
  const sortedStalls = useMemo(() => {
    return [...stalls].sort((a, b) => scoreOf(a) - scoreOf(b));
  }, [stalls]);

  const showToast = (t) => {
    setToast(t);
    setTimeout(() => setToast(null), 3600);
  };

  const handleSimulate = () => {
    setInningsBreak(true);
    showToast({
      kind: 'alert',
      title: 'Innings Break — Crowd Surge',
      message: 'Fans moving to concessions. Re-routing in real time…',
    });

    // Phase 1: spike all stalls using their surgeWait targets (animated counter)
    setStalls(prev => prev.map(s => ({ ...s, waitTime: s.surgeWait })));

    // Phase 2: after spike settles, smart recommendation toggles.
    // The algorithm naturally flips: previous "best" (Champions) now has
    // the highest surge; Kathi Rolls has the lowest surge growth.
    setTimeout(() => {
      showToast({
        kind: 'good',
        title: 'Better option available nearby',
        message: 'Kolkata Kathi Rolls — lower surge, 2 min walk.',
      });
    }, 1700);
  };

  const handleReset = () => {
    setInningsBreak(false);
    setStalls(STALLS_SEED.map(s => ({ ...s, waitTime: s.baseWait })));
    showToast({
      kind: 'good',
      title: 'Back to normal play',
      message: 'Queues returning to baseline.',
    });
  };

  return (
    <div className="grain min-h-screen w-full font-sans text-white bg-slate-950 relative overflow-hidden">
      <StyleBlock />

      {/* Ambient background glows */}
      <div className="pointer-events-none absolute -top-40 -left-20 w-96 h-96 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -right-20 w-96 h-96 rounded-full bg-amber-500/10 blur-3xl" />

      {/* Phone-shaped column */}
      <div className="relative z-10 mx-auto max-w-md min-h-screen flex flex-col">
        <MatchTicker inningsBreak={inningsBreak} />

        {/* Live status strip */}
        <div className="px-4 pt-3 flex items-center justify-between">
          <div>
            <div className="font-display tracking-[0.2em] text-[10px] text-white/50">
              {inningsBreak ? 'STRATEGIC TIMEOUT' : 'IN PLAY'}
            </div>
            <div className="font-display text-2xl tracking-wide text-white leading-tight">
              {inningsBreak ? 'Beat the rush.' : 'Enjoy the match.'}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <MiniStat
              icon={<Users className="w-3 h-3" />}
              label="Crowd"
              value={inningsBreak ? 'Surging' : 'Steady'}
              trend={inningsBreak ? 'up' : 'flat'}
            />
          </div>
        </div>

        <StadiumMap
          stalls={stalls}
          recommended={recommended}
          inningsBreak={inningsBreak}
        />

        <RecommendationBanner
          key={recommended?.id}
          stall={recommended}
          onOrder={setOrderStall}
        />

        {/* Queue list */}
        <div className="px-4 mt-4">
          <div className="flex items-center justify-between mb-2.5 px-1">
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-white/50" />
              <span className="font-display tracking-[0.22em] text-[10px] text-white/60">
                LIVE QUEUES · SORTED BY SCORE
              </span>
            </div>
            <span className="font-mono text-[10px] text-white/40">
              w + ½·d
            </span>
          </div>
          <div className="space-y-2">
            {sortedStalls.map((s) => (
              <StallCard
                key={s.id}
                stall={s}
                isRecommended={recommended && recommended.id === s.id}
                onOrder={setOrderStall}
              />
            ))}
          </div>
        </div>

        <div className="flex-1 min-h-6" />
        <SimulateBar
          inningsBreak={inningsBreak}
          onSimulate={handleSimulate}
          onReset={handleReset}
        />
      </div>

      <Toast toast={toast} />

      {orderStall && (
        <PreOrderModal
          stall={orderStall}
          onClose={() => setOrderStall(null)}
        />
      )}
    </div>
  );
}

function MiniStat({ icon, label, value, trend }) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Activity;
  const trendColor = trend === 'up' ? 'text-rose-300' : trend === 'down' ? 'text-emerald-300' : 'text-white/40';
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10">
      <div className="text-white/50">{icon}</div>
      <div>
        <div className="text-[9px] text-white/40 tracking-widest uppercase">{label}</div>
        <div className="flex items-center gap-1">
          <span className="font-display text-sm tracking-wide text-white leading-none">{value}</span>
          <TrendIcon className={cx('w-3 h-3', trendColor)} />
        </div>
      </div>
    </div>
  );
}
