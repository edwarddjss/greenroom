# 🤖 Agentic AI Integration & System Architecture Guide

This guide is designed for AI coding assistants, agents, and copilots (e.g., Cursor, Windsurf, Antigravity) that are working on, modifying, or diagnosing this codebase. It provides a technical map of the loopback streaming architecture, state machines, and routing pipelines.

---

## 🗺️ Core Architecture & File Mappings

```
┌───────────┐      requires      ┌───────────┐
│ index.js  ├───────────────────>│ config.js │
└─────┬─────┘                    └───────────┘
      │
      ├────── bootstraps ───────> [ Express OAuth Server ] (spotify.js:8888)
      │
      └────── logs in ──────────> [ Discord Gateway Client ] (bot.js)
```

- **[index.js](index.js)**: Entry point. Validates `.env` variables, boots the Express authorization server in `spotify.js`, handles process termination signals (`SIGINT`, `SIGTERM`), and logs in the Discord client.
- **[config.js](config.js)**: Configuration schema mapping and type-casting. Extracts values from `process.env` and exports validated constants.
- **[spotify.js](spotify.js)**: Core controller for Spotify Connect. Spawns the Express authentication server (`/login` and `/callback`), writes and manages OAuth tokens in `spotify-auth.json`, handles automated refresh hooks, and controls search/playback APIs.
- **[audio.js](audio.js)**: Low-latency loopback audio capture engine. Controls spawning, stdout piping, and clean termination of the FFmpeg capture processes.
- **[bot.js](bot.js)**: Main Discord client. Handles MLS E2EE MLS MLS voice signaling socket handshakes, voice player states, global slash command routes, and the local semantic natural language router.

---

## 🎙️ Low-Latency Audio & E2EE Voice Pipeline

### 1. The Audio Stream Format
Discord's voice gateway operates natively at **48,000Hz stereo**. To bypass heavy resampling latency, FFmpeg is hardcoded to capture loopback audio and output raw, uncompressed PCM:
- **Format:** `pcm_s16le` (Signed 16-bit Little-Endian PCM)
- **Sample Rate:** `48000` Hz
- **Channels:** `2` (Stereo)
- **FFmpeg Output Format:** Forced to `s16le` piped directly into `stdout` (`pipe:1`).

### 2. Discord DAVE E2EE Compliance
As of March 2026, Discord mandates **DAVE (MLS End-to-End Encryption)** for all voice sessions. Standard `@discordjs/voice` installations without cryptographic key MLS MLS exchanges will experience immediate disconnects (`code 6`) upon gateway OP 8 Hello.
- **DAVE Negotiation:** Handled natively by upgrading `@discordjs/voice` to `v0.19.2+` and loading `@snazzah/davey@0.1.11` as a peer ML-E2EE mls MLS MLS cryptographic provider.

---

## 🧠 State Machines & Dynamic Audio Hot-Swapping

### 1. Active Buffer Probing (Seamless Effect Swaps)
To prevent audible stutters (300ms–900ms silent cuts) when users toggle dynamic DSP effects (Bass Boost, Speed Up, Slowed), `audio.js` implements an asynchronous **hot-swap transition pipeline**:
- **Probing:** The new FFmpeg process is spawned and piped into a `PassThrough` stream wrapper.
- **Buffer Detection:** We listen for the first `data` event on the `PassThrough` stream to ensure FFmpeg is actively outputting PCM blocks.
- **Atomic Playback Swap:** The moment data is detected, the Discord `audioPlayer` immediately swaps to the new resource.
- **Delayed Termination:** The old FFmpeg process remains running during the handshake and is cleanly killed exactly `300ms` after the new stream takes over.

### 2. Fuzzy Semantic AI Router
Mentions inside `bot.js` (`messageCreate` listener) bypass standard strict command parsing:
- Sentences are processed locally by `classifyIntent(content)` using token keyword synonym scoring.
- If no command is recognized, it defaults to the `PLAY` intent, parses conversational slang fillers (e.g. `type shit`, `nigga some`) using regex, and executes a fuzzy Spotify Search & Play context transfer.

---

## 🛠️ Diagnostic & Maintenance Reference

- **DirectShow Loopback:** On Windows, FFmpeg captures loopback audio via DirectShow using `audio=CABLE Output (VB-Audio Virtual Cable)`.
- **WAV Verification:** Running `node test-audio.js` compiles DirectShow devices, confirms FFmpeg is in PATH, records a 5-second `capture-test.wav`, and outputs file metrics. Check `capture-test.wav` to isolate hardware capture failures from Discord gateway state issues.
