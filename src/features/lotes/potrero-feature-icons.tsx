// Íconos 3D de infraestructura (ilustraciones con volumen + sombra al piso).

export function MolinoIcon({ className }: { className?: string }) {
  const blades = Array.from({ length: 14 }, (_, i) => {
    const a = (i * (360 / 14) * Math.PI) / 180
    return [20 + Math.cos(a) * 8, 15 + Math.sin(a) * 8] as const
  })
  return (
    <svg viewBox="0 0 40 44" className={className}>
      <defs>
        <radialGradient id="ml-wheel" cx="42%" cy="38%" r="65%">
          <stop offset="0%" stopColor="#d7dde1" />
          <stop offset="100%" stopColor="#7d8a93" />
        </radialGradient>
        <linearGradient id="ml-tower" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#aab4bc" />
          <stop offset="100%" stopColor="#69757f" />
        </linearGradient>
      </defs>
      <ellipse cx="20" cy="41.5" rx="10.5" ry="2.3" fill="#0b1f17" opacity="0.18" />
      <path d="M15 41 L18.7 18 L21.3 18 L25 41 Z" fill="url(#ml-tower)" stroke="#56626c" strokeWidth="0.6" strokeLinejoin="round" />
      <path d="M16.2 34 H23.8 M17 27 H23 M17.8 21 H22.2" stroke="#56626c" strokeWidth="0.8" />
      <path d="M27.5 15 L37 12.5 L37 17.5 Z" fill="url(#ml-tower)" stroke="#56626c" strokeWidth="0.5" strokeLinejoin="round" />
      <circle cx="20" cy="15" r="8.5" fill="url(#ml-wheel)" stroke="#56626c" strokeWidth="0.8" />
      {blades.map(([x, y], i) => (
        <line key={i} x1="20" y1="15" x2={x.toFixed(1)} y2={y.toFixed(1)} stroke="#9aa6ae" strokeWidth="0.7" />
      ))}
      <circle cx="20" cy="15" r="2.2" fill="#44505a" />
    </svg>
  )
}

export function LagunaIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className}>
      <defs>
        <radialGradient id="lg-water" cx="42%" cy="34%" r="72%">
          <stop offset="0%" stopColor="#c4e9f6" />
          <stop offset="55%" stopColor="#56a8cc" />
          <stop offset="100%" stopColor="#1f6386" />
        </radialGradient>
      </defs>
      <ellipse cx="20" cy="30" rx="15" ry="3.6" fill="#0b1f17" opacity="0.13" />
      <ellipse cx="20" cy="21" rx="15.5" ry="9.5" fill="url(#lg-water)" stroke="#1d5d7a" strokeWidth="1" />
      <path d="M9 16.5c3-2 6-2 9 0" stroke="#e6f5fb" strokeWidth="1.1" fill="none" strokeLinecap="round" opacity="0.85" />
      <path d="M14 24c2.4-1.3 4.8-1.3 7.2 0" stroke="#e6f5fb" strokeWidth="0.9" fill="none" strokeLinecap="round" opacity="0.6" />
    </svg>
  )
}

export function TranqueraIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className}>
      <defs>
        <linearGradient id="tq-wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c89863" />
          <stop offset="100%" stopColor="#875631" />
        </linearGradient>
      </defs>
      <ellipse cx="20" cy="35" rx="14" ry="2.4" fill="#0b1f17" opacity="0.16" />
      <rect x="6" y="9" width="3.6" height="26" rx="1.6" fill="url(#tq-wood)" stroke="#6e451f" strokeWidth="0.4" />
      <rect x="30.4" y="9" width="3.6" height="26" rx="1.6" fill="url(#tq-wood)" stroke="#6e451f" strokeWidth="0.4" />
      <rect x="8" y="12.5" width="24" height="2.9" rx="1.4" fill="url(#tq-wood)" stroke="#6e451f" strokeWidth="0.3" />
      <rect x="8" y="19.5" width="24" height="2.9" rx="1.4" fill="url(#tq-wood)" stroke="#6e451f" strokeWidth="0.3" />
      <rect x="8" y="26.5" width="24" height="2.9" rx="1.4" fill="url(#tq-wood)" stroke="#6e451f" strokeWidth="0.3" />
      <rect x="18.6" y="10" width="2.8" height="22" rx="1.4" fill="url(#tq-wood)" stroke="#6e451f" strokeWidth="0.3" transform="rotate(38 20 21)" />
    </svg>
  )
}
