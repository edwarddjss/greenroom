import { REST, Routes } from 'discord.js';
import { config } from './config.js';

const commands = [
  {
    name: 'login',
    description: 'Link your Spotify Premium account to the bot'
  },
  {
    name: 'play',
    description: 'Start streaming your active Spotify session into the voice channel'
  },
  {
    name: 'queue',
    description: 'Queue a song to play next in Spotify',
    options: [
      {
        name: 'query',
        description: 'Song name, Spotify track link, or Spotify track URI',
        type: 3, // String
        required: true
      }
    ]
  },
  {
    name: 'stop',
    description: 'Stop streaming and pause Spotify playback'
  },
  {
    name: 'effect',
    description: 'Apply live DSP audio effects (Bass Boost, Speed Up, Slowed)',
    options: [
      {
        name: 'type',
        description: 'The effect to apply',
        type: 3, // String
        required: true,
        choices: [
          { name: 'Bass Boost (Toggle)', value: 'bassboost' },
          { name: 'Speed Up (1.25x)', value: 'speedup' },
          { name: 'Slow Down (0.8x)', value: 'slowed' },
          { name: 'Clear All Effects', value: 'clear' }
        ]
      }
    ]
  }
];

if (!config.discordToken || !config.discordClientId) {
  console.error('\x1b[31m[Error] Cannot register commands. DISCORD_TOKEN or DISCORD_CLIENT_ID is missing from your .env file!\x1b[0m');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(config.discordToken);

(async () => {
  try {
    console.log(`[Deploy] Started refreshing ${commands.length} application (/) commands...`);

    if (config.discordGuildId) {
      // Register commands instantly to a specific guild (development mode)
      console.log(`[Deploy] Registering commands in DEVELOPMENT GUILD mode to Guild: ${config.discordGuildId}`);
      await rest.put(
        Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId),
        { body: commands }
      );
      console.log('\x1b[32m[Deploy] Successfully reloaded (/) commands for development guild!\x1b[0m');
    } else {
      // Register commands globally (production mode)
      console.log('[Deploy] Registering commands in GLOBAL mode (may take up to an hour to propagate)...');
      await rest.put(
        Routes.applicationCommands(config.discordClientId),
        { body: commands }
      );
      console.log('\x1b[32m[Deploy] Successfully reloaded (/) commands globally across all servers!\x1b[0m');
    }
  } catch (error) {
    console.error('[Deploy] Failed to register slash commands:', error);
  }
})();
