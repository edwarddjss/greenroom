import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { Vibrant } from 'node-vibrant/browser';
import { Music, Radio } from 'lucide-react';
import type { NowPlaying as NowPlayingData } from '@greenroom/shared';
import { MusicVisualizer } from './MusicVisualizer';

interface NowPlayingProps {
  nowPlaying?: NowPlayingData | null | undefined;
  guildName?: string | undefined;
  channelName?: string | undefined;
  levelRef?: MutableRefObject<number> | undefined;
}

const DEFAULT_ACCENT = '#1FA877';

/**
 * Streaming hero. Shows the host's real album art (via the existing Spotify login —
 * no new keys), themes its glow + the visualizer to the cover's dominant colour,
 * and runs a progress bar interpolated locally between the engine's 15s polls.
 */
export function NowPlaying({ nowPlaying, guildName, channelName, levelRef }: NowPlayingProps): JSX.Element {
  const accent = useAlbumColor(nowPlaying?.albumArtUrl);
  const where = channelName ? `#${channelName}` : 'your voice channel';
  const track = nowPlaying?.title ? nowPlaying : null;

  return (
    <section
      className="relative overflow-hidden rounded-2xl border bg-surface p-5 shadow-card shadow-highlight transition-colors duration-700"
      style={{ borderColor: `${accent}33` }}
    >
      {/* Album-tinted glow wash behind the content. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-70 transition-[background] duration-700"
        style={{ background: `radial-gradient(120% 140% at 12% 0%, ${accent}2e, transparent 60%)` }}
      />
      {/* Visualizer as living art along the bottom edge. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 opacity-90">
        <MusicVisualizer levelRef={levelRef} active bars={72} color={accent} />
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/30 to-transparent" />
      </div>

      <div className="relative flex items-center gap-4">
        {track?.albumArtUrl ? (
          <img
            src={track.albumArtUrl}
            alt=""
            className="h-20 w-20 shrink-0 rounded-xl object-cover shadow-raised ring-1 ring-white/10"
            style={{ boxShadow: `0 12px 32px -8px ${accent}66` }}
          />
        ) : (
          <span
            className="relative grid h-20 w-20 shrink-0 place-items-center rounded-xl border bg-black/30"
            style={{ borderColor: `${accent}55` }}
          >
            <Music size={26} strokeWidth={2} style={{ color: accent }} aria-hidden="true" />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: accent }}>
            <Radio size={13} strokeWidth={2.4} aria-hidden="true" />
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full" style={{ backgroundColor: accent }} />
            Live · {where}
          </div>
          {track ? (
            <>
              <h2 className="mt-1 truncate text-lg font-semibold tracking-tight">{track.title}</h2>
              <p className="truncate text-[13px] text-muted">{track.artist}</p>
              <ProgressBar nowPlaying={track} accent={accent} />
            </>
          ) : (
            <>
              <h2 className="mt-1 truncate text-lg font-semibold tracking-tight">Streaming to {where}</h2>
              <p className="truncate text-[13px] text-muted">{guildName ? `in ${guildName}` : 'Waiting for Spotify to start a track…'}</p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/** Local progress interpolation: re-anchors on each engine poll, advances smoothly between them. */
function ProgressBar({ nowPlaying, accent }: { nowPlaying: NowPlayingData; accent: string }): JSX.Element | null {
  const [now, setNow] = useState(() => Date.now());
  const { progressMs, durationMs, isPlaying, sampledAt } = nowPlaying;

  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [isPlaying]);

  if (progressMs === undefined || !durationMs) return null;
  const elapsed = progressMs + (isPlaying ? now - sampledAt : 0);
  const pos = Math.min(durationMs, Math.max(0, elapsed));
  const pct = (pos / durationMs) * 100;

  return (
    <div className="mt-2.5 max-w-md">
      <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full transition-[width] duration-500 ease-linear" style={{ width: `${pct}%`, backgroundColor: accent }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted">
        <span>{formatTime(pos)}</span>
        <span>{formatTime(durationMs)}</span>
      </div>
    </div>
  );
}

function formatTime(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Extracts the cover's dominant colour for theming; falls back to emerald on any error (e.g. CORS). */
function useAlbumColor(artUrl?: string): string {
  const [color, setColor] = useState(DEFAULT_ACCENT);
  const reqId = useRef(0);

  useEffect(() => {
    if (!artUrl) {
      setColor(DEFAULT_ACCENT);
      return;
    }
    const id = ++reqId.current;
    Vibrant.from(artUrl)
      .getPalette()
      .then((palette) => {
        if (id !== reqId.current) return; // a newer track superseded this one
        const swatch = palette.Vibrant ?? palette.LightVibrant ?? palette.Muted;
        if (swatch) setColor(swatch.hex);
      })
      .catch(() => setColor(DEFAULT_ACCENT));
  }, [artUrl]);

  return color;
}
