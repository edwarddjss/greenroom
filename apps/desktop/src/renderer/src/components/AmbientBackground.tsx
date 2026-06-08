/** Subtle frame tint behind the app shell. */
export function AmbientBackground({ live = false }: { live?: boolean }): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 transition-opacity duration-700"
      style={{ opacity: live ? 1 : 0.72 }}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(135deg, rgba(31,168,119,0.10), transparent 34%), linear-gradient(225deg, rgba(88,101,242,0.055), transparent 42%), linear-gradient(180deg, rgba(255,255,255,0.018), transparent 28%)',
        }}
      />
    </div>
  );
}
