# Windows Deployment & Setup Guide

This guide walks you through the step-by-step setup to host and run your self-hosted Spotify Discord streaming bot on Windows.

---

## Step 1: Install & Configure VB-Audio Virtual Cable

To capture Spotify's audio, we route its output into a virtual device that FFmpeg can loop back.

1. Download **VB-AUDIO Virtual Cable** from [vb-audio.com/Cable/](https://vb-audio.com/Cable/).
2. Extract the downloaded ZIP folder.
3. Right-click `VBCABLE_Setup_x64.exe` and select **Run as administrator**.
4. Click **Install Driver**, then restart your computer when prompted.
5. **Route ONLY Spotify (Prevent Windows sounds from streaming)**
   * Open the official **Spotify Desktop app** and start playing a track.
   * Right-click the speaker icon in your Windows taskbar and select **Open Volume mixer** (or search "Sound mixer options" in Settings).
   * Scroll down to the **Apps** section and find **Spotify**.
   * Change its **Output device** from *Default* to **CABLE Input (VB-Audio Virtual Cable)**.
   * Ensure your master system output device remains set to your primary speakers/headphones. Now, only Spotify audio is piped to the virtual cable.

---

## Step 2: Configure Spotify Developer Credentials

To use Spotify Connect (controlling play/pause/skip from Discord), you must register a developer application.

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and log in.
2. Click **Create app** in the top right.
3. Fill in the App details:
   * **App name**: `Discord Spotify Bot`
   * **Redirect URI**: `http://localhost:8888/callback` *(Must match exactly)*
4. Agree to terms and click **Save**.
5. On your new App setting page, copy the **Client ID** and click **Show client secret** to copy the **Client Secret**.
6. Store these keys in your `.env` file (Step 4).

---

## Step 3: Register the Discord Bot Application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **New Application** and name your bot.
3. Under the **Bot** tab:
   * Click **Add Bot** and confirm.
   * Under **Bot Token**, click **Reset Token** and copy the resulting key. Keep this secure!
   * Under **Privileged Gateway Intents**, enable **Message Content Intent**.
4. Under the **OAuth2** tab:
   * Go to **URL Generator**.
   * Under **Scopes**, select `bot` and `applications.commands`.
   * Under **Bot Permissions**, check:
     - `Send Messages`
     - `Embed Links`
     - `Connect`
     - `Speak`
     - `Use Voice Activity`
   * Copy the generated link at the bottom and open it in a browser to invite the bot to your target Discord Server.
5. Copy your **Application ID** (Client ID) from the **General Information** page.

---

## Step 4: Configure Project Environment

1. In the project folder, copy `.env.example` to `.env`.
2. Open `.env` in a text editor and fill in your credentials:

```env
# Discord Settings
DISCORD_TOKEN=YourDiscordBotTokenHere
DISCORD_CLIENT_ID=YourDiscordApplicationIDHere
DISCORD_GUILD_ID=YourServerIDForFastTestingOptional

# Spotify Settings
SPOTIFY_CLIENT_ID=YourSpotifyClientIDHere
SPOTIFY_CLIENT_SECRET=YourSpotifyClientSecretHere
SPOTIFY_REDIRECT_URI=http://localhost:8888/callback

# Port & Capture settings
PORT=8888
AUDIO_PLATFORM=windows
AUDIO_DEVICE=CABLE Output (VB-Audio Virtual Cable)
```

---

## Step 5: Install Dependencies & Run Diagnostics

Ensure you have **Node.js** (v18 or higher) and **FFmpeg** installed and added to your system `PATH`.

1. Open a command prompt inside your project folder and install dependencies:
   ```bash
   npm install
   ```
2. Start Spotify, play a track, and run the diagnostic command:
   ```bash
   node test-audio.js
   ```
3. The script will verify your FFmpeg installation, locate the VB-Audio Virtual Cable, and record a 5-second `capture-test.wav`. Check this file to verify the loopback stream is working correctly.

---

## Step 6: Create Desktop Shortcuts & Launch!

### 1. Register slash commands in Discord:
```bash
npm run register
```
*(If you provided `DISCORD_GUILD_ID` in `.env`, these will appear in Discord immediately. Otherwise, global registration can take up to 60 minutes to propagate).*

### 2. Setup Desktop Shortcuts (Frictionless Launch):
To easily launch and stop the bot from your Windows desktop:
- Right-click `START_SPOTIFY_BOT.bat` and select **Show more options** -> **Create shortcut** (or select **Send to** -> **Desktop (create shortcut)**).
- Do the exact same for `STOP_SPOTIFY_BOT.bat`.
- Drag the new shortcuts to your desktop. You can now start and stop the bot with a double-click.

---

## Step 7: How to Link Accounts & Stream

1. **Link your Spotify Account:** In a Discord text channel, run `/login` (or ping the bot and say `@bot login`). Click the private link, authorize the app, and you are linked. Multiple users can link their accounts independently.
2. **Join and stream:** Join any voice channel and run `/play` (or ping the bot and say `@bot play [song/link/genre]`). The bot will automatically join your channel and stream the loopback feed.
3. **Change live filters:** Run `/effect` (or mention the bot with `@bot boost the bass`, `@bot speed it up`, `@bot slow it down`, `@bot clear`) to apply live DSP effects seamlessly with zero stutters.
4. **Pause/Stop:** Run `/stop` (or mention the bot with `@bot stop`) to disconnect the bot and pause Spotify.
