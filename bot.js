import { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  ActivityType 
} from 'discord.js';
import { 
  joinVoiceChannel, 
  createAudioPlayer, 
  AudioPlayerStatus, 
  VoiceConnectionStatus, 
  entersState 
} from '@discordjs/voice';
import { config } from './config.js';
import { spotify } from './spotify.js';
import { audioEngine } from './audio.js';
import { isQueueRequest } from './spotify-utils.js';
import { memoryManager } from './memory.js';
import fetch from 'node-fetch';


export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages
  ]
});

// Voice player instance
const audioPlayer = createAudioPlayer();
let voiceConnection = null;
let currentChannelId = null;
let autoDisconnectTimer = null;
let activeEffects = { bassboost: false, speed: 1.0 };

// Handle audio player errors and detailed state transitions
audioPlayer.on('error', (error) => {
  console.error('[DiscordVoicePlayer] Error encountered:', error.message, error);
});

audioPlayer.on('stateChange', (oldState, newState) => {
  console.log(`[DiscordVoicePlayer] State changed from ${oldState.status} to ${newState.status}`);
});

audioPlayer.on(AudioPlayerStatus.Idle, () => {
  console.log('[DiscordVoicePlayer] Player entered Idle state.');
});

audioPlayer.on(AudioPlayerStatus.Playing, () => {
  console.log('[DiscordVoicePlayer] Player is active and streaming loopback audio.');
});

// ----------------------------------------------------
// Helper Functions
// ----------------------------------------------------

// Verify if the executing user is authorized with Spotify
const checkSpotifyAuth = async (interaction) => {
  const userId = interaction.user.id;
  if (!spotify.isUserAuthenticated(userId)) {
    const loginUrl = spotify.getLoginUrl(userId);
    await interaction.reply({
      content: `Spotify link required: [Link Account](${loginUrl})`,
      ephemeral: true
    });
    spotify.startAuthServer();
    return false;
  }
  return true;
};

// Auto disconnect when channel is empty (checks on user voice state change)
client.on('voiceStateUpdate', (oldState, newState) => {
  if (!voiceConnection || !currentChannelId) return;

  const guild = oldState.guild;
  const voiceChannel = guild.channels.cache.get(currentChannelId);
  
  if (!voiceChannel) return;

  const humanUsers = voiceChannel.members.filter(member => !member.user.bot).size;

  if (humanUsers === 0) {
    if (!autoDisconnectTimer) {
      console.log(`[Bot] Voice channel ${voiceChannel.name} is empty. Starting 45-second auto-disconnect timer.`);
      autoDisconnectTimer = setTimeout(() => {
        console.log(`[Bot] Voice channel empty timeout. Leaving voice channel ${voiceChannel.name}.`);
        cleanupVoiceConnection();
      }, 45000);
    }
  } else {
    if (autoDisconnectTimer) {
      console.log(`[Bot] A user rejoined voice channel ${voiceChannel.name}. Cancelling auto-disconnect timer.`);
      clearTimeout(autoDisconnectTimer);
      autoDisconnectTimer = null;
    }
  }
});

// Voice connection and capture process cleanup
const cleanupVoiceConnection = () => {
  if (autoDisconnectTimer) {
    clearTimeout(autoDisconnectTimer);
    autoDisconnectTimer = null;
  }

  audioEngine.stop();
  audioPlayer.stop();

  if (voiceConnection) {
    try {
      voiceConnection.destroy();
    } catch (e) {}
    voiceConnection = null;
  }
  
  currentChannelId = null;
  console.log('[Bot] Voice connection and audio streams successfully cleaned up.');
};

