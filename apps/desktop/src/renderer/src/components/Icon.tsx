import type { FC, SVGProps } from 'react';
// Streamline Plump (free, CC BY 4.0) via unplugin-icons - compiled to components at
// build time, so it's offline and tree-shaken. Solid weight = the chunky "plump" look.
// Monochrome (currentColor), so icons tint to whatever text color the parent sets.
import Play from '~icons/streamline-plump/button-play-circle-solid';
import Power from '~icons/streamline-plump/button-power-1-solid';
import Cog from '~icons/streamline-plump/cog-solid';
import Login from '~icons/streamline-plump/login-1-solid';
import Playlist from '~icons/streamline-plump/play-list-1-solid';
import Broom from '~icons/streamline-plump/clean-broom-wipe-solid';
import Slider from '~icons/streamline-plump/horizontal-slider-square-solid';
import Robot from '~icons/streamline-plump/ai-science-robot-solid';
import ChatHelp from '~icons/streamline-plump/help-chat-1-solid';
import MusicNote from '~icons/streamline-plump/music-note-2-solid';
import Signal from '~icons/streamline-plump/wave-signal-square-solid';
import Speaker from '~icons/streamline-plump/speaker-2-solid';
import Check from '~icons/streamline-plump/check-thick-solid';
import Warning from '~icons/streamline-plump/warning-diamond-solid';
import Alert from '~icons/streamline-plump/notification-alert-solid';
import LinkChain from '~icons/streamline-plump/link-chain-solid';
import Support from '~icons/streamline-plump/customer-support-3-solid';
import Clipboard from '~icons/streamline-plump/empty-clipboard-solid';
import Flash from '~icons/streamline-plump/flash-1-solid';

type IconComponent = FC<SVGProps<SVGSVGElement>>;

/** Semantic name -> Plump glyph. Keys are kept stable so call sites don't churn on swaps. */
const ICONS = {
  play: Play,
  rocket: Play, // "Start bot" reads as play/launch
  stop: Power,
  gear: Cog,
  key: Login,
  notes: Playlist,
  broom: Broom,
  knobs: Slider,
  wave: Robot, // "Invite bot"
  chat: ChatHelp,
  note: MusicNote,
  radio: Signal, // "Live" broadcast
  headphone: Speaker,
  check: Check,
  warning: Warning,
  stopsign: Alert, // error / bad
  link: LinkChain,
  lifebuoy: Support,
  clipboard: Clipboard,
  sparkles: Flash,
} satisfies Record<string, IconComponent>;

export type IconName = keyof typeof ICONS;

/** Monochrome Plump glyph at a fixed pixel box; inherits `currentColor`. */
export function Icon({
  name,
  size = 16,
  className = '',
}: {
  name: IconName;
  size?: number;
  className?: string;
}): JSX.Element {
  const Glyph = ICONS[name];
  return <Glyph width={size} height={size} className={`shrink-0 ${className}`} aria-hidden />;
}
