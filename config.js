import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '.env') });

const requiredEnv = [
  'DISCORD_TOKEN',
  'DISCORD_CLIENT_ID',
  'SPOTIFY_CLIENT_ID',
  'SPOTIFY_CLIENT_SECRET'
];

// Check for missing keys
const missing = requiredEnv.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.warn(`\x1b[33m[Warning] The following environment variables are missing: ${missing.join(', ')}\x1b[0m`);
  console.warn(`\x1b[33mPlease create a '.env' file based on '.env.example' and configure these credentials.\x1b[0m\n`);
}

export const config = {
  discordToken: process.env.DISCORD_TOKEN || '',
  discordClientId: process.env.DISCORD_CLIENT_ID || '',
  discordGuildId: process.env.DISCORD_GUILD_ID || '',
  spotifyClientId: process.env.SPOTIFY_CLIENT_ID || '',
  spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',
  spotifyRedirectUri: process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:8888/callback',
  port: parseInt(process.env.PORT || '8888', 10),
  audioPlatform: (process.env.AUDIO_PLATFORM || 'windows').toLowerCase(),
  audioDevice: process.env.AUDIO_DEVICE || 'CABLE Output (VB-Audio Virtual Cable)',
  spotifyTargetDeviceName: process.env.SPOTIFY_TARGET_DEVICE_NAME || '',
  authStorePath: path.join(__dirname, 'spotify-auth.json')
};
