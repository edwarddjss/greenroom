import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }): JSX.Element {
  return <div className={`rounded-lg border border-white/5 bg-surface p-5 ${className}`}>{children}</div>;
}

type Variant = 'primary' | 'ghost' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'bg-spotify text-black hover:brightness-110',
  ghost: 'bg-white/5 text-white hover:bg-white/10',
  danger: 'bg-danger text-white hover:brightness-110',
};

export function Button({
  variant = 'primary',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }): JSX.Element {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/35 disabled:cursor-not-allowed disabled:opacity-40 ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

type Tone = 'ok' | 'warn' | 'bad' | 'idle';
const tones: Record<Tone, string> = {
  ok: 'bg-spotify',
  warn: 'bg-warn',
  bad: 'bg-danger',
  idle: 'bg-muted',
};

export function StatusDot({ tone }: { tone: Tone }): JSX.Element {
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${tones[tone]}`} />;
}

export function Pill({ tone, label, detail }: { tone: Tone; label: string; detail?: string | undefined }): JSX.Element {
  return (
    <div className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg border border-white/5 bg-white/5 px-3 py-2">
      <StatusDot tone={tone} />
      <div className="min-w-0 leading-tight">
        <div className="truncate text-sm font-medium">{label}</div>
        {detail ? <div className="truncate text-xs text-muted">{detail}</div> : null}
      </div>
    </div>
  );
}

export function ProgressBar({ value }: { value: number }): JSX.Element {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
      <div className="h-full bg-spotify transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}
