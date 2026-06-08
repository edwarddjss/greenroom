import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';

interface MusicVisualizerProps {
  /** Live capture amplitude (0–1). When omitted, the bars idle on organic motion. */
  level?: number | undefined;
  /** Ref sampled every frame (preferred over `level` — no re-renders). */
  levelRef?: MutableRefObject<number> | undefined;
  /** Streaming vs. ambient idle. Idle is calmer and dimmer. */
  active?: boolean;
  /** Number of equalizer bars. */
  bars?: number;
  /** Optional album-derived hex tint; defaults to the emerald accent. */
  color?: string | undefined;
  className?: string;
}

const ACCENT = { r: 0x27, g: 0xc0, b: 0x89 }; // accent-hover
const ACCENT_DEEP = { r: 0x1f, g: 0xa8, b: 0x77 }; // accent

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * Canvas equalizer. Bars are driven by layered sines (organic, music-like motion)
 * and scaled by the real `level` signal when present. No randomness — random
 * jitter is the tell of a fake visualizer; coherent waves read as audio.
 */
export function MusicVisualizer({
  level,
  levelRef,
  active = false,
  bars = 48,
  color,
  className = '',
}: MusicVisualizerProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fallbackLevel = useRef(level ?? 0);
  fallbackLevel.current = level ?? 0;
  const readLevel = (): number => levelRef?.current ?? fallbackLevel.current;
  const tintTop = (color ? hexToRgb(color) : null) ?? ACCENT;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width = 0;
    let height = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = (): void => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Smoothed bar heights so motion eases rather than snaps.
    const heights = new Float32Array(bars);
    let raf = 0;
    let start = performance.now();

    const baseIdle = active ? 0.18 : 0.1;
    const reach = active ? 0.82 : 0.34;

    const frame = (now: number): void => {
      const t = (now - start) / 1000;
      ctx.clearRect(0, 0, width, height);

      const gap = Math.max(2, width / bars / 4);
      const barWidth = (width - gap * (bars - 1)) / bars;
      const lvl = readLevel();
      // Real level dominates when present; otherwise a gentle breathing envelope.
      const envelope = lvl > 0 ? lvl : reduceMotion ? 0.4 : 0.4 + Math.sin(t * 0.9) * 0.18;

      for (let i = 0; i < bars; i++) {
        // Two detuned sines + a centred emphasis hump = coherent spectrum shape.
        const phase = i * 0.5;
        const wave = reduceMotion
          ? 0.5
          : (Math.sin(t * 2.1 + phase) * 0.5 + 0.5) * 0.6 + (Math.sin(t * 3.7 - phase * 0.7) * 0.5 + 0.5) * 0.4;
        const centerBias = 1 - Math.abs(i / (bars - 1) - 0.5) * 1.1; // taller in the middle
        const target = baseIdle + wave * reach * envelope * Math.max(0.25, centerBias);

        // Ease toward target; falls slower than it rises, like a real meter.
        const h = heights[i] ?? 0;
        const k = target > h ? 0.35 : 0.12;
        heights[i] = h + (target - h) * (reduceMotion ? 1 : k);

        const barH = Math.max(2, Math.min(1, heights[i] ?? 0) * height);
        const x = i * (barWidth + gap);
        const y = height - barH;

        const mix = Math.min(1, heights[i] ?? 0);
        const r = Math.round(ACCENT_DEEP.r + (tintTop.r - ACCENT_DEEP.r) * mix);
        const g = Math.round(ACCENT_DEEP.g + (tintTop.g - ACCENT_DEEP.g) * mix);
        const b = Math.round(ACCENT_DEEP.b + (tintTop.b - ACCENT_DEEP.b) * mix);
        const alpha = active ? 0.55 + mix * 0.4 : 0.16 + mix * 0.22;

        const grad = ctx.createLinearGradient(0, y, 0, height);
        grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
        grad.addColorStop(1, `rgba(${ACCENT_DEEP.r},${ACCENT_DEEP.g},${ACCENT_DEEP.b},${alpha * 0.25})`);
        ctx.fillStyle = grad;

        const radius = Math.min(barWidth / 2, 3);
        roundedTop(ctx, x, y, barWidth, barH, radius);
        ctx.fill();
      }

      if (!reduceMotion) raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    if (reduceMotion) {
      // Single static paint so the bars still read as an equalizer.
      start = performance.now();
      frame(start);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, bars, color]);

  return <canvas ref={canvasRef} className={`h-full w-full ${className}`} aria-hidden="true" />;
}

function roundedTop(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, h);
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
}
