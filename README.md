# Spotify Discord Streaming Bot

A lightweight, self-hosted Discord bot that streams high-quality, real-time audio from your local Spotify Desktop client into a Discord voice channel. 

It routes audio through a virtual loopback device on your Windows host, allowing you to bypass standard API playback restrictions and stream premium high-bitrate audio with low latency.

---

## Features

- **Multi-User Control:** Multiple users can link their Spotify Premium accounts. The bot maps Discord IDs to individual Spotify Connect sessions, allowing separate control.
- **Low Latency:** Optimized audio capturing using raw PCM 16-bit stereo streaming at 48kHz, bypassing heavy resamplers to achieve sub-30ms capture lag.
- **Discord E2EE Voice Compliance:** Fully supports Discord's mandatory MLS voice encryption protocol (DAVE) using `@discordjs/voice` and `@snazzah/davey`.
- **Fuzzy Intent Router:** Mentions inside text channels are classified semantically (e.g. `@bot play uk garage`, `@bot queue the next track`, `@bot boost the bass`, `@bot stop`). No strict prefix or syntax required.
- **Seamless Live Effects:** Toggle DSP effects on the fly (Bass Boost, Nightcore Speed, Slowed). The engine hot-swaps active FFmpeg streams in the background with zero silent cuts.
- **Automatic Cleanup:** Bitrate is auto-maxed to the server's limit on join. The bot automatically disconnects and shuts down when left empty of human listeners for 45 seconds.
- **Simple Shortcuts:** Generates direct desktop shortcuts to launch and stop the bot with a double-click.

---

## Command & Interaction Reference

The bot supports **both** standard Discord Slash Commands and Natural Language AI mentions in any text channel.

### 1. Slash Commands (/)
Registered globally and accessible directly in Discord's native command picker:
- `/login` - Links your personal Spotify Premium account.
- `/play` - Connects to your current voice channel and starts streaming the loopback feed.
- `/queue` - Adds a song to the upcoming Spotify queue.
- `/stop` - Stops the loopback stream and pauses Spotify playback.
- `/effect` - Applies dynamic audio effects (Bass Boost, Nightcore Speed, Slowed).

### 2. Natural Language AI Mentions (@bot)
You can ping the bot in any text channel using natural conversational speech:

| Phrase / Intent | Action | Scope |
|---|---|---|
| `@bot play [song name / link / vibe]` | Searches Spotify or resolves link and starts streaming. | Public (Deletes in 5s) |
| `@bot boost the bass` | Toggles dynamic low-frequency boost. | Ephemeral / Public |
| `@bot speed it up` / `@bot slow it down` | Toggles pitch/tempo multipliers. | Ephemeral / Public |
| `@bot clear` | Resets active audio filters to normal. | Ephemeral / Public |
| `@bot status` | Returns currently playing track metadata. | Public |
| `@bot shut up` / `@bot stop` | Disconnects the bot and pauses Spotify. | Public (Deletes in 5s) |
| `@bot login` | Sends link to link your Spotify Premium account. | Ephemeral |

---

## File Structure

```
spotify-discord-bot/
├── audio.js              # Loopback capture engine (FFmpeg spawn wrapper)
├── bot.js                # Discord client, E2EE Voice, and intent router
├── spotify.js            # Spotify Connect OAuth and search integrations
├── index.js              # Application entry point and signal bootstrapper
├── config.js             # Environment variable casting and validation
├── register-commands.js  # Commands registration script
├── test-audio.js         # Sound pipeline loopback diagnostic script
├── START_SPOTIFY_BOT.bat # Desktop bot launcher script
├── STOP_SPOTIFY_BOT.bat  # Desktop bot stopper script
├── SETUP_GUIDE.md        # Comprehensive Windows setup guide
└── AGENTS.md             # Developer system architecture reference guide
```

---

## Quick Start

Open **[SETUP_GUIDE.md](SETUP_GUIDE.md)** for a complete 5-minute setup guide covering virtual audio cable installation, Discord and Spotify token registration, and launching the bot.

---

## License

This project is licensed under the MIT License.
