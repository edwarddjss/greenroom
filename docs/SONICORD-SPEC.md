# greenroom — Product & Engineering Spec

**Tagline:** Stream your Spotify into any Discord voice channel. The self-hosted greenroom successor.
**Domain:** greenroom (confirmed available, NXDOMAIN as of 2026-06-02)
**Scope:** Windows-only. Not a "DJ" bot — a personal Spotify-to-Discord streaming bot.

---

## 1. Problem & Positioning

greenroom (the popular hosted Spotify→Discord bot) shut down. Users who want their
Spotify audio in a Discord voice channel now have no turnkey option. greenroom fills
that gap with a **self-hosted** model: the user runs the bot on their own Windows PC,
so there is no shared infrastructure cost, no Spotify ToS exposure for a third party,
and the user's own Spotify Premium session does the playback.

The friction with self-hosting is setup: VB-Cable, FFmpeg, Discord app + token,
Spotify developer app, audio routing. **greenroom's product is the onboarding** — a
desktop client that bundles the runtime and walks the user through every step with
embedded video, live credential validation, and one-click prerequisite installs.

## 2. Decisions (locked)

| Decision | Choice |
|---|---|
| Client form factor | Electron desktop app (Windows-only) |
| Installer | Fully bundled: ships FFmpeg, launches VB-Cable installer, detects/routes audio |
| Onboarding | Interactive wizard + embedded Remotion MP4 clips, with live validation |
| Landing page | Next.js on Vercel |
| Brand | greenroom / greenroom |
| Language | **Strict TypeScript across the whole monorepo** — engine, desktop, landing, media |
| Runtime | Engine migrated to TS, compiled to JS, supervised as a child process |

## 2b. TypeScript standards

Single `tsconfig.base.json` extended by every package. Strict is non-negotiable —
"strict properties" specifically means initialization + optional-property strictness:

```jsonc
{
  "compilerOptions": {
    "strict": true,                        // implies strictPropertyInitialization,
                                           // strictNullChecks, noImplicitAny, etc.
    "exactOptionalPropertyTypes": true,    // optional !== undefined-valued
    "noUncheckedIndexedAccess": true,      // index access is T | undefined
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "useUnknownInCatchVariables": true,
    "verbatimModuleSyntax": true,
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "skipLibCheck": true
  }
}
```

Rules: no `any` (use `unknown` + narrowing); external JSON (Discord/Spotify responses,
the profile store) is validated with **zod** at the boundary and inferred into types, so
runtime data is provably the declared shape. `class SpotifyController` fields satisfy
`strictPropertyInitialization` (definite init or constructor assignment). CI runs
`tsc --noEmit`, `eslint` (typescript-eslint strict-type-checked), and `prettier`.

## 3. Architecture

```
+--------------------------- greenroom.exe (Electron) ---------------------------+
|  Main process                                                                  |
|   - Engine supervisor: fork(engine/index.js) via ELECTRON_RUN_AS_NODE          |
|       * injects credentials as env vars (no plaintext .env on disk)            |
|       * pipes stdout/stderr -> renderer log view                               |
|       * start / stop / restart, crash detect + backoff                         |
|   - Credential vault: Electron safeStorage (Windows DPAPI)                      |
|   - Prereq detection: FFmpeg (bundled path), VB-Cable (audio device enum),     |
|     Spotify desktop app, port 8888 free                                        |
|   - Bundled assets: ffmpeg.exe, VBCABLE installer, onboarding .mp4s            |
|   - IPC bridge (preload, contextIsolation) -> renderer                          |
|                                                                                |
|  Renderer (React + Vite + Tailwind, shared design system with landing)         |
|   - Onboarding wizard (first run / re-runnable)                                |
|   - Dashboard: status pills, live logs, start/stop, edit credentials           |
+--------------------------------------------------------------------------------+
            |  fork (env: DISCORD_TOKEN, *_CLIENT_ID, SPOTIFY_*)
            v
   engine/  (existing bot: index.js, bot.js, spotify.js, audio.js, ...)
   - unchanged; config.js already reads process.env (env wins over .env via dotenv)
   - runs OAuth server on :8888, Discord client, FFmpeg loopback capture
```

