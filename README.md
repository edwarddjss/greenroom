# greenroom

Greenroom is a self-hosted Windows desktop app that streams Spotify desktop audio into a Discord voice channel.

[Download Greenroom](https://github.com/edwarddjss/greenroom/releases/latest/download/greenroom-Setup-x64.exe) · [Website](https://edwarddjss.github.io/greenroom/) · [Report an issue](https://github.com/edwarddjss/greenroom/issues)

## What It Does

- Streams the audio playing in Spotify Desktop directly into Discord voice.
- Lets Discord members link their own Spotify Premium accounts.
- Accepts slash commands, Spotify links, playlists, and plain-language requests.
- Shows the current song as the Discord bot activity.
- Runs credentials, account tokens, audio capture, and command routing locally.
- Includes guided Windows onboarding, automatic updates, and privacy-safe support reports.

## Requirements

- Windows 10 or Windows 11, 64-bit
- Spotify Premium
- A Discord bot application
- A Spotify developer application

The desktop onboarding flow installs or guides the required audio components and walks through Discord and Spotify setup.

## Commands

| Command | Action |
| --- | --- |
| `/login` | Link a Spotify Premium account |
| `/play` | Join the current voice channel and start playback |
| `/queue` | Queue a song, playlist, or Spotify link |
| `/clearqueue` | Clear the pending Spotify queue |
| `/stop` | Stop streaming and pause Spotify |
| `/effect` | Apply live audio effects |

Greenroom also supports natural-language requests by mentioning the bot, such as `@greenroom play hold me down by borne`.

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

Run the desktop app in development:

```bash
pnpm --filter @greenroom/desktop dev
```

The repository is organized as a pnpm workspace:

```text
apps/desktop/       Electron desktop application
engine/             Discord, Spotify, voice, audio, and command engine
packages/shared/    Shared types, environment helpers, and IPC contracts
docs/               GitHub Pages website
```

## Privacy

Greenroom stores credentials locally in its encrypted desktop vault. Support reports exclude Discord tokens, Spotify secrets, and linked-account tokens.

## License

MIT
