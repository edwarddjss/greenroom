import net from 'node:net';
import { config } from './config.js';
import { client } from './bot.js';
import { spotify } from './spotify.js';
import { audioEngine } from './audio.js';
import { emitHealth } from './health.js';
import { nluRouter } from './nlu/router.js';

if (!config.discordToken) {
  console.error('\x1b[31m[Critical] DISCORD_TOKEN is missing.\x1b[0m');
  emitHealth('engine_error', { scope: 'bootstrap', message: 'DISCORD_TOKEN missing' });
  process.exit(1);
}

/**
 * Hard-fail port preflight (eng review #2). The OAuth/auth server must bind
 * config.port for /login to work; if it's taken we exit loudly instead of
 * limping along with Spotify auth silently dead.
 */
async function assertPortFree(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const tester = net
      .createServer()
      .once('error', (err: NodeJS.ErrnoException) => reject(err))
      .once('listening', () => tester.close(() => resolve()))
      .listen(port, '127.0.0.1');
  });
}

async function main(): Promise<void> {
  console.log('====================================================');
  console.log('greenroom engine bootstrapping...');
  console.log('====================================================');

  try {
    await assertPortFree(config.port);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? 'unknown';
    console.error(`\x1b[31m[Critical] Port ${config.port} is unavailable (${code}). Stop the other instance or change PORT.\x1b[0m`);
    emitHealth('engine_error', { scope: 'port_preflight', port: config.port, code });
    process.exit(1);
  }

  const profileCount = Object.keys(spotify.profiles).length;
  console.log(`[Bootstrap] Loaded ${profileCount} linked Spotify profile(s).`);
  emitHealth('spotify_profiles_loaded', { count: profileCount });

  spotify.startAuthServer();

  // Preload the embedded NLU model in the background; @mention parsing falls
  // back to the rule-based parser until it's ready (or if it never loads).
  void nluRouter.warmup();

  try {
    await client.login(config.discordToken);
  } catch (err) {
    const message = (err as Error).message;
    console.error('\x1b[31m[Bootstrap] Discord login failed:\x1b[0m', message);
    if (message.toLowerCase().includes('disallowed intents')) {
      console.error(
        '[Bootstrap] Fix: open the Discord Developer Portal, select your application, go to Bot, enable Message Content Intent under Privileged Gateway Intents, save, then restart greenroom.',
      );
    }
    emitHealth('engine_error', { scope: 'discord_login', message });
    process.exit(1);
  }
}

const handleShutdown = (signal: string): void => {
  console.log(`\n[Shutdown] Received ${signal}. Shutting down...`);
  try {
    audioEngine.stop();
  } catch (e) {
    console.error('[Shutdown] Audio engine stop error:', (e as Error).message);
  }
  try {
    spotify.stopAuthServer();
  } catch (e) {
    console.error('[Shutdown] Auth server stop error:', (e as Error).message);
  }
  try {
    client.destroy();
  } catch {
    // ignore
  }
  console.log('[Shutdown] Complete. Goodbye.');
  process.exit(0);
};

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
  console.error('[Bootstrap] Uncaught exception:', err);
});

void main();
