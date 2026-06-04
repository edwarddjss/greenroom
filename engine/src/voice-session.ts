import {
  joinVoiceChannel,
  createAudioPlayer,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  type AudioPlayer,
  type VoiceConnection,
} from '@discordjs/voice';
import type { Guild, GuildMember, VoiceBasedChannel, VoiceState } from 'discord.js';
import { emitHealth } from './health.js';
import type { AudioCaptureEngine, CaptureHandle } from './audio.js';
import type { SpotifyController } from './spotify.js';
import type { AudioEffects } from './types.js';
import type { GreenroomConfig } from './config.js';

export interface VoiceSessionDeps {
  audioEngine: AudioCaptureEngine;
  spotify: SpotifyController;
  config: GreenroomConfig;
}

const EMPTY_CHANNEL_TIMEOUT_MS = 45_000;

export class VoiceSessionManager {
  private readonly audioEngine: AudioCaptureEngine;
  private readonly spotify: SpotifyController;
  private readonly config: GreenroomConfig;
  private readonly audioPlayer: AudioPlayer;

  private voiceConnection: VoiceConnection | null = null;
  private currentChannelId: string | null = null;
  private activeSpotifyUserId: string | null = null;
  private autoDisconnectTimer: NodeJS.Timeout | null = null;
  activeEffects: AudioEffects = { bassboost: false, speed: 1.0 };

  constructor(deps: VoiceSessionDeps) {
    this.audioEngine = deps.audioEngine;
    this.spotify = deps.spotify;
    this.config = deps.config;
    this.audioPlayer = createAudioPlayer();

    this.audioPlayer.on('error', (error) => {
      console.error('[DiscordVoicePlayer] Error:', error.message, error);
    });
    this.audioPlayer.on(AudioPlayerStatus.Playing, () => {
      console.log('[DiscordVoicePlayer] Streaming loopback audio.');
    });
  }

  get isConnected(): boolean {
    return this.voiceConnection !== null;
  }

  isActive(): boolean {
    return this.voiceConnection !== null && this.audioEngine.isActive();
  }

  getActiveSpotifyUserId(): string | null {
    return this.isActive() ? this.activeSpotifyUserId : null;
  }

  updateEffects(type: string): AudioEffects {
    if (type === 'bass' || type === 'bassboost') {
      this.activeEffects.bassboost = !this.activeEffects.bassboost;
    } else if (type === 'speedup') {
      this.activeEffects.speed = this.activeEffects.speed === 1.25 ? 1.0 : 1.25;
    } else if (type === 'slowed') {
      this.activeEffects.speed = this.activeEffects.speed === 0.8 ? 1.0 : 0.8;
    } else if (type === 'clear') {
      this.activeEffects.bassboost = false;
      this.activeEffects.speed = 1.0;
    }
    return this.activeEffects;
  }

  getEffectStatus(): string {
    const speed = this.activeEffects.speed;
    const speedLabel = speed === 1.25 ? '1.25x' : speed === 0.8 ? '0.8x' : 'Normal';
    return [
      `Bass Boost: **${this.activeEffects.bassboost ? 'ON' : 'OFF'}**`,
      `Speed: **${speedLabel}**`,
    ].join(' | ');
  }

  cleanup(): void {
    if (this.autoDisconnectTimer) {
      clearTimeout(this.autoDisconnectTimer);
      this.autoDisconnectTimer = null;
    }
    this.audioEngine.stop();
    this.audioPlayer.stop();
    if (this.voiceConnection) {
      try {
        this.voiceConnection.destroy();
      } catch {
        // best-effort cleanup
      }
      this.voiceConnection = null;
    }
    this.currentChannelId = null;
    this.activeSpotifyUserId = null;
    console.log('[Bot] Voice connection and audio streams cleaned up.');
  }

  private async maximizeBitrate(voiceChannel: VoiceBasedChannel, guild: Guild): Promise<void> {
    try {
      const tier = guild.premiumTier;
      const maxBitrate = tier === 3 ? 384000 : tier === 2 ? 256000 : tier === 1 ? 128000 : 96000;
      if (voiceChannel.bitrate < maxBitrate) {
        console.log(`[Bot] Optimizing bitrate ${voiceChannel.bitrate} -> ${maxBitrate}bps`);
        await voiceChannel.setBitrate(maxBitrate);
      }
    } catch (err) {
      console.warn('[Bot] Could not optimize bitrate:', (err as Error).message);
    }
  }

