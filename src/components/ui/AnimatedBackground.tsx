import { motion } from 'motion/react';
import { Activity, BarChart3, Binary, LineChart, TrendingUp, Zap } from 'lucide-react';

const GRID_MASK =
  'radial-gradient(ellipse at center, black 40%, transparent 90%)';

const iconFloat = (i: number) => ({
  y: [0, -18, 0],
  rotate: [0, 360],
  opacity: [0.08, 0.18, 0.08],
  transition: {
    duration: 18 + i * 3,
    repeat: Infinity,
    ease: 'linear' as const,
    times: [0, 0.5, 1],
  },
});

const ICONS = [
  { Icon: Zap,         top: '8%',  left: '6%',  size: 140 },
  { Icon: TrendingUp,  top: '22%', right: '9%', size: 150 },
  { Icon: BarChart3,   bottom: '14%', left: '11%', size: 130 },
  { Icon: Activity,    bottom: '8%', right: '14%', size: 140 },
  { Icon: LineChart,   top: '55%', left: '46%', size: 110 },
  { Icon: Binary,      top: '40%', right: '34%', size: 100 },
];

export function AnimatedBackground() {
  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 0 }}
      aria-hidden
    >
      {/* Base surface — keeps the neobrutalist near-black */}
      <div className="absolute inset-0 bg-[#0a0a0a]" />

      {/* Breathing accent blobs (yellow + cyan, low opacity) */}
      <motion.div
        className="absolute w-[520px] h-[520px] rounded-full"
        style={{
          background: '#f5f500',
          filter: 'blur(120px)',
          top: '-10%',
          left: '-8%',
        }}
        animate={{
          y: [0, 40, 0],
          opacity: [0.12, 0.22, 0.12],
        }}
        transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute w-[620px] h-[620px] rounded-full"
        style={{
          background: '#00e5ff',
          filter: 'blur(140px)',
          bottom: '-15%',
          right: '-10%',
        }}
        animate={{
          y: [0, -50, 0],
          opacity: [0.10, 0.20, 0.10],
        }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Technical grid overlay — 50px cells */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px), ' +
            'linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: '50px 50px',
          maskImage: GRID_MASK,
          WebkitMaskImage: GRID_MASK,
        }}
      />

      {/* Scanline — echoes the existing terminal aesthetic */}
      <motion.div
        className="absolute left-0 right-0 h-[140px]"
        style={{
          background:
            'linear-gradient(to bottom, transparent, rgba(245,245,0,0.04), transparent)',
        }}
        animate={{ top: ['-20%', '120%'] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'linear' }}
      />

      {/* Floating brutalist icons */}
      {ICONS.map(({ Icon, size, ...pos }, i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{ ...pos, color: i % 2 === 0 ? '#f5f500' : '#00e5ff' }}
          animate={iconFloat(i)}
        >
          <Icon size={size} strokeWidth={1} />
        </motion.div>
      ))}

      {/* Vignette to sharpen the foreground card */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 30%, rgba(10,10,10,0.75) 85%)',
        }}
      />
    </div>
  );
}
