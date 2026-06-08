// Icon system: vendored OpenMoji color SVGs (openmoji.org, CC BY-SA 4.0).
// See src/assets/emoji/CREDITS.md. Bundled (not CDN) so the app stays offline.
const modules = import.meta.glob('../assets/emoji/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const byName: Record<string, string> = {};
for (const [path, url] of Object.entries(modules)) {
  const name = path.split('/').pop()!.replace('.svg', '');
  byName[name] = url;
}

export type EmojiName =
  | 'key'
  | 'play'
  | 'notes'
  | 'broom'
  | 'stop'
  | 'knobs'
  | 'gear'
  | 'wave'
  | 'chat'
  | 'note'
  | 'radio'
  | 'headphone'
  | 'check'
  | 'warning'
  | 'stopsign'
  | 'link'
  | 'lifebuoy'
  | 'clipboard'
  | 'rocket'
  | 'sparkles';

/** Render a vendored OpenMoji glyph at a fixed pixel box. Decorative by default. */
export function Emoji({
  name,
  size = 16,
  className = '',
  title,
}: {
  name: EmojiName;
  size?: number;
  className?: string;
  title?: string;
}): JSX.Element {
  return (
    <img
      src={byName[name]}
      width={size}
      height={size}
      className={`inline-block select-none ${className}`}
      style={{ width: size, height: size }}
      alt={title ?? ''}
      aria-hidden={title ? undefined : true}
      draggable={false}
    />
  );
}
