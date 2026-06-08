import { api } from '../lib/api';

// Minimal geometric window-control glyphs — kept deliberately non-emoji for clarity.
const glyph = { strokeWidth: 1.2, fill: 'none', stroke: 'currentColor' } as const;

export function TitleBar(): JSX.Element {
  const controlBaseClass =
    'flex h-11 w-12 items-center justify-center text-muted transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60';
  const neutralControlClass = `${controlBaseClass} hover:bg-white/[0.08] hover:text-text`;
  const closeControlClass = `${controlBaseClass} hover:bg-danger hover:text-white`;

  return (
    <div className="app-drag flex h-11 select-none items-center justify-between border-b border-line bg-bg/95 pl-4">
      <div className="flex h-full items-center gap-2.5">
        <img src={`${import.meta.env.BASE_URL}brand/greenroom.png`} className="h-5 w-5 shrink-0 object-contain" alt="" />
        <span className="text-sm font-semibold tracking-tight text-text/90">greenroom</span>
      </div>
      <div className="app-no-drag flex h-full items-center">
        <div className="flex h-full border-l border-line">
          <button className={neutralControlClass} aria-label="Minimize" title="Minimize" onClick={() => void api.windowMinimize()}>
            <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
              <line x1="1.5" y1="5.5" x2="9.5" y2="5.5" {...glyph} />
            </svg>
          </button>
          <button className={neutralControlClass} aria-label="Maximize" title="Maximize" onClick={() => void api.windowMaximize()}>
            <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
              <rect x="1.5" y="1.5" width="8" height="8" rx="1" {...glyph} />
            </svg>
          </button>
          <button
            className={closeControlClass}
            aria-label="Close"
            title="Close"
            onClick={() => void api.windowClose()}
          >
            <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
              <line x1="1.8" y1="1.8" x2="9.2" y2="9.2" {...glyph} />
              <line x1="9.2" y1="1.8" x2="1.8" y2="9.2" {...glyph} />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
