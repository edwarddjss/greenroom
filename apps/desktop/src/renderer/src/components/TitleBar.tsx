import { Minus, RotateCw, Square, X } from 'lucide-react';
import { api } from '../lib/api';
import { useUpdater } from '../lib/useUpdater';

export function TitleBar(): JSX.Element {
  const update = useUpdater();
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
        {update.phase === 'downloaded' && (
          <button
            className="mr-2 inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent/15 px-3 text-xs font-medium text-accent transition-colors hover:bg-accent/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
            onClick={() => void api.updaterInstall()}
          >
            <RotateCw size={14} strokeWidth={2.1} aria-hidden="true" />
            Update ready · Restart
          </button>
        )}
        <div className="flex h-full border-l border-line">
          <button className={neutralControlClass} aria-label="Minimize" title="Minimize" onClick={() => void api.windowMinimize()}>
            <Minus size={16} strokeWidth={2} aria-hidden="true" />
          </button>
          <button className={neutralControlClass} aria-label="Maximize" title="Maximize" onClick={() => void api.windowMaximize()}>
            <Square size={13} strokeWidth={2} aria-hidden="true" />
          </button>
          <button
            className={closeControlClass}
            aria-label="Close"
            title="Close"
            onClick={() => void api.windowClose()}
          >
            <X size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