// ----------------------------------------------------
// Slash Command Handler
// ----------------------------------------------------
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, member, guild, user } = interaction;
  const userId = user.id;

  // 1. COMMAND: /login
  if (commandName === 'login') {
    spotify.startAuthServer();
    const loginUrl = spotify.getLoginUrl(userId);
    return interaction.reply({
      content: `Link your Spotify Premium account: [Authorize Spotify Connect](${loginUrl})`,
      ephemeral: true
    });
  }

  // 2. COMMAND: /play (Start session!)
  if (commandName === 'play') {
    const voiceChannel = member.voice.channel;
    if (!voiceChannel) {
      return interaction.reply({ content: '❌ You must be in a voice channel to use this command!', ephemeral: true });
    }

    // Check Spotify Auth first
    if (!spotify.isUserAuthenticated(userId)) {
      spotify.startAuthServer();
      const loginUrl = spotify.getLoginUrl(userId);
      return interaction.reply({
        content: `Spotify link required: [Link Account](${loginUrl})`,
        ephemeral: true
      });
    }

    await interaction.deferReply();

    try {
      // Connect to voice (or reuse/reconnect gracefully)
      voiceConnection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: true,
        selfMute: false,
        debug: true
      });

      console.log(`[VoiceConnection] Initiated connection to channel: ${voiceChannel.name} (${voiceChannel.id})`);

      // Monitor VoiceConnection states (removing legacy duplicate listeners)
      voiceConnection.removeAllListeners();

      voiceConnection.on('stateChange', (oldState, newState) => {
        console.log(`[VoiceConnection] State changed from ${oldState.status} to ${newState.status}`);
      });

      voiceConnection.on('debug', (message) => {
        console.log(`[VoiceConnection Debug] ${message}`);
      });

      voiceConnection.on('error', (error) => {
        console.error('[VoiceConnection] Connection encountered error:', error);
      });

      voiceConnection.on(VoiceConnectionStatus.Destroyed, () => {
        console.log('[Bot] Voice connection destroyed. Cleaning up.');
        cleanupVoiceConnection();
      });

      currentChannelId = voiceChannel.id;
      voiceConnection.subscribe(audioPlayer);

      voiceConnection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
          await Promise.race([
            entersState(voiceConnection, VoiceConnectionStatus.Signalling, 5000),
            entersState(voiceConnection, VoiceConnectionStatus.Connecting, 5000)
          ]);
        } catch (error) {
          console.log('[Bot] Discord voice disconnected permanently. Cleaning up.');
          cleanupVoiceConnection();
        }
      });

      // Wait for the connection to become ready before playing
      console.log('[VoiceConnection] Waiting up to 15 seconds for connection to be Ready...');
      await entersState(voiceConnection, VoiceConnectionStatus.Ready, 15000);
      console.log('[VoiceConnection] Connection is Ready! Starting audio streaming.');

      // Auto-max the voice channel bitrate for high-fidelity music streaming
      try {
        const maxBitrate = guild.premiumTier === 3 ? 384000 : (guild.premiumTier === 2 ? 256000 : (guild.premiumTier === 1 ? 128000 : 96000));
        if (voiceChannel.bitrate < maxBitrate) {
          console.log(`[Bot] Optimizing voice channel bitrate from ${voiceChannel.bitrate}bps to max supported: ${maxBitrate}bps`);
          await voiceChannel.setBitrate(maxBitrate);
        }
      } catch (err) {
        console.warn('[Bot] Could not auto-optimize channel bitrate (missing Manage Channels permission):', err.message);
      }

      // Reset active effects on new session join
      activeEffects = { bassboost: false, speed: 1.0 };

      // Spooticord-style dynamic audio device routing
      const customDevice = spotify.getUserAudioDevice(userId);
      const targetDevice = customDevice || config.audioDevice;

      // Spawn FFmpeg to capture audio
      const { resource, readyPromise } = audioEngine.start(targetDevice, activeEffects);
      audioPlayer.play(resource);

      // AUTOMATIC PLAYBACK INITIATION
      console.log(`[Bot] Attempting to automatically start/resume Spotify playback for User: ${userId}...`);
      let playError = null;
      let targetDeviceName = 'No active device detected';
      try {
        const device = await spotify.findTargetDevice(userId);
        const deviceId = device ? device.id : null;
        if (device) targetDeviceName = device.name;
        
        await spotify.play(userId, deviceId);
        console.log('[Bot] Spotify playback resume command sent successfully.');
      } catch (err) {
        console.warn('[Bot] Automatic Spotify resume failed (but voice is active):', err.message);
        playError = err.message;
      }

      let replyContent = `Connected to **${voiceChannel.name}**. Spotify auto-resumed on **${targetDeviceName}**.`;
      if (playError) {
        replyContent = `Connected to **${voiceChannel.name}**. (Note: Ensure Spotify is running and active on your host PC!)`;
      }

      const reply = await interaction.editReply(replyContent);
      setTimeout(() => reply.delete().catch(() => {}), 5000);

    } catch (err) {
      console.error('[Bot] Failed to join voice channel or setup audio stream:', err.message);
      cleanupVoiceConnection();
      await interaction.editReply({ content: `❌ Failed to join voice channel or setup audio: ${err.message}` });
    }
  }

  // 3. COMMAND: /queue (Queue a song)
  if (commandName === 'queue') {
    await interaction.deferReply();
    const rawQuery = interaction.options.getString('query', true);
    try {
      const result = await spotify.queueTrack(user.id, rawQuery);
      await interaction.editReply(`🧺 Queued **${result.matchName}** on **${result.deviceName}**.`);
    } catch (err) {
      await interaction.editReply(`❌ Failed to queue: ${err.message}`);
    }
    return;
  }

  // 3. COMMAND: /stop (Stop session!)
  if (commandName === 'stop') {
    await interaction.deferReply();
    try {
      // Pause Spotify playback so it stops playing on host
      console.log('[Bot] Pausing Spotify playback during stop/cleanup...');
      try {
        const device = await spotify.findTargetDevice(userId);
        const deviceId = device ? device.id : null;
        await spotify.pause(userId, deviceId);
      } catch (err) {
        console.warn('[Bot] Spotify pause failed during stop:', err.message);
      }

      cleanupVoiceConnection();
      
      const reply = await interaction.editReply('Stopped streaming and paused Spotify.');
      setTimeout(() => reply.delete().catch(() => {}), 5000);
    } catch (err) {
      console.error('[Bot] Error during stop command:', err.message);
      cleanupVoiceConnection();
      await interaction.editReply('🔌 Disconnected from voice channel (Spotify pause could not be completed).');
    }
  }

  // 4. COMMAND: /effect (Apply DSP Live Effects!)
  if (commandName === 'effect') {
    if (!voiceConnection || !audioEngine.isActive()) {
      return interaction.reply({ content: '❌ The bot must be active in a voice channel to apply live audio effects!', ephemeral: true });
    }

    const type = interaction.options.getString('type');
    
    // Process effect toggles / variables
    if (type === 'bassboost') {
      activeEffects.bassboost = !activeEffects.bassboost; // Toggle Bass Boost!
    } else if (type === 'speedup') {
      activeEffects.speed = activeEffects.speed === 1.25 ? 1.0 : 1.25; // Toggle Speed Up!
    } else if (type === 'slowed') {
      activeEffects.speed = activeEffects.speed === 0.8 ? 1.0 : 0.8; // Toggle Slowed Down!
    } else if (type === 'clear') {
      activeEffects.bassboost = false;
      activeEffects.speed = 1.0;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      // Re-apply FFmpeg capture pipeline with updated effects dynamically
      const customDevice = spotify.getUserAudioDevice(userId);
      const targetDevice = customDevice || config.audioDevice;

      console.log(`[Bot] Re-applying audio capture with effects:`, activeEffects);
      const { resource, readyPromise } = audioEngine.start(targetDevice, activeEffects);
      await readyPromise;
      audioPlayer.play(resource);

      const statusString = [
        `Bass Boost: **${activeEffects.bassboost ? 'ON' : 'OFF'}**`,
        `Speed: **${activeEffects.speed === 1.25 ? '1.25x' : (activeEffects.speed === 0.8 ? '0.8x' : 'Normal')}**`
      ].join(' | ');

      await interaction.editReply({
        content: `Effects updated: ${statusString}`,
        ephemeral: true
      });
    } catch (err) {
      console.error('[Bot] Failed to re-spawn audio with effects:', err.message);
      await interaction.editReply({ content: `❌ Failed to apply effects: ${err.message}`, ephemeral: true });
    }
  }
});

