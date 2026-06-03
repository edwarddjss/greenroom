#!/usr/bin/env node
import { chromium } from 'playwright';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const profileDir = path.join(rootDir, '.guide-recorder', 'browser-profile');
const rawDir = path.join(rootDir, '.guide-recorder', 'raw');
const outDir = path.join(rootDir, 'apps', 'desktop', 'src', 'renderer', 'public', 'guides');

const GUIDES = {
  discord: {
    file: 'discord-bot.webm',
    url: 'https://discord.com/developers/applications',
    title: 'Discord bot setup',
    steps: [
      'Log in if needed. Use a demo app/account if possible. Press Enter when the applications page is visible.',
      'Create or open the application that will run greenroom. Press Enter when the application overview is visible.',
      'Open General Information and point to the Application ID location. Do not copy private data into the recording. Press Enter when ready.',
      'Open Bot, show where Reset Token / Copy Token lives, but do not reveal a real token. Press Enter when ready.',
      'Show Privileged Gateway Intents and enable Message Content Intent. Press Enter when ready.',
      'End on the Bot page with token values hidden. Press Enter to finish recording.',
    ],
  },
  spotify: {
    file: 'spotify-app.webm',
    url: 'https://developer.spotify.com/dashboard',
    title: 'Spotify app setup',
    steps: [
      'Log in if needed. Use a demo app/account if possible. Press Enter when the dashboard is visible.',
      'Create or open the Spotify application for greenroom. Press Enter when the app page is visible.',
      'Open Settings and show where Redirect URIs are configured. Press Enter when ready.',
      'Show where the greenroom /callback redirect URI should be pasted. Press Enter when ready.',
      'Show where Client ID and Client Secret are located. Keep secret values hidden. Press Enter when ready.',
      'End on the settings page with secrets hidden. Press Enter to finish recording.',
    ],
  },
};

function parseArgs() {
  const args = new Set(process.argv.slice(2));
  const guideArg = process.argv.find((arg) => arg.startsWith('--guide='));
  const loginArg = process.argv.find((arg) => arg.startsWith('--login='));
  const guide = guideArg?.split('=')[1] ?? 'all';
  return {
    guide,
    login: loginArg?.split('=')[1] ?? null,
    list: args.has('--list'),
  };
}

async function pause(rl, message) {
  await rl.question(`\n${message}\nPress Enter to continue...`);
}

async function addPrivacyMask(page) {
  await page.addStyleTag({
    content: `
      input[type="password"],
      input[name*="secret" i],
      input[id*="secret" i],
      input[aria-label*="secret" i],
      input[aria-label*="token" i],
      textarea,
      [class*="secret" i],
      [class*="token" i],
      [data-testid*="secret" i],
      [data-testid*="token" i] {
        filter: blur(9px) !important;
      }
    `,
  }).catch(() => {});
}

async function recordGuide(id, guide, rl) {
  fs.mkdirSync(rawDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(profileDir, { recursive: true });

  console.log(`\nRecording ${guide.title}`);
  console.log(`Output: ${path.relative(rootDir, path.join(outDir, guide.file))}`);
  console.log('Use a demo account/app if possible. Do not reveal real token or secret values.');

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    recordVideo: {
      dir: rawDir,
      size: { width: 1280, height: 800 },
    },
  });

  const page = context.pages()[0] ?? await context.newPage();
  await page.goto(guide.url, { waitUntil: 'domcontentloaded' });
  await addPrivacyMask(page);

  for (const [index, step] of guide.steps.entries()) {
    await pause(rl, `${index + 1}/${guide.steps.length}: ${step}`);
    await addPrivacyMask(page);
  }

  const video = page.video();
  await page.close();
  await context.close();

  if (!video) {
    throw new Error(`No video was recorded for ${id}.`);
  }
  const rawPath = await video.path();
  const finalPath = path.join(outDir, guide.file);
  fs.copyFileSync(rawPath, finalPath);
  console.log(`Saved ${path.relative(rootDir, finalPath)}`);
}

async function prepareLogin(id, guide, rl) {
  fs.mkdirSync(profileDir, { recursive: true });

  console.log(`\nOpening ${guide.title} login session`);
  console.log('This step is not recorded. Log in, finish any 2FA, then return here.');

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
  });

  const page = context.pages()[0] ?? await context.newPage();
  await page.goto(guide.url, { waitUntil: 'domcontentloaded' });
  await addPrivacyMask(page);
  await pause(rl, `Log in to ${id} in the browser window. Stop on the developer dashboard page.`);
  await context.close();
  console.log(`${guide.title} session saved.`);
}

async function main() {
  const args = parseArgs();
  if (args.list) {
    console.log(Object.keys(GUIDES).join('\n'));
    return;
  }

  if (args.login) {
    const guide = GUIDES[args.login];
    if (!guide) {
      throw new Error(`Unknown login target "${args.login}". Use --list to see available guides.`);
    }
    const rl = createInterface({ input, output });
    try {
      await prepareLogin(args.login, guide, rl);
    } finally {
      rl.close();
    }
    return;
  }

  const ids = args.guide === 'all' ? Object.keys(GUIDES) : [args.guide];
  for (const id of ids) {
    if (!GUIDES[id]) {
      throw new Error(`Unknown guide "${id}". Use --list to see available guides.`);
    }
  }

  const rl = createInterface({ input, output });
  try {
    await pause(
      rl,
      [
        'This recorder opens a real browser and records your actions.',
        'You will need to log in manually if the portal asks.',
        'Use demo apps/accounts where possible and avoid exposing real secrets.',
        'Close unrelated browser tabs before continuing.',
      ].join('\n'),
    );
    for (const id of ids) {
      await recordGuide(id, GUIDES[id], rl);
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
