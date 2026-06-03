import { Minus, Square, X } from 'lucide-react';
import { api } from '../lib/api';

export function TitleBar(): JSX.Element {
  const controlBaseClass =
    'flex h-11 w-12 items-center justify-center text-muted transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60';
  const neutralControlClass = `${controlBaseClass} hover:bg-white/[0.08] hover:text-text`;
  const closeControlClass = `${controlBaseClass} hover:bg-danger hover:text-white`;

  return (
    <div className="app-drag flex h-11 select-none items-center justify-between border-b border-line bg-bg/95 pl-4">
      <div className="flex h-full items-center gap-2.5">
        <div
          className="grid h-[18px] w-[18px] place-items-center rounded-[6px] border border-accent/30 bg-accent/15"
          aria-hidden="true"
        >
          <span className="h-[5px] w-[5px] rounded-full bg-accent" />
        </div>
        <span className="text-sm font-semibold tracking-tight text-text/90">greenroom</span>
      </div>
      <div className="app-no-drag flex h-full border-l border-line">
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
  );
}