  private attachConnectionLifecycle(connection: VoiceConnection): void {
    connection.on('error', (error) => {
      console.error('[VoiceConnection] Error:', error.message);
    });
    connection.on(VoiceConnectionStatus.Ready, () => {
      emitHealth('voice_ready', { channelId: this.currentChannelId });
    });
    connection.on(VoiceConnectionStatus.Destroyed, () => {
      console.log('[Bot] Voice connection destroyed. Cleaning up.');
      this.cleanup();
    });
    connection.on(VoiceConnectionStatus.Disconnected, () => {
      void (async () => {
        try {
          await Promise.race([
            entersState(connection, VoiceConnectionStatus.Signalling, 5000),
            entersState(connection, VoiceConnectionStatus.Connecting, 5000),
          ]);
        } catch {
          console.log('[Bot] Voice disconnected permanently. Cleaning up.');
          this.cleanup();
        }
      })();
    });
  }

  private async connectWithRetry(voiceChannel: VoiceBasedChannel, guild: Guild, attempts = 3): Promise<VoiceConnection> {
    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: true,
        selfMute: false,
      });
      try {
        await entersState(connection, VoiceConnectionStatus.Ready, 20000);
        console.log(`[VoiceConnection] Ready (attempt ${attempt}/${attempts}).`);
        return connection;
      } catch (err) {
        lastError = err as Error;
        console.warn(`[VoiceConnection] Attempt ${attempt}/${attempts} failed: ${lastError.message}`);
        try {
          connection.destroy();
        } catch {
          // ignore
        }
        if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
    throw new Error(`Voice connection failed after ${attempts} attempts: ${lastError?.message ?? 'unknown error'}`);
  }

  async startCapture(spotifyUserId: string): Promise<CaptureHandle> {
    const targetDevice = this.spotify.getUserAudioDevice(spotifyUserId) ?? this.config.audioDevice;
    const handle = this.audioEngine.start(targetDevice, this.activeEffects);
    this.audioPlayer.play(handle.resource);
    this.activeSpotifyUserId = spotifyUserId;
    return handle;
  }

  async ensureVoiceConnection(member: GuildMember, guild: Guild, spotifyUserId: string): Promise<VoiceBasedChannel> {
    const voiceChannel = member.voice.channel;
    if (!voiceChannel) {
      throw new Error('You must be in a voice channel to use this command!');
    }

    const healthy =
      this.voiceConnection !== null &&
      this.currentChannelId === voiceChannel.id &&
      this.voiceConnection.state.status !== VoiceConnectionStatus.Destroyed;

    if (healthy) {
      if (!this.audioEngine.isActive()) await this.startCapture(spotifyUserId);
      return voiceChannel;
    }

    if (this.voiceConnection) {
      try {
        this.voiceConnection.destroy();
      } catch {
        // ignore stale cleanup
      }
      this.voiceConnection = null;
    }

    this.voiceConnection = await this.connectWithRetry(voiceChannel, guild);
    this.currentChannelId = voiceChannel.id;
    this.attachConnectionLifecycle(this.voiceConnection);
    this.voiceConnection.subscribe(this.audioPlayer);

    await this.maximizeBitrate(voiceChannel, guild);

    this.activeEffects = { bassboost: false, speed: 1.0 };
    await this.startCapture(spotifyUserId);

    return voiceChannel;
  }

  async reapplyCapture(spotifyUserId: string): Promise<void> {
    if (!this.voiceConnection || !this.isActive()) {
      throw new Error('The bot must be active in a voice channel to apply live audio effects!');
    }
    const { readyPromise } = await this.startCapture(spotifyUserId);
    await readyPromise;
  }

  handleVoiceStateUpdate(oldState: VoiceState, _newState: VoiceState): void {
    if (!this.voiceConnection || !this.currentChannelId) return;

    const guild = oldState.guild;
    const channel = guild.channels.cache.get(this.currentChannelId);
    if (!channel || !channel.isVoiceBased()) return;

    const humanUsers = channel.members.filter((m) => !m.user.bot).size;

    if (humanUsers === 0) {
      if (!this.autoDisconnectTimer) {
        console.log(`[Bot] ${channel.name} is empty. Starting 45s auto-disconnect timer.`);
        this.autoDisconnectTimer = setTimeout(() => {
          console.log(`[Bot] ${channel.name} empty timeout. Leaving.`);
          this.cleanup();
        }, EMPTY_CHANNEL_TIMEOUT_MS);
      }
    } else if (this.autoDisconnectTimer) {
      console.log(`[Bot] A user rejoined ${channel.name}. Cancelling auto-disconnect.`);
      clearTimeout(this.autoDisconnectTimer);
      this.autoDisconnectTimer = null;
    }
  }
}

export const createVoiceSessionManager = (deps: VoiceSessionDeps): VoiceSessionManager => new VoiceSessionManager(deps);