// Setup status triggers on login
spotify.on('authenticated', (discordUserId) => {
  console.log(`[Bot] Spotify linked successfully for User ID: ${discordUserId}`);
  client.user?.setActivity('Spotify Live', { type: ActivityType.Listening });
});

client.once('ready', () => {
  console.log(`\x1b[32m[Discord] Logged in as ${client.user.tag}!\x1b[0m`);
  
  // Set default activity status
  client.user.setActivity('Spotify', { type: ActivityType.Listening });

  // Scan and report loaded profiles
  const profilesCount = Object.keys(spotify.profiles).length;
  console.log(`[Bot] Ready and listening. Loaded ${profilesCount} user profile mappings.`);
  if (profilesCount === 0) {
    console.log(`\n\x1b[33m[Setup Note] To link your Spotify account, run '/login' in Discord.\x1b[0m\n`);
  }
});

// ----------------------------------------------------
// Smart AI Natural Language Intent Router (Gemini-Powered)
// ----------------------------------------------------

const queryGemini = async (content) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const systemInstruction = `
You are the AI brain of "spotinigga", a high-vibe Spotify Discord DJ Bot.
Your job is to analyze the user's natural language request and map it to one of the following intents:
1. GREET: Casual greeting (e.g. "hi", "yo", "sup")
2. LOGIN: Link/connect Spotify account (e.g. "login", "link account", "authenticate")
3. STATUS: Check what is currently playing (e.g. "what's playing", "status", "current song")
4. STOP: Pause/stop music and disconnect (e.g. "stop", "pause", "leave", "shut up")
5. QUEUE: Add a track to the queue (e.g. "queue superstar by jamelia", "add to queue ...")
6. PLAY: Search and play a track or playlist (e.g. "play lofi beats", "put on some house")
7. FRIEND_PLAY: Play a friend's playlist (e.g. "play drew's playlist", "play drew's mix", "play garage by drew")
8. EFFECT_BASS: Toggle/enable/disable bass boost (e.g. "boost the bass", "heavy bass", "more low end")
9. EFFECT_SPEEDUP: Toggle/enable/disable speed up (e.g. "speed it up", "nightcore", "faster")
10. EFFECT_SLOWED: Toggle/enable/disable slowed down (e.g. "slow it down", "slowed and reverb", "chop and screw")
11. EFFECT_CLEAR: Reset all effects to normal (e.g. "clear effects", "reset", "normal speed")

For FRIEND_PLAY, extract the 'friend' (the friend's nickname, e.g., "drew") and the 'target' (the playlist/vibe they want, e.g., "playlist", "garage", "vibe").

Response JSON format:
{
  "intent": "INTENT_NAME",
  "query": "search query for PLAY or QUEUE, stripped of command words",
  "friend": "friend nickname for FRIEND_PLAY",
  "target": "playlist query for FRIEND_PLAY",
  "response": "A short, cool, high-vibe, one-line DJ-like response acknowledging the command (e.g. 'Booster activated! Let's get that bass thumpin' 🔊' or 'Checking my memory bank for Drew... 🧠')"
}
`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `User request: "${content}"\n\nClassify and respond according to your instructions.`
          }]
        }],
        systemInstruction: {
          parts: [{ text: systemInstruction }]
        },
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              intent: {
                type: "STRING",
                enum: ["PLAY", "STOP", "EFFECT_BASS", "EFFECT_SPEEDUP", "EFFECT_SLOWED", "EFFECT_CLEAR", "QUEUE", "STATUS", "LOGIN", "FRIEND_PLAY", "GREET"]
              },
              query: { type: "STRING" },
              friend: { type: "STRING" },
              target: { type: "STRING" },
              response: { type: "STRING" }
            },
            required: ["intent"]
          }
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API returned status ${response.status}`);
    }

    const data = await response.json();
    const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (textResult) {
      return JSON.parse(textResult);
    }
  } catch (e) {
    console.error('[Gemini] AI Classification failed, falling back to rule-based parser:', e.message);
  }
  return null;
};

const classifyIntent = async (content) => {
  const text = content.toLowerCase();

  // Try Gemini AI first if configured
  if (process.env.GEMINI_API_KEY) {
    const aiResult = await queryGemini(content);
    if (aiResult) {
      console.log(`[AI Brain] Parsed request successfully using Gemini:`, aiResult);
      return aiResult;
    }
  }

  // Fallback to local rule-based/regex semantic parser
  const scores = {
    PLAY: 0,
    STOP: 0,
    EFFECT_BASS: 0,
    EFFECT_SPEEDUP: 0,
    EFFECT_SLOWED: 0,
    EFFECT_CLEAR: 0,
    QUEUE: 0,
    STATUS: 0,
    LOGIN: 0,
    FRIEND_PLAY: 0
  };

  // 1. STOP intent triggers
  if (/\b(stop|pause|leave|quit|disconnect|shut\s+up|get\s+out|go\s+away|bye|exit|kill)\b/.test(text)) {
    scores.STOP += 5;
  }

  // 2. BASS intent triggers
  if (/\b(bass|boost|bassboost|sub|low\s+end|subwoofer|heavy|deep)\b/.test(text)) {
    scores.EFFECT_BASS += 5;
  }

  // 3. SPEEDUP intent triggers
  if (/\b(speed\b(.*?)\bup|faster|nightcore|fast|accelerate|pitch\s+up)\b/.test(text)) {
    scores.EFFECT_SPEEDUP += 5;
  }

  // 4. SLOWED intent triggers
  if (/\b(slow\b(.*?)\bdown|slower|slowed|screwed|chop|reverb|pitch\s+down)\b/.test(text)) {
    scores.EFFECT_SLOWED += 5;
  }

  // 5. CLEAR intent triggers
  if (/\b(clear|normal|reset|remove|clean|standard|default|unboost|normalize)\b/.test(text)) {
    scores.EFFECT_CLEAR += 5;
  }

  // 6. QUEUE intent triggers
  if (isQueueRequest(text)) {
    scores.QUEUE += 5;
  }

  // 7. STATUS intent triggers
  if (/\b(status|playing|song|current|track|now\s+playing|info|name|what\s+is\s+this|what\s+is\s+playing)\b/.test(text)) {
    scores.STATUS += 5;
  }

  // 8. LOGIN intent triggers
  if (/\b(login|link|auth|authorize|register|connect|account)\b/.test(text)) {
    scores.LOGIN += 5;
  }

  // 9. FRIEND_PLAY intent triggers
  const friendPlayMatch = text.match(/\bplay\s+(\w+)'s\s+(.+)$/i) || text.match(/\bplay\s+(.+)\s+by\s+(\w+)\b/i);
  if (friendPlayMatch) {
    scores.FRIEND_PLAY += 10;
  }

  // 10. PLAY intent triggers
  if (/\b(play|listen|put\s+on|stream|start|resume|crank|spin|bump|search)\b/.test(text)) {
    scores.PLAY += 2;
  }

  let bestIntent = 'PLAY';
  let highestScore = 0;

  for (const [intent, score] of Object.entries(scores)) {
    if (score > highestScore) {
      highestScore = score;
      bestIntent = intent;
    }
  }

  if (highestScore === 0) {
    if (text.length < 4 || (/\b(hey|hello|hi|yo|whatsup|sup|bot)\b/.test(text) && text.split(' ').length <= 2)) {
      return { intent: 'GREET' };
    }
    return { intent: 'PLAY', query: content };
  }

  if (bestIntent === 'PLAY') {
    const query = content.replace(/\b(play|listen|put\s+on|stream|start|resume|crank|spin|bump|search|this|some|a|the|nigga)\b/gi, '').trim();
    return { intent: 'PLAY', query };
  }

  if (bestIntent === 'QUEUE') {
    const query = content.replace(/\b(queue|add\s+to\s+queue|enqueue|next\s+up|up\s+next|put\s+up\s+next|this|some|a|the|nigga)\b/gi, '').trim();
    return { intent: 'QUEUE', query };
  }

  if (bestIntent === 'FRIEND_PLAY') {
    const match = text.match(/\bplay\s+(\w+)'s\s+(.+)$/i);
    if (match) {
      return { 
        intent: 'FRIEND_PLAY', 
        friend: match[1].trim(), 
        target: match[2].trim() 
      };
    }
    
    const byMatch = text.match(/\bplay\s+(.+)\s+by\s+(\w+)\b/i);
    if (byMatch) {
      return { 
        intent: 'FRIEND_PLAY', 
        friend: byMatch[2].trim(), 
        target: byMatch[1].trim() 
      };
    }
  }

  return { intent: bestIntent };
};

// ----------------------------------------------------
// Reusable Voice Channel Connection Helper
// ----------------------------------------------------
const ensureVoiceConnected = async (message, spotifyUserId) => {
  const voiceChannel = message.member?.voice?.channel;
  if (!voiceChannel) {
    throw new Error('You must be in a voice channel to use this command!');
  }

  if (!voiceConnection || currentChannelId !== voiceChannel.id) {
    voiceConnection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: message.guild.id,
      adapterCreator: message.guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false,
      debug: true
    });

    voiceConnection.removeAllListeners();
    voiceConnection.on(VoiceConnectionStatus.Destroyed, () => {
      cleanupVoiceConnection();
    });
    voiceConnection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(voiceConnection, VoiceConnectionStatus.Signalling, 5000),
          entersState(voiceConnection, VoiceConnectionStatus.Connecting, 5000)
        ]);
      } catch (error) {
        cleanupVoiceConnection();
      }
    });

    currentChannelId = voiceChannel.id;
    voiceConnection.subscribe(audioPlayer);

    await entersState(voiceConnection, VoiceConnectionStatus.Ready, 15000);

    // Maximize voice channel bitrate
    try {
      const maxBitrate = message.guild.premiumTier === 3 ? 384000 : (message.guild.premiumTier === 2 ? 256000 : (message.guild.premiumTier === 1 ? 128000 : 96000));
      if (voiceChannel.bitrate < maxBitrate) {
        await voiceChannel.setBitrate(maxBitrate);
      }
    } catch (err) {}

    // Reset active effects on new session join
    activeEffects = { bassboost: false, speed: 1.0 };

    // Spawn capture
    const customDevice = spotify.getUserAudioDevice(spotifyUserId);
    const targetDevice = customDevice || config.audioDevice;
    const { resource } = audioEngine.start(targetDevice, activeEffects);
    audioPlayer.play(resource);
  }
};

// Handle text channel mentions e.g. "@bot play UK garage" or "@bot boost the bass"
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // Check if bot is explicitly mentioned
  if (!message.mentions.has(client.user)) return;

  // Extract text and clean pings
  const mentionRegex = new RegExp(`<@!?${client.user.id}>`, 'g');
  const cleanContent = message.content.replace(mentionRegex, '').trim();

  // Resolve Spotify Profile (Sender's, or fallback to first linked profile)
  let spotifyUserId = message.author.id;
  if (!spotify.isUserAuthenticated(spotifyUserId)) {
    const profiles = Object.keys(spotify.profiles);
    if (profiles.length > 0) {
      spotifyUserId = profiles[0];
    } else {
      return message.reply('❌ No Spotify accounts have been linked to the bot yet. Please use `/login` first!');
    }
  }

  // ----------------------------------------------------
  // CONVERSATIONAL MEMORY / LEARNING STATE TRIGGER
  // ----------------------------------------------------
  const pending = memoryManager.getPending(message.author.id);
  if (pending) {
    const cleanText = cleanContent.toLowerCase();
    
    if (cleanText === 'cancel') {
      memoryManager.clearPending(message.author.id);
      return message.reply('👍 Cancelled conversational learning.');
    }

    // Try parsing "drew is habibi howie", or extract only the mapping target after "is "
    const isMatch = cleanContent.match(new RegExp(`${pending.aliasName}\\s+is\\s+(.+)$`, 'i')) || 
                    cleanContent.match(/is\s+(.+)$/i);
    let spotifyInput = isMatch ? isMatch[1].trim() : cleanContent.trim();

    const loadingMsg = await message.reply(`🧠 Learning... mapping **${pending.aliasName}** to Spotify user "${spotifyInput}"...`);

    try {
      const userLinkMatch = spotifyInput.match(/open\.spotify\.com\/user\/([a-zA-Z0-9_-]+)/i) || 
                            spotifyInput.match(/spotify:user:([a-zA-Z0-9_-]+)/i);
      let resolvedUserId = null;
      let resolvedDisplayName = null;

      if (userLinkMatch) {
        resolvedUserId = userLinkMatch[1];
        try {
          const userProfile = await spotify.request(spotifyUserId, `/users/${resolvedUserId}`, 'GET');
          resolvedDisplayName = userProfile.display_name || pending.aliasName;
        } catch (e) {
          resolvedDisplayName = pending.aliasName;
        }
      } else {
        const res = await spotify.resolveUserDisplayName(spotifyUserId, spotifyInput);
        resolvedUserId = res.spotifyUserId;
        resolvedDisplayName = res.spotifyDisplayName;
      }

      // Save mapping persistently
      memoryManager.setAlias(pending.aliasName, resolvedUserId, resolvedDisplayName);
      memoryManager.clearPending(message.author.id);

      await loadingMsg.edit(`✅ Memory updated! Mapped **${pending.aliasName}** to Spotify user **${resolvedDisplayName}**.`);

      // Automatically trigger instant playlist playback!
      const autoPlayMsg = await message.reply(`🎵 Instantly spinning **${resolvedDisplayName}**'s playlist matching "${pending.targetQuery}"...`);
      try {
        await ensureVoiceConnected(message, spotifyUserId);
        const result = await spotify.playUserPlaylist(spotifyUserId, resolvedUserId, pending.targetQuery);
        await autoPlayMsg.edit(`🎶 Playing **${result.playlistName}** by **${resolvedDisplayName}** on **${result.deviceName}**.`);
        setTimeout(() => autoPlayMsg.delete().catch(() => {}), 5000);
      } catch (playErr) {
        await autoPlayMsg.edit(`❌ Failed to auto-play playlist: ${playErr.message}`);
        setTimeout(() => autoPlayMsg.delete().catch(() => {}), 5000);
      }

    } catch (err) {
      console.error('[Bot] Conversational learning failed:', err.message);
      await loadingMsg.edit(`❌ Failed to learn mapping: ${err.message}. Try again, or reply "cancel".`);
    }
    return;
  }

  // Route request semantically (either via AI or rule-based fallback)
  const parsed = await classifyIntent(cleanContent);
  console.log(`[SemanticParser] User: "${cleanContent}" -> Classified Intent: ${parsed.intent}`);

  // Send the AI custom high-vibe response if generated!
  if (parsed.response) {
    const aiDJMsg = await message.reply(parsed.response);
    setTimeout(() => aiDJMsg.delete().catch(() => {}), 5000);
  }

  // Intercept PLAY intents that match a known friend alias
  if (parsed.intent === 'PLAY' && parsed.query) {
    const potentialAlias = parsed.query.toLowerCase().trim();
    const resolved = memoryManager.resolveAlias(potentialAlias);
    if (resolved) {
      parsed.intent = 'FRIEND_PLAY';
      parsed.friend = potentialAlias;
      parsed.target = 'playlist';
    }
  }

  // ----------------------------------------------------
  // INTENT HANDLERS
  // ----------------------------------------------------

  // 1. INTENT: GREET
  if (parsed.intent === 'GREET') {
    return message.reply('👋 Yo! Ask me to `play [song/vibe]`, `play drew\'s playlist`, queue, adjust filters (`boost the bass`, `speed up`), or link with `login`!');
  }

  // 2. INTENT: LOGIN
  if (parsed.intent === 'LOGIN') {
    const loginUrl = spotify.getLoginUrl(message.author.id);
    return message.reply({ content: `Link your Spotify: [Authorize Spotify](${loginUrl})` });
  }

  // 3. INTENT: STATUS
  if (parsed.intent === 'STATUS') {
    const state = await spotify.getPlaybackState(spotifyUserId);
    if (state && state.track) {
      return message.reply(`🎶 Now playing: **${state.track.name}** by **${state.track.artists}** [${state.isPlaying ? 'Active' : 'Paused'}]`);
    } else {
      return message.reply('🛑 Spotify is currently inactive or not playing on your host client.');
    }
  }

  // 4. INTENT: STOP
  if (parsed.intent === 'STOP') {
    const loadingMsg = await message.reply('🔌 Stopping streaming and disconnecting...');
    try {
      const device = await spotify.findTargetDevice(spotifyUserId);
      const deviceId = device ? device.id : null;
      await spotify.pause(spotifyUserId, deviceId).catch(() => {});
      cleanupVoiceConnection();
      await loadingMsg.edit('🛑 Disconnected and paused Spotify.');
      setTimeout(() => loadingMsg.delete().catch(() => {}), 5000);
    } catch (e) {
      cleanupVoiceConnection();
      await loadingMsg.edit('🔌 Disconnected from voice.');
      setTimeout(() => loadingMsg.delete().catch(() => {}), 5000);
    }
    return;
  }

  // 5. INTENT: QUEUE
  if (parsed.intent === 'QUEUE') {
    const rawQuery = parsed.query;
    if (!rawQuery) {
      return message.reply('🎶 Tell me what song you want me to queue! E.g. `@spotinigga queue uk garage`');
    }

    const loadingMsg = await message.reply('🧺 Queueing song on Spotify...');

    try {
      const result = await spotify.queueTrack(spotifyUserId, rawQuery);
      await loadingMsg.edit(`🧺 Queued **${result.matchName}** on **${result.deviceName}**.`);
      setTimeout(() => loadingMsg.delete().catch(() => {}), 5000);
    } catch (err) {
      console.error('[Bot] Message queue command failed:', err.message);
      await loadingMsg.edit(`❌ Failed to queue: ${err.message}`);
      setTimeout(() => loadingMsg.delete().catch(() => {}), 5000);
    }
    return;
  }

  // 6. INTENTS: DYNAMIC LIVE EFFECTS
  if (parsed.intent.startsWith('EFFECT_')) {
    if (!voiceConnection || !audioEngine.isActive()) {
      return message.reply('❌ I must be actively streaming in a voice channel to apply live audio effects!');
    }

    if (parsed.intent === 'EFFECT_BASS') {
      activeEffects.bassboost = !activeEffects.bassboost;
    } else if (parsed.intent === 'EFFECT_SPEEDUP') {
      activeEffects.speed = activeEffects.speed === 1.25 ? 1.0 : 1.25;
    } else if (parsed.intent === 'EFFECT_SLOWED') {
      activeEffects.speed = activeEffects.speed === 0.8 ? 1.0 : 0.8;
    } else if (parsed.intent === 'EFFECT_CLEAR') {
      activeEffects.bassboost = false;
      activeEffects.speed = 1.0;
    }

    const loadingMsg = await message.reply('✨ Modifying live audio filters...');

    try {
      const customDevice = spotify.getUserAudioDevice(spotifyUserId);
      const targetDevice = customDevice || config.audioDevice;

      // Apply seamless stop-and-start capture
      const { resource, readyPromise } = audioEngine.start(targetDevice, activeEffects);
      await readyPromise;
      audioPlayer.play(resource);

      const statusString = [
        `Bass Boost: **${activeEffects.bassboost ? 'ON' : 'OFF'}**`,
        `Speed: **${activeEffects.speed === 1.25 ? '1.25x' : (activeEffects.speed === 0.8 ? '0.8x' : 'Normal')}**`
      ].join(' | ');

      await loadingMsg.edit(`✨ Live effects updated: ${statusString}`);
      setTimeout(() => loadingMsg.delete().catch(() => {}), 5000);
    } catch (err) {
      await loadingMsg.edit(`❌ Failed to apply effects: ${err.message}`);
      setTimeout(() => loadingMsg.delete().catch(() => {}), 5000);
    }
    return;
  }

  // 7. INTENT: FRIEND_PLAY
  if (parsed.intent === 'FRIEND_PLAY') {
    const friendName = parsed.friend;
    const targetQuery = parsed.target || 'playlist';

    const resolved = memoryManager.resolveAlias(friendName);
    if (!resolved) {
      memoryManager.setPending(message.author.id, friendName, targetQuery);
      return message.reply(`🤔 I don't know who **${friendName}** is yet! Teach me by replying: **${friendName} is [Spotify Username/Display Name]** (or send their Spotify profile link).`);
    }

    const loadingMsg = await message.reply(`🎵 Fetching **${resolved.spotifyDisplayName}**'s playlist matching "${targetQuery}"...`);
    try {
      await ensureVoiceConnected(message, spotifyUserId);
      const result = await spotify.playUserPlaylist(spotifyUserId, resolved.spotifyUserId, targetQuery);
      await loadingMsg.edit(`🎶 Playing **${result.playlistName}** by **${resolved.spotifyDisplayName}** on **${result.deviceName}**.`);
      setTimeout(() => loadingMsg.delete().catch(() => {}), 5000);
    } catch (err) {
      console.error('[Bot] FRIEND_PLAY failed:', err.message);
      await loadingMsg.edit(`❌ Failed to play: ${err.message}`);
      setTimeout(() => loadingMsg.delete().catch(() => {}), 5000);
    }
    return;
  }

  // 8. INTENT: PLAY
  if (parsed.intent === 'PLAY') {
    const rawQuery = parsed.query;
    if (!rawQuery) {
      return message.reply('🎶 Tell me what song or vibe you want me to play! E.g. `@spotinigga play uk garage`');
    }

    const loadingMsg = await message.reply('🔍 Searching Spotify...');

    try {
      await ensureVoiceConnected(message, spotifyUserId);

      let result;
      const spotifyLinkRegex = /open\.spotify\.com\/(track|playlist|album|artist)\/([a-zA-Z0-9]+)/i;
      const linkMatch = rawQuery.match(spotifyLinkRegex);

      if (linkMatch) {
        const type = linkMatch[1].toLowerCase();
        const id = linkMatch[2];
        const uri = `spotify:${type}:${id}`;

        const device = await spotify.findTargetDevice(spotifyUserId);
        const deviceId = device ? device.id : null;
        const deviceParam = deviceId ? `?device_id=${deviceId}` : '';

        const playBody = type === 'track' ? { uris: [uri] } : { context_uri: uri };
        await spotify.request(spotifyUserId, `/me/player/play${deviceParam}`, 'PUT', playBody);

        result = {
          success: true,
          matchName: `Spotify Link (${type})`,
          matchType: type,
          deviceName: device ? device.name : 'Active Host Client'
        };
      } else {
        result = await spotify.searchAndPlay(spotifyUserId, rawQuery);
      }

      if (result.success) {
        await loadingMsg.edit(`🎶 Playing **${result.matchName}** on **${result.deviceName}**.`);
        setTimeout(() => loadingMsg.delete().catch(() => {}), 5000);
      }
    } catch (err) {
      console.error('[Bot] Message play command failed:', err.message);
      await loadingMsg.edit(`❌ Failed to play: ${err.message}`);
      setTimeout(() => loadingMsg.delete().catch(() => {}), 5000);
    }
  }
});
