#!/usr/bin/env node
import { chromium } from 'playwright';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import path from 'node:path';

const root = process.cwd();
const profileDir = path.join(root, '.guide-recorder', 'browser-profile');
const browserPath = process.argv.find((arg) => arg.startsWith('--browser-path='))?.split('=').slice(1).join('=');
const rl = createInterface({ input, output });
const context = await chromium.launchPersistentContext(profileDir, {
  executablePath: browserPath,
  channel: browserPath ? undefined : 'chrome',
  headless: false,
  viewport: { width: 1280, height: 800 },
});
const page = await context.newPage();
for (const oldPage of context.pages()) {
  if (oldPage !== page) await oldPage.close().catch(() => {});
}
await page.goto('https://developer.spotify.com/dashboard', { waitUntil: 'domcontentloaded', timeout: 45000 });
console.log('Log in to Spotify in the opened Chrome window. Stop on the Developer Dashboard page.');
await rl.question('Press Enter here after the Spotify Developer Dashboard is visible...');
await context.close();
rl.close();
