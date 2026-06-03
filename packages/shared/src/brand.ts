/** Single source of truth for product branding, shared by desktop + landing. */
export const BRAND = {
  name: 'greenroom',
  domain: 'greenroom',
  tagline: 'Stream your Spotify into any Discord voice channel.',
  description: 'The self-hosted Spotify-to-Discord music bot that runs on your own Windows PC.',
  github: 'https://github.com/edwarddjss/spotify-discord-bot',
  colors: {
    spotify: '#1DB954',
    discord: '#5865F2',
    bg: '#0B0B0F',
    surface: '#15151C',
    text: '#F4F4F6',
    muted: '#9A9AA8',
    accent: '#1DB954',
    danger: '#ED4245',
    warn: '#FAA61A',
  },
} as const;

export type Brand = typeof BRAND;
