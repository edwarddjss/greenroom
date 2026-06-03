import { Minus, Square, X } from 'lucide-react';
import { api } from '../lib/api';

export function TitleBar(): JSX.Element {
  const controlBaseClass =
    'flex h-11 w-12 items-center justify-center text-white/55 transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/30';
  const neutralControlClass = `${controlBaseClass} hover:bg-white/[0.08] hover:text-white`;
  const closeControlClass = `${controlBaseClass} hover:bg-danger hover:text-white`;

  return (
    <div className="app-drag flex h-11 select-none items-center justify-between border-b border-white/[0.06] bg-[#09090d]/95 pl-4">
      <div className="flex h-full items-center gap-2.5">
        <div className="flex h-5 w-5 items-end gap-[2px]" aria-hidden="true">
          <span className="h-2 w-1 rounded-sm bg-spotify/70" />
          <span className="h-4 w-1 rounded-sm bg-spotify" />
          <span className="h-3 w-1 rounded-sm bg-spotify/80" />
        </div>
        <span className="text-[13px] font-semibold tracking-normal text-white/88">greenroom</span>
      </div>
      <div className="app-no-drag flex h-full border-l border-white/[0.04]">
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
