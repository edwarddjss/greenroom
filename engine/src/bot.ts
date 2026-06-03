import {
  Client,
  GatewayIntentBits,
  ActivityType,
  MessageFlags,
  type ChatInputCommandInteraction,
  type Message,
  type VoiceState,
} from 'discord.js';
import { config } from './config.js';
import { spotify } from './spotify.js';
import { audioEngine } from './audio.js';
import { memoryManager } from './memory.js';
import { createVoiceSessionManager } from './voice-session.js';
import { emitHealth } from './health.js';
import { nluRouter } from './nlu/router.js';
import { extractDirectPlayQuery, extractSpotifyReference } from './spotify-utils.js';
import type { PlayResult } from './types.js';

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    // Required to read message content for the @mention NLU router.
    GatewayIntentBits.MessageContent,
  ],
});

const voiceSession = createVoiceSessionManager({ audioEngine, spotify, config });

async function replyEphemeral(cmd: ChatInputCommandInteraction, content: string): Promise<void> {
  await cmd.reply({ content, flags: MessageFlags.Ephemeral });
}

async function handleInteractionFailure(cmd: ChatInputCommandInteraction, err: unknown): Promise<void> {
  const message = (err as Error).message || 'Unknown error';
  console.error('[Bot] Interaction failed:', message);
  const content = `Something went wrong: ${message}`;
  try {
    if (cmd.deferred || cmd.replied) {
      await cmd.followUp({ content, flags: MessageFlags.Ephemeral });
    } else {
      await cmd.reply({ content, flags: MessageFlags.Ephemeral });
    }
  } catch (replyErr) {
    console.error('[Bot] Could not send interaction error response:', (replyErr as Error).message);
  }
}

client.on('voiceStateUpdate', (oldState: VoiceState, newState: VoiceState) => {
  voiceSession.handleVoiceStateUpdate(oldState, newState);
});

// ----------------------------------------------------
// Slash Command Handler
// ----------------------------------------------------
client.on('interactionCreate', (interaction) => {
  void (async () => {
    if (!interaction.isChatInputCommand()) return;
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: 'Commands must be used inside a server.', flags: MessageFlags.Ephemeral });
      return;
    }

    const cmd = interaction as ChatInputCommandInteraction<'cached'>;
    try {
      const { commandName, member, guild, user } = cmd;
      const userId = user.id;

      if (commandName === 'login') {
        spotify.startAuthServer();
        await replyEphemeral(cmd, `Link your Spotify Premium account: [Authorize Spotify Connect](${spotify.getLoginUrl(userId)})`);
        return;
      }

      if (commandName === 'play') {
        if (!member.voice.channel) {
          await replyEphemeral(cmd, 'You must be in a voice channel to use this command!');
          return;
        }
        if (!spotify.isUserAuthenticated(userId)) {
          spotify.startAuthServer();
          await replyEphemeral(cmd, `Spotify link required: [Link Account](${spotify.getLoginUrl(userId)})`);
          return;
        }
        await cmd.deferReply();
        try {
          const voiceChannel = await voiceSession.ensureVoiceConnection(member, guild, userId);
          let playError: string | null = null;
          let targetDeviceName = 'your active device';
          try {
            const device = await spotify.findTargetDevice(userId);
            if (device) targetDeviceName = device.name;
            await spotify.play(userId, device?.id ?? null);
          } catch (err) {
            console.warn('[Bot] Auto-resume failed (voice still active):', (err as Error).message);
            playError = (err as Error).message;
          }
          const replyContent = playError
            ? `Connected to **${voiceChannel.name}**. (Ensure Spotify is running and active on your host PC!)`
            : `Connected to **${voiceChannel.name}**. Spotify auto-resumed on **${targetDeviceName}**.`;
          const reply = await cmd.editReply(replyContent);
          setTimeout(() => void reply.delete().catch(() => {}), 5000);
        } catch (err) {
          console.error('[Bot] Failed to join voice/setup audio:', (err as Error).message);
          voiceSession.cleanup();
          await cmd.editReply({ content: `Failed to join voice channel or setup audio: ${(err as Error).message}` });
        }
        return;
      }

      if (commandName === 'queue') {
        await cmd.deferReply();
        const rawQuery = cmd.options.getString('query', true);
        try {
          const result = await spotify.queueTrack(userId, rawQuery);
          await cmd.editReply(formatQueueResult(result));
        } catch (err) {
          await cmd.editReply(`Failed to queue: ${(err as Error).message}`);
        }
        return;
      }

      if (commandName === 'clearqueue') {
        await cmd.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          const result = await spotify.clearQueue(userId);
          await cmd.editReply(result.message ?? 'Queue cleared.');
        } catch (err) {
          await cmd.editReply(`Failed to clear queue: ${(err as Error).message}`);
        }
        return;
      }

      if (commandName === 'stop') {
        await cmd.deferReply();
        try {
          try {
            const device = await spotify.findTargetDevice(userId);
            await spotify.pause(userId, device?.id ?? null);
          } catch (err) {
            console.warn('[Bot] Spotify pause failed during stop:', (err as Error).message);
          }
          voiceSession.cleanup();
          const reply = await cmd.editReply('Stopped streaming and paused Spotify.');
          setTimeout(() => void reply.delete().catch(() => {}), 5000);
        } catch (err) {
          console.error('[Bot] Error during stop:', (err as Error).message);
          voiceSession.cleanup();
          await cmd.editReply('Disconnected from voice (Spotify pause could not complete).');
        }
        return;
      }

      if (commandName === 'effect') {
        if (!voiceSession.isActive()) {
          await replyEphemeral(cmd, 'The bot must be active in a voice channel to apply live effects!');
          return;
        }
        const type = cmd.options.getString('type', true);
        await cmd.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          voiceSession.updateEffects(type);
          await voiceSession.reapplyCapture(userId);
          await cmd.editReply({ content: `Effects updated: ${voiceSession.getEffectStatus()}` });
        } catch (err) {
          console.error('[Bot] Failed to apply effects:', (err as Error).message);
          await cmd.editReply({ content: `Failed to apply effects: ${(err as Error).message}` });
        }
      }
    } catch (err) {
      await handleInteractionFailure(cmd, err);
    }
  })();
});