Key reuse point: [config.js](../config.js) already pulls every secret from
`process.env`. dotenv does **not** override existing env vars, so the supervisor can
inject credentials into the forked child and never write a plaintext `.env`. This
behavior is preserved through the TS migration (`config.ts` keeps env precedence).

The engine ships as compiled JS: `tsc`/`tsup` build `engine/src/**.ts → engine/dist/**.js`.
The supervisor forks `engine/dist/index.js`; in dev the engine runs via `tsx` for
watch/iteration. Node does not execute `.ts` directly, so the packaged app always runs
the compiled output.

## 4. Repository layout (pnpm workspace)

```
greenroom/
  tsconfig.base.json     # strict TS baseline, extended by every package
  engine/                # bot, migrated JS -> TS (src/*.ts -> dist/*.js)
    src/{index,bot,spotify,audio,config,memory,...}.ts
    tsconfig.json        # extends base; module NodeNext; outDir dist
  apps/
    desktop/             # Electron app (TS main + preload + React/TS renderer)
    landing/             # Next.js (TS) site (Vercel)
  packages/
    onboarding-media/    # Remotion (TS) project -> renders shared MP4s
    ui/                  # shared Tailwind tokens + brand (logo, colors, fonts)
    shared/              # shared TS types: IPC contract, engine env schema, brand
  docs/GREENROOM-SPEC.md
  pnpm-workspace.yaml
```

The IPC contract, engine env schema, and validation result shapes live in
`packages/shared` as the single source of truth, imported by both the Electron main and
renderer so the boundary is type-checked end to end.

## 5. Onboarding wizard (detailed)

Model: a linear, resumable state machine. Each step has `{ status: pending |
checking | ok | error, ... }`. The **Next** button is disabled until `status === ok`.
Progress persists (electron-store, non-secret) so a reboot (VB-Cable) resumes mid-flow.
Every step pairs a Remotion clip (left) with the action/inputs (right).

Credentials the wizard ultimately collects (engine env contract, from
[config.js](../config.js)):

| Env var | Source | Required |
|---|---|---|
| `DISCORD_TOKEN` | Discord Dev Portal → Bot → Reset Token | yes |
| `DISCORD_CLIENT_ID` | Discord Dev Portal → General → Application ID | yes |
| `SPOTIFY_CLIENT_ID` | Spotify Dashboard → app | yes |
| `SPOTIFY_CLIENT_SECRET` | Spotify Dashboard → app | yes |
| `SPOTIFY_REDIRECT_URI` | fixed `http://localhost:8888/callback` | fixed |
| `PORT` | fixed `8888` (must match redirect URI) | fixed |
| `AUDIO_DEVICE` | `CABLE Output (VB-Audio Virtual Cable)` | default |
| `DISCORD_GUILD_ID` | optional, instant command registration | optional |

### Steps

0. **Welcome** — what greenroom does; auto-run a full prereq scan (FFmpeg, VB-Cable,
   Spotify app, port 8888) and render a live checklist. Premium-required notice.

