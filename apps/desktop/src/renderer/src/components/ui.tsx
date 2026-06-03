import { useEffect, useRef } from 'react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

type CardVariant = 'panel' | 'inset';
const cardVariants: Record<CardVariant, string> = {
  panel: 'bg-surface border-line shadow-card',
  inset: 'bg-sunken border-line/60',
};

export function Card({
  children,
  className = '',
  variant = 'panel',
}: {
  children: ReactNode;
  className?: string;
  variant?: CardVariant;
}): JSX.Element {
  return <div className={`rounded-xl border p-5 ${cardVariants[variant]} ${className}`}>{children}</div>;
}

type Variant = 'primary' | 'ghost' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent-hover disabled:bg-white/10 disabled:text-white/35',
  ghost: 'bg-white/5 text-text hover:bg-white/[0.09] disabled:bg-white/[0.02] disabled:text-white/30',
  danger: 'bg-danger text-white hover:brightness-110 disabled:bg-danger/25 disabled:text-white/40',
};

type Size = 'sm' | 'md';
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-[13px] gap-2',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }): JSX.Element {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed ${sizes[size]} ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

type Tone = 'ok' | 'warn' | 'bad' | 'idle';
const tones: Record<Tone, string> = {
  ok: 'bg-accent',
  warn: 'bg-warn',
  bad: 'bg-danger',
  idle: 'bg-muted',
};
const toneHalo: Record<Tone, string> = {
  ok: 'shadow-[0_0_0_3px_rgba(31,168,119,0.18)]',
  warn: 'shadow-[0_0_0_3px_rgba(250,166,26,0.18)]',
  bad: 'shadow-[0_0_0_3px_rgba(237,66,69,0.18)]',
  idle: 'shadow-none',
};

export function StatusDot({ tone }: { tone: Tone }): JSX.Element {
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${tones[tone]} ${toneHalo[tone]}`} />;
}

const pillTint: Record<Tone, string> = {
  ok: 'bg-accent/10 border-accent/20',
  warn: 'bg-warn/10 border-warn/20',
  bad: 'bg-danger/10 border-danger/25',
  idle: 'bg-white/[0.04] border-line',
};

export function Pill({ tone, label, detail }: { tone: Tone; label: string; detail?: string | undefined }): JSX.Element {
  return (
    <div className={`flex min-w-0 items-center gap-2.5 rounded-lg border px-3 py-2 ${pillTint[tone]}`}>
      <StatusDot tone={tone} />
      <div className="min-w-0 leading-tight">
        <div className="truncate text-[13px] font-medium">{label}</div>
        {detail ? <div className="truncate text-xs text-muted">{detail}</div> : null}
      </div>
    </div>
  );
}

export function ProgressBar({ value }: { value: number }): JSX.Element {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

/** Consistent section heading: label + optional detail + optional leading icon and right-aligned action. */
export function SectionHeader({
  label,
  detail,
  icon,
  action,
}: {
  label: string;
  detail?: string;
  icon?: ReactNode;
  action?: ReactNode;
}): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-2">
        {icon ? <span className="mt-px text-muted">{icon}</span> : null}
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold tracking-tight text-text">{label}</h2>
          {detail ? <p className="mt-0.5 text-xs text-muted">{detail}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Code({ children, className = '' }: { children: ReactNode; className?: string }): JSX.Element {
  return (
    <code className={`rounded-md border border-line bg-sunken px-2 py-1 font-mono text-xs text-text ${className}`}>
      {children}
    </code>
  );
}

/** Labeled text input with a real focus ring and proper label association. */
export function Field({
  label,
  mono = false,
  className = '',
  id,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; mono?: boolean }): JSX.Element {
  const fieldId = id ?? `field-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <label htmlFor={fieldId} className="block space-y-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      <input
        id={fieldId}
        className={`w-full rounded-lg border border-line bg-sunken px-3 py-2 text-[13px] text-text placeholder:text-muted/70 transition-colors focus-visible:border-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 ${mono ? 'font-mono' : ''} ${className}`}
        {...rest}
      />
    </label>
  );
}

type ModalSize = 'sm' | 'md' | 'lg';
const modalSizes: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-3xl',
  lg: 'max-w-4xl',
};

/** Single modal shell: backdrop, centered panel, Esc + click-outside close, entrance motion. */
export function Modal({
  onClose,
  children,
  size = 'md',
  labelledBy,
  className = '',
}: {
  onClose: () => void;
  children: ReactNode;
  size?: ModalSize;
  labelledBy?: string;
  className?: string;
}): JSX.Element {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`flex max-h-[calc(100vh-3rem)] w-full ${modalSizes[size]} animate-pop-in flex-col overflow-hidden rounded-2xl border border-line-strong bg-raised shadow-raised focus:outline-none ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
