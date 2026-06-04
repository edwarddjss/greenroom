import { REST, Routes, type RESTPostAPIApplicationCommandsJSONBody } from 'discord.js';
import { config } from './config.js';

const commands: RESTPostAPIApplicationCommandsJSONBody[] = [
  { name: 'login', description: 'Link your Spotify Premium account to the bot' },
  { name: 'play', description: 'Start streaming your active Spotify session into the voice channel' },
  {
    name: 'queue',
    description: 'Queue a song or playlist in Spotify',
    options: [{ name: 'query', description: 'Song name, Spotify track/playlist link, or URI', type: 3, required: true }],
  },
  { name: 'clearqueue', description: 'Clear the pending Spotify queue where Spotify Connect allows it' },
  { name: 'stop', description: 'Stop streaming and pause Spotify playback' },
  {
    name: 'effect',
    description: 'Apply live DSP audio effects (Bass Boost, Speed Up, Slowed)',
    options: [
      {
        name: 'type',
        description: 'The effect to apply',
        type: 3,
        required: true,
        choices: [
          { name: 'Bass Boost (Toggle)', value: 'bassboost' },
          { name: 'Speed Up (1.25x)', value: 'speedup' },
          { name: 'Slow Down (0.8x)', value: 'slowed' },
          { name: 'Clear All Effects', value: 'clear' },
        ],
      },
    ],
  },
];

if (!config.discordToken || !config.discordClientId) {
  console.error('\x1b[31m[Error] DISCORD_TOKEN or DISCORD_CLIENT_ID is missing.\x1b[0m');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(config.discordToken);

async function register(): Promise<void> {
  try {
    console.log(`[Deploy] Refreshing ${commands.length} application (/) commands...`);
    if (config.discordGuildId) {
      console.log(`[Deploy] Registering to guild ${config.discordGuildId} (instant)...`);
      await rest.put(Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId), { body: commands });
      console.log('\x1b[32m[Deploy] Guild commands registered.\x1b[0m');
    } else {
      console.log('[Deploy] Registering globally (may take up to an hour)...');
      await rest.put(Routes.applicationCommands(config.discordClientId), { body: commands });
      console.log('\x1b[32m[Deploy] Global commands registered.\x1b[0m');
    }
    process.exit(0);
  } catch (error) {
    console.error('[Deploy] Failed to register commands:', error);
    process.exit(1);
  }
}

void register();