1. **VB-Audio Virtual Cable**
   - *Detect:* enumerate Windows audio endpoints (PowerShell
     `Get-CimInstance Win32_SoundDevice` / `Get-AudioDevice`, or the bundled FFmpeg
     `-list_devices true -f dshow -i dummy` parsed for `CABLE Output`).
   - *If missing:* button runs bundled `VBCABLE_Setup_x64.exe` elevated
     (`shell.openPath` won't elevate → use a `runas` ShellExecute). Show reboot
     notice; on app relaunch the wizard resumes here and re-detects.

2. **Route Spotify audio**
   - Remotion clip of Volume Mixer; user sets Spotify app output → `CABLE Input`.
   - *Detect:* confirm a `Spotify.exe` process exists; we cannot read per-app routing
     reliably, so this step is confirm-by-checkbox after the video, with a
     "Play a test tone / verify capture" button that runs the existing
     [test-audio.js](../test-audio.js) probe and checks `capture-test.wav` is non-silent.
   - Warn: route **only** Spotify, keep system output on real speakers.

3. **Discord application + bot**
   - Clip: create app → Bot → Reset Token → enable **Message Content** and **Server
     Members** privileged intents (required by [bot.js](../bot.js)).
   - Inputs: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`.
   - *Live validation:* `GET https://discord.com/api/v10/users/@me` with header
     `Authorization: Bot <token>`. `200` → show bot username + avatar (green);
     `401` → "Invalid token"; on success, also verify `application_id`/client ID via
     `GET /oauth2/applications/@me`. Client-ID format check: 17–20 digit snowflake.

4. **Spotify developer app**
   - Clip: dashboard → create app → set Redirect URI **exactly**
     `http://localhost:8888/callback` (copy-button provided), scopes informational.
   - Inputs: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`.
   - *Live validation:* client-credentials POST to
     `https://accounts.spotify.com/api/token` (`grant_type=client_credentials`, Basic
     auth). `200` → green; `400 invalid_client` → bad ID/secret. (Note: this only
     proves the app credentials; per-user playback auth happens later via `/login`.)

5. **Register slash commands** *(new — currently a manual `npm run register` step)*
   - The app runs [register-commands.js](../register-commands.js) as a one-shot child
     with the validated env. If `DISCORD_GUILD_ID` is set (optional advanced field),
     commands register instantly to that guild; otherwise globally (≤1h propagation —
     surfaced as a notice). Success/failure parsed from the child's exit code + output.

6. **Invite the bot**
   - Build the OAuth2 URL from `DISCORD_CLIENT_ID` with `scope=bot
     applications.commands` and the permission bitfield for Send Messages, Embed Links,
     Connect, Speak, Use Voice Activity. "Open invite" → browser; confirm-by-checkbox.

7. **Finish setup** — persist credentials to the vault (§6).

8. **Prove it works (end-to-end success — TD1).** The wizard does not call itself done
   at credential entry; it proves the loop. It starts the engine, waits for the
   `discord_ready` + `auth_server_listening` health events, walks the user through
   `/login` (Spotify OAuth), then asks them to join a voice channel and runs a capture
   probe. Success = a non-silent RMS reading on the bundled FFmpeg capture **and** the
   bot streaming in that channel — surfaced in-app as "Discord heard your Spotify."
   Explicit failure branches: no active Spotify device, not Premium, capture silent
   (routing wrong → bounce to Step 2), bot not invited, voice connect failed. Only then
   → dashboard.

### Error/retry conventions
- Validation calls have a 10s timeout; network failure → "Couldn't reach
  Discord/Spotify — check your connection" with a Retry button (does not advance).
- All inputs are revalidated on edit (debounced 600ms); a previously-ok step that is
  edited reverts to `pending`.
- Secrets are never echoed back after save; fields show a masked "•••• (saved)" state.

## 5b. Engine TS migration + seams

The engine is migrated file-by-file from ESM JS to strict TS (`engine/src/*.ts`),
preserving behavior. Two seams are added during the migration because Electron packaging
makes the engine dir read-only (asar) and the auth port/redirect are effectively fixed:

- **Writable data dir:** [config.js](../config.js) hardcodes
  `authStorePath = path.join(__dirname, 'spotify-auth.json')`; [memory.js](../memory.js)
  writes beside itself. `config.ts` adds a `GREENROOM_DATA_DIR` env override (default =
  current behavior) resolving writable paths under `app.getPath('userData')`. Without it,
  profile/memory writes throw in a packaged build.
- **FFmpeg path override:** [audio.js](../audio.js)/[test-audio.js](../test-audio.js)
  honor `FFMPEG_PATH` so the bundled binary is used instead of relying on system PATH.

