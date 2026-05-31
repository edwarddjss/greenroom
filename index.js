import { config } from './config.js';
import { client } from './bot.js';
import { spotify } from './spotify.js';
import { audioEngine } from './audio.js';

// Validate configurations before startup
if (!config.discordToken) {
  console.error('\n\x1b[31m[Critical Error] DISCORD_TOKEN is missing from the .env configuration!\x1b[0m');
  console.error('\x1b[31mPlease create a .env file and configure your Discord bot token first.\x1b[0m\n');
  process.exit(1);
}

console.log('====================================================');
console.log('🎙️  Spotify Discord Streaming Bot bootstrapping...');
console.log('====================================================');

// Report loaded profiles
const profileCount = Object.keys(spotify.profiles).length;
if (profileCount > 0) {
  console.log(`[Bootstrap] Loaded ${profileCount} linked Spotify user profile(s) from disk.`);
} else {
  console.log('[Bootstrap] No linked Spotify profiles found. Users can link via /login in Discord.');
}

// Always start the OAuth server so any user can link at any time
spotify.startAuthServer();

// Log in the Discord bot client
client.login(config.discordToken).catch(err => {
  console.error('\x1b[31m[Bootstrap] Discord Client Login Failed:\x1b[0m', err.message);
  process.exit(1);
});

// ----------------------------------------------------
// Graceful Shutdown
// ----------------------------------------------------
const handleShutdown = (signal) => {
  console.log(`\n[Shutdown] Received signal ${signal}. Starting safe shutdown...`);
  
  // Stop capture subprocesses
  try {
    audioEngine.stop();
  } catch (e) {
    console.error('[Shutdown] Error stopping audio engine:', e.message);
  }
  
  // Close port bindings
  try {
    spotify.stopAuthServer();
  } catch (e) {
    console.error('[Shutdown] Error stopping Spotify server:', e.message);
  }
  
  // Terminate Discord client session
  try {
    client.destroy();
    console.log('[Shutdown] Discord client destroyed.');
  } catch (e) {}

  console.log('[Shutdown] Safe exit complete. Goodbye!');
  process.exit(0);
};

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
  console.error('[Bootstrap] Uncaught Exception encountered:', err);
  // Do not kill process immediately unless critical, but ensure we log it
});