spotify.on('authenticated', (discordUserId: string) => {
  console.log(`[Bot] Spotify linked for user ${discordUserId}`);
  client.user?.setActivity('Spotify Live', { type: ActivityType.Listening });
});

client.once('clientReady', () => {
  const tag = client.user?.tag ?? 'unknown';
  console.log(`\x1b[32m[Discord] Logged in as ${tag}!\x1b[0m`);
  emitHealth('discord_ready', { tag });
  client.user?.setActivity('Spotify', { type: ActivityType.Listening });
  const profilesCount = Object.keys(spotify.profiles).length;
  console.log(`[Bot] Ready. Loaded ${profilesCount} user profile mapping(s).`);
});

// Handle @mention messages e.g. "@bot play UK garage" or "@bot boost the bass"
client.on('messageCreate', (message: Message) => {
  void (async () => {
    if (message.author.bot) return;
    if (!client.user || !message.mentions.has(client.user)) return;
    if (!message.inGuild()) return;

    const mentionRegex = new RegExp(`<@!?${client.user.id}>`, 'g');
    const cleanContent = message.content.replace(mentionRegex, '').trim();

    let spotifyUserId = message.author.id;
    if (!spotify.isUserAuthenticated(spotifyUserId)) {
      const profiles = Object.keys(spotify.profiles);
      const first = profiles[0];
      if (first) {
        spotifyUserId = first;
      } else {
        await message.reply('No Spotify accounts have been linked yet. Use `/login` first!');
        return;
      }
    }

    // Conversational learning state.
    const pending = memoryManager.getPending(message.author.id);
    if (pending) {
      const cleanText = cleanContent.toLowerCase();
      if (cleanText === 'cancel') {
        memoryManager.clearPending(message.author.id);
        await message.reply('Cancelled conversational learning.');
        return;
      }
      const isMatch = cleanContent.match(new RegExp(`${pending.aliasName}\\s+is\\s+(.+)$`, 'i')) ?? cleanContent.match(/is\s+(.+)$/i);
      const spotifyInput = isMatch?.[1]?.trim() ?? cleanContent.trim();
      const loadingMsg = await message.reply(`Learning... mapping **${pending.aliasName}** to Spotify user "${spotifyInput}"...`);
      try {
        const userLinkMatch = spotifyInput.match(/open\.spotify\.com\/user\/([a-zA-Z0-9_-]+)/i) ?? spotifyInput.match(/spotify:user:([a-zA-Z0-9_-]+)/i);
        let resolvedUserId: string;
        let resolvedDisplayName: string;
        if (userLinkMatch?.[1]) {
          resolvedUserId = userLinkMatch[1];
          try {
            const userProfile = await spotify.request<{ display_name?: string }>(spotifyUserId, `/users/${resolvedUserId}`, 'GET');
            resolvedDisplayName = userProfile?.display_name ?? pending.aliasName;
          } catch {
            resolvedDisplayName = pending.aliasName;
          }
        } else {
          const res = await spotify.resolveUserDisplayName(spotifyUserId, spotifyInput);
          resolvedUserId = res.spotifyUserId;
          resolvedDisplayName = res.spotifyDisplayName;
        }
        memoryManager.setAlias(pending.aliasName, resolvedUserId, resolvedDisplayName);
        memoryManager.clearPending(message.author.id);
        await loadingMsg.edit(`Memory updated! Mapped **${pending.aliasName}** to **${resolvedDisplayName}**.`);

        const autoPlayMsg = await message.reply(`Spinning **${resolvedDisplayName}**'s playlist matching "${pending.targetQuery}"...`);
        try {
          if (message.member) await voiceSession.ensureVoiceConnection(message.member, message.guild, spotifyUserId);
          const result = await spotify.playUserPlaylist(spotifyUserId, resolvedUserId, pending.targetQuery);
          await autoPlayMsg.edit(`Playing **${result.playlistName}** by **${resolvedDisplayName}** on **${result.deviceName}**.`);
          setTimeout(() => void autoPlayMsg.delete().catch(() => {}), 5000);
        } catch (playErr) {
          await autoPlayMsg.edit(`Failed to auto-play playlist: ${(playErr as Error).message}`);
          setTimeout(() => void autoPlayMsg.delete().catch(() => {}), 5000);
        }
      } catch (err) {
        console.error('[Bot] Conversational learning failed:', (err as Error).message);
        await loadingMsg.edit(`Failed to learn mapping: ${(err as Error).message}. Try again or reply "cancel".`);
      }
      return;
    }

    const parsed = await nluRouter.classify(cleanContent);
    console.log(`[SemanticParser] "${cleanContent}" -> ${parsed.intent}`);

    if (parsed.response) {
      const aiDJMsg = await message.reply(parsed.response);
      setTimeout(() => void aiDJMsg.delete().catch(() => {}), 5000);
    }

    let intent = parsed.intent;
    let friend = parsed.friend;
    let target = parsed.target;

    // PLAY against a known friend alias becomes FRIEND_PLAY.
    if (intent === 'PLAY' && parsed.query) {
      const potentialAlias = parsed.query.toLowerCase().trim();
      if (memoryManager.resolveAlias(potentialAlias)) {
        intent = 'FRIEND_PLAY';
        friend = potentialAlias;
        target = 'playlist';
      }
    }

    if (intent === 'GREET') {
      await message.reply("Yo! Ask me to `play [song/vibe]`, `play drew's playlist`, queue, adjust filters (`boost the bass`, `speed up`), or link with `login`!");
      return;
    }
    if (intent === 'LOGIN') {
      await message.reply(`Link your Spotify: [Authorize Spotify](${spotify.getLoginUrl(message.author.id)})`);
      return;
    }
    if (intent === 'STATUS') {
      const state = await spotify.getPlaybackState(spotifyUserId);
      await message.reply(
        state.track
          ? `Now playing: **${state.track.name}** by **${state.track.artists}** [${state.isPlaying ? 'Active' : 'Paused'}]`
          : 'Spotify is currently inactive or not playing on your host client.',
      );
      return;
    }
    if (intent === 'STOP') {
      const loadingMsg = await message.reply('Stopping streaming and disconnecting...');
      try {
        const device = await spotify.findTargetDevice(spotifyUserId);
        await spotify.pause(spotifyUserId, device?.id ?? null).catch(() => {});
      } catch {
        // ignore
      }
      voiceSession.cleanup();
      await loadingMsg.edit('Disconnected and paused Spotify.');
      setTimeout(() => void loadingMsg.delete().catch(() => {}), 5000);
      return;
    }
    if (intent === 'QUEUE') {
      if (!parsed.query) {
        await message.reply('Tell me what to queue! E.g. `@bot queue uk garage` or paste a Spotify track/playlist link.');
        return;
      }
      const loadingMsg = await message.reply('Queueing on Spotify...');
      try {
        const result = await spotify.queueTrack(spotifyUserId, parsed.query);
        await loadingMsg.edit(formatQueueResult(result));
      } catch (err) {
        await loadingMsg.edit(`Failed to queue: ${(err as Error).message}`);
      }
      setTimeout(() => void loadingMsg.delete().catch(() => {}), 5000);
      return;
    }
    if (intent === 'CLEAR_QUEUE') {
      const loadingMsg = await message.reply('Clearing Spotify queue...');
      try {
        const result = await spotify.clearQueue(spotifyUserId);
        await loadingMsg.edit(result.message ?? 'Queue cleared.');
      } catch (err) {
        await loadingMsg.edit(`Failed to clear queue: ${(err as Error).message}`);
      }
      setTimeout(() => void loadingMsg.delete().catch(() => {}), 5000);
      return;
    }
    if (intent.startsWith('EFFECT_')) {
      if (!voiceSession.isActive()) {
        await message.reply('I must be actively streaming in a voice channel to apply live effects!');
        return;
      }
      const loadingMsg = await message.reply('Modifying live audio filters...');
      try {
        voiceSession.updateEffects(intent.replace('EFFECT_', '').toLowerCase());
        await voiceSession.reapplyCapture(spotifyUserId);
        await loadingMsg.edit(`Live effects updated: ${voiceSession.getEffectStatus()}`);
      } catch (err) {
        await loadingMsg.edit(`Failed to apply effects: ${(err as Error).message}`);
      }
      setTimeout(() => void loadingMsg.delete().catch(() => {}), 5000);
      return;
    }
    if (intent === 'FRIEND_PLAY') {
      const friendName = friend ?? '';
      const targetQuery = target ?? 'playlist';
      const resolved = memoryManager.resolveAlias(friendName);
      if (!resolved) {
        memoryManager.setPending(message.author.id, friendName, targetQuery);
        await message.reply(`I don't know who **${friendName}** is yet! Teach me: **${friendName} is [Spotify Username/Display Name]** (or send their Spotify profile link).`);
        return;
      }
      const loadingMsg = await message.reply(`Fetching **${resolved.spotifyDisplayName}**'s playlist matching "${targetQuery}"...`);
      try {
        if (message.member) await voiceSession.ensureVoiceConnection(message.member, message.guild, spotifyUserId);
        const result = await spotify.playUserPlaylist(spotifyUserId, resolved.spotifyUserId, targetQuery);
        await loadingMsg.edit(`Playing **${result.playlistName}** by **${resolved.spotifyDisplayName}** on **${result.deviceName}**.`);
      } catch (err) {
        await loadingMsg.edit(`Failed to play: ${(err as Error).message}`);
      }
      setTimeout(() => void loadingMsg.delete().catch(() => {}), 5000);
      return;
    }
    if (intent === 'PLAY') {
      const playQuery = extractDirectPlayQuery(cleanContent) ?? parsed.query;
      if (!playQuery) {
        await message.reply('Tell me what song or vibe to play! E.g. `@bot play uk garage`');
        return;
      }
      const loadingMsg = await message.reply('Searching Spotify...');
      try {
        if (message.member) await voiceSession.ensureVoiceConnection(message.member, message.guild, spotifyUserId);
        const reference = extractSpotifyReference(playQuery);
        let result;
        if (reference) {
          const device = await spotify.findTargetDevice(spotifyUserId);
          const deviceParam = device?.id ? `?device_id=${device.id}` : '';
          const playBody = reference.type === 'track' ? { uris: [reference.uri] } : { context_uri: reference.uri };
          await spotify.request(spotifyUserId, `/me/player/play${deviceParam}`, 'PUT', playBody);
          result = { matchName: `Spotify Link (${reference.type})`, deviceName: device?.name ?? 'Active Host Client' };
        } else {
          result = await spotify.searchAndPlay(spotifyUserId, playQuery);
        }
        await loadingMsg.edit(`Playing **${result.matchName}** on **${result.deviceName}**.`);
        setTimeout(() => void loadingMsg.delete().catch(() => {}), 5000);
      } catch (err) {
        console.error('[Bot] Message play failed:', (err as Error).message);
        await loadingMsg.edit(`Failed to play: ${(err as Error).message}`);
        setTimeout(() => void loadingMsg.delete().catch(() => {}), 5000);
      }
    }
  })();
});

function formatQueueResult(result: PlayResult): string {
  if (result.matchType === 'playlist') {
    const count = result.queuedCount ?? 0;
    const skipped = result.skippedCount ? ` (${result.skippedCount} unavailable skipped)` : '';
    const capped = result.message ? ` ${result.message}` : '';
    return `Queued **${result.matchName}**: ${count} track${count === 1 ? '' : 's'} on **${result.deviceName}**.${skipped}${capped}`;
  }
  return `Queued **${result.matchName}** on **${result.deviceName}**.`;
}