Migration approach: enable `allowJs` + `checkJs` transitionally, convert leaf modules
first (`spotify-utils`, `config`, `memory`), then `spotify`, `audio`, `bot`, `index`.
Add explicit interfaces for the on-disk profile store and Discord/Spotify payloads
(no `any`). Existing `tests/*.test.js` are ported to `.test.ts` run via `tsx --test`.

## 5c. Supervisor & lifecycle (detailed)

### Process model
- Use Electron **`utilityProcess.fork('engine/dist/index.js', [], { env, stdio: 'pipe' })`**
  (the supported API for child Node processes in packaged apps) rather than
  `child_process.fork`, which needs `ELECTRON_RUN_AS_NODE` gymnastics. The target is the
  compiled engine output; dev uses `tsx engine/src/index.ts`. The child runs
  in a real Node environment; `stdout`/`stderr` are piped to the log pipeline.
- The engine reads all config from `process.env` at import time and `dotenv` does **not**
  override existing env vars, so the supervisor passes credentials via the `env` map and
  no plaintext `.env` is ever written.
- A separate **one-shot** `utilityProcess.fork('engine/register-commands.js')` is used for
  the command-registration wizard step (and a "Re-register commands" dashboard action).

### Env injection map (built per launch)
```
{ ...process.env(filtered),
  DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID?,
  SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REDIRECT_URI:'http://localhost:8888/callback', PORT:'8888',
  AUDIO_PLATFORM:'windows', AUDIO_DEVICE:'CABLE Output (VB-Audio Virtual Cable)',
  GREENROOM_DATA_DIR: app.getPath('userData'),
  FFMPEG_PATH: <bundled ffmpeg.exe> }   // audio.js/test-audio.js honor a path override
```
Secrets are decrypted from the vault into this map in memory only.

### State machine
`idle → preflight → starting → running → degraded → stopping → (idle | crashed)`
- **preflight:** assert port 8888 free (net probe; if busy, surface the owning-process
  hint — mirrors the engine's own EADDRINUSE message and the `runtime-topology` memory),
  FFmpeg present, VB-Cable present, credentials in vault.
- **starting → running:** consider the engine "running" when stdout emits the Discord
  `client.login` ready marker (`[Bootstrap]`/ready log) **and** the auth server
  "listening on port" line; a watchdog flips to `crashed` if neither appears in 20s.
- **degraded:** process alive but a known-bad line seen (e.g. `EADDRINUSE`, Discord
  `DisallowedIntents`/`TokenInvalid`) → show actionable banner mapped to the wizard step
  to fix.
- **crashed:** non-zero exit → auto-restart with exponential backoff (1s, 2s, 4s, cap
  30s, max 5 attempts) unless the exit was a user **Stop**. Backoff resets after 60s
  healthy.

### Log pipeline
- Line-buffer child stdio → ring buffer (last 1000 lines) in main → streamed to renderer
  over IPC. Persist to `userData/logs/engine-*.log` with rotation (5×1MB).
- **Redaction:** before buffering/persisting, scrub secrets with a redactor that masks
  the known token/secret values held in memory plus pattern matches
  (`/(Bearer|Bot)\s+[\w.\-]+/`, Spotify `BQ...` tokens, the bot token shape). The engine
  already avoids logging raw tokens, but the redactor is defense-in-depth.

### Shutdown
- The engine installs `SIGINT`/`SIGTERM` handlers ([index.js](../index.js)) that stop the
  audio engine, close the auth server, and destroy the Discord client. Supervisor stop:
  send graceful kill, wait ≤5s for clean exit, then force-kill. App quit / window-close
  (`before-quit`) must stop the engine first; never leave an orphaned :8888 listener.

### IPC contract (preload, contextIsolation on, no nodeIntegration)
```
renderer → main (invoke):
  engine:start            -> {state}
  engine:stop             -> {state}
  engine:restart          -> {state}
  engine:getState         -> {state, prereqs, lastError}
  prereqs:scan            -> {ffmpeg, vbcable, spotify, port8888}
  vbcable:install         -> {launched:boolean}
  creds:save(partial)     -> {ok}            // writes to safeStorage vault
  creds:status            -> {hasDiscord, hasSpotify, fields:{masked}}
  validate:discord(token, clientId)  -> {ok, botName?, avatar?, error?}
  validate:spotify(id, secret)       -> {ok, error?}
  commands:register       -> {ok, scope:'guild'|'global', error?}
main → renderer (events):
  engine:state            (state transitions)
  engine:log              (redacted line batches)
  prereqs:update          (live prereq changes)
```
No secret values cross IPC back to the renderer — only booleans/masked status.

## 6. Landing page (Vercel)

- Hero: name, tagline, primary CTA "Download for Windows" (GitHub Releases .exe),
  secondary "Watch the 60s demo".
- "greenroom shut down — here's the self-hosted replacement" framing.
- How it works (3 steps), feature grid, embedded demo MP4 (reuses onboarding render),
  FAQ (Premium required? Is my token safe? Why local? Mac/Linux?), download + footer.
- Stack: Next.js + Tailwind + shadcn/ui, shares `packages/ui` tokens with desktop.

## 7. Onboarding media (Remotion)

Following the walkthrough-video skill methodology: `screens.json` manifests →
Remotion compositions → MP4 (H.264, <90s). Screens that require authenticated
dashboards (Discord/Spotify) use captured screenshots with annotations; the greenroom
app's own screens can be auto-captured via Playwright. Renders are consumed by both
the desktop wizard and the landing page.

## 8. Security

- Tokens stored only via `safeStorage` (DPAPI); decrypted in memory, injected into the
  child's env at spawn. No plaintext `.env` written by the app.
- Token/secret values are redacted in the log view and never persisted to log files.
- The local OAuth server binds `127.0.0.1:8888`. (Note: the WSL mirrored-networking
  EADDRINUSE issue is dev-only; production runs on native Windows — see memory
  `runtime-topology`.)
- Installer is NSIS via electron-builder; code-signing certificate is a follow-up
  (unsigned builds trigger SmartScreen — documented in FAQ until signed).

## 9. Delivery phases

- **P0** Workspace + branding + **TS migration**: pnpm workspace, `tsconfig.base.json`,
  migrate engine JS→strict TS (compiled `engine/dist`), `packages/shared` types,
  `packages/ui` tokens, logo. Gate: `tsc --noEmit` clean, ported tests green.
- **P1** Electron shell: supervisor (fork/start/stop/logs/crash), safeStorage vault,
  dashboard with status pills.
- **P2** Onboarding wizard: steps, prereq detection, VB-Cable launcher, FFmpeg bundling,
  live Discord/Spotify validation.
- **P3** Remotion media: scaffold, manifests, render pipeline, placeholder→real captures.
- **P4** Landing page on Vercel, wired to GitHub Releases.
- **P5** Packaging: electron-builder NSIS installer, auto-update channel, release CI.

## GSTACK REVIEW REPORT (/autoplan — dual voice: Claude + Codex)

Consolidated dual-voice pass (this model + Codex CLI 0.135.0, read-only over the repo).
Cross-phase theme flagged independently in CEO + Eng + DX: **the plan builds the
company (TS monorepo, landing, Remotion, packaging) before proving first-run success
on Windows.** The real risk is audio + OAuth + installer trust, not types or brand.

### Auto-decided (consensus CONFIRMED — folded into the plan)
1. **Engine emits structured JSON health events** (`auth_server_listening`,
   `discord_ready`, `ffmpeg_ready`, `voice_ready`, `spotify_auth_saved`) instead of the
   supervisor parsing human log strings with ANSI/emoji. (Eng, P5 explicit.)
2. **Port 8888 preflight is a hard-fail** before engine start; the engine currently
   keeps running with Spotify auth silently dead on EADDRINUSE ([spotify.js](../spotify.js#L141)).
3. **Encrypt the Spotify profile store.** `spotify-auth.json` holds plaintext refresh
   tokens ([spotify.js](../spotify.js#L31)); vaulting only the app creds is not "secure."
   Move the profile store behind the same vault / encrypt at rest. (Eng/Security, P1.)
4. **Capture verification = RMS/peak amplitude + a live meter**, not file size.
   [test-audio.js](../test-audio.js#L147) passes on silence (`>1000` bytes). (Eng/Design.)
5. **Confidence states, not binary gates**, for non-verifiable steps: `verified` /
   `user-confirmed` / `not-verifiable`. The Spotify-routing step can't be truly detected,
   so a binary "ok" is fake certainty. (Design, critical.)
6. **Reboot-resume is a state machine** with explicit failures: installer launched but
   canceled, installed-no-reboot, device disabled, device renamed, driver-install-failed.
   Resume into diagnosis, not blindly into the same step. (Design.)
7. **Mirror Discord command outcomes in the desktop app** (Spotify linked, guild/channel,
   capture active, audio level, last error). Today failures vanish in auto-deleting
   Discord replies ([bot.js](../bot.js#L107)). (Design.)
8. **Diagnostic export bundle** (OS, device list, FFmpeg path/version, port owner, Discord
   + Spotify validation, capture amplitude, health events) — build it early; support
   surface spans Windows audio, Discord, Spotify, Electron, FFmpeg, drivers. (DX.)
9. **Fix Discord intents.** Message-mention NLU reads `message.content` ([bot.js](../bot.js#L404))
   but `MessageContent` intent is not declared ([bot.js](../bot.js#L16)) — latent broken
   feature. Declare it (and validate it in the wizard) or make message-NLU optional.
10. **Default to guild slash-command registration** (instant) over global (≤1h) for TTHW.
11. **Rename "fully bundled" → "assisted setup."** VB-Cable needs elevation+reboot;
    installer is unsigned (SmartScreen). Don't over-promise. (DX, critical framing.)
12. **`AUDIO_DEVICE` needs a fallback** — localized Windows installs may not expose the
    exact string `CABLE Output (VB-Audio Virtual Cable)`; enumerate + fuzzy-match.

### Decisions for the user (User Challenges + taste) — see approval gate
- **UC1 Audience premise:** both models say the required dev-portal work (two developer
  apps, tokens, privileged intents, invite URL, exact redirect URI) is not turnkey for
  non-technical users; either target technical users for the MVP or the product needs a
  hosted credential broker. User's "non-technical" direction is the default.
- **UC2 Engine TS migration timing:** both models recommend keeping the engine in JS for
  now and applying strict TS only to the new Electron shell + typed IPC, migrating the
  engine after first-run success is proven. User said whole-monorepo strict TS now.
- **UC3 Build sequencing:** both models recommend deferring the landing page + Remotion
  until the installer + end-to-end audio loop works (GitHub release + one screen recording
  in the interim). User said build the whole thing including the Vercel landing now.
- **TD1 Definition of "done" for onboarding:** end at credential setup vs. run a real
  end-to-end success step (start engine → Spotify OAuth → join a test voice channel →
  capture → confirm non-silent audio). Recommend the end-to-end step.
- **TD2 (auto, taste):** keep the pnpm workspace (4 real packages, already scaffolded)
  rather than collapsing to a single app — minor disagreement with Codex; kept for DRY.

### Gate outcome (APPROVED 2026-06-02)
User decided: **UC1 → non-technical audience** (original goal kept; invest hardest in
onboarding). **UC2 → migrate engine to strict TS now** (original plan kept). **UC3 →
build everything now incl. Vercel landing + Remotion** (original plan kept). **TD1 →
end-to-end success step adopted** (wizard proves "Discord heard your Spotify" before
finishing — added as wizard Step 8). All 12 auto-decided improvements stand. No scope cut.

## 10. Open items / follow-ups

- Code-signing certificate (removes SmartScreen warning).
- macOS/Linux support (out of scope now; engine already has a Linux audio path).
- Auto-update (electron-updater) — defer to P5.
