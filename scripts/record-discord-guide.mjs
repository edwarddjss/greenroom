#!/usr/bin/env node
import { chromium } from 'playwright';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const profileDir = path.join(root, '.guide-recorder', 'browser-profile');
const rawDir = path.join(root, '.guide-recorder', 'raw');
const outDir = path.join(root, 'apps', 'desktop', 'src', 'renderer', 'public', 'guides');
const browserPath = process.argv.find((arg) => arg.startsWith('--browser-path='))?.split('=').slice(1).join('=');
const mode = process.argv.find((arg) => arg.startsWith('--mode='))?.split('=')[1] ?? 'existing';

fs.mkdirSync(rawDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

async function setupPage(page, opts = {}) {
  await page
    .addStyleTag({
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
          filter: blur(10px) !important;
        }
        #greenroom-guide-callout {
          pointer-events: none;
          position: fixed;
          right: 28px;
          top: 28px;
          z-index: 2147483647;
          max-width: 360px;
          padding: 14px 16px;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,.18);
          background: rgba(15,18,24,.94);
          color: #fff;
          font: 600 16px/1.35 system-ui, -apple-system, Segoe UI, sans-serif;
          box-shadow: 0 18px 60px rgba(0,0,0,.38);
        }
        #greenroom-guide-callout small {
          display: block;
          margin-top: 5px;
          color: rgba(255,255,255,.68);
          font-size: 13px;
          font-weight: 500;
        }
        .greenroom-guide-focus {
          outline: 3px solid #1DB954 !important;
          outline-offset: 4px !important;
          border-radius: 8px !important;
        }
        ${
          opts.hideApplicationCards
            ? `
        a[href^="/developers/applications/"] {
          visibility: hidden !important;
        }
        `
            : ''
        }
      `,
    })
    .catch(() => {});
}

async function callout(page, title, detail = '', ms = 1400) {
  await page.evaluate(
    ({ title, detail }) => {
      document.querySelector('#greenroom-guide-callout')?.remove();
      const box = document.createElement('div');
      box.id = 'greenroom-guide-callout';
      box.innerHTML = `${title}${detail ? `<small>${detail}</small>` : ''}`;
      document.body.appendChild(box);
    },
    { title, detail },
  );
  await page.waitForTimeout(ms);
}

async function clearCallout(page) {
  await page.evaluate(() => document.querySelector('#greenroom-guide-callout')?.remove()).catch(() => {});
}

async function muteSensitiveIds(page) {
  await page
    .evaluate(() => {
      for (const el of document.querySelectorAll('body *')) {
        const text = el.textContent?.trim() ?? '';
        if (/^\d{17,20}$/.test(text)) {
          el.style.filter = 'blur(8px)';
          el.style.opacity = '0.44';
        }
      }
    })
    .catch(() => {});
}

async function focusLocator(page, locator) {
  await page
    .evaluate(() => document.querySelectorAll('.greenroom-guide-focus').forEach((el) => el.classList.remove('greenroom-guide-focus')))
    .catch(() => {});
  await locator
    .first()
    .evaluate((el) => el.classList.add('greenroom-guide-focus'))
    .catch(() => {});
}

async function launch(recordVideo = true) {
  return chromium.launchPersistentContext(profileDir, {
    executablePath: browserPath,
    channel: browserPath ? undefined : 'chrome',
    headless: false,
    viewport: { width: 1280, height: 800 },
    ...(recordVideo ? { recordVideo: { dir: rawDir, size: { width: 1280, height: 800 } } } : {}),
  });
}

async function freshPage(context) {
  const page = await context.newPage();
  for (const oldPage of context.pages()) {
    if (oldPage !== page) await oldPage.close().catch(() => {});
  }
  return page;
}

async function saveVideo(page, context, name) {
  const video = page.video();
  await page.close();
  await context.close();
  if (!video) throw new Error(`No video recorded for ${name}.`);
  const rawPath = await video.path();
  const finalPath = path.join(outDir, name);
  fs.copyFileSync(rawPath, finalPath);
  return finalPath;
}

async function latestGreenroomAppHref(page) {
  await page.goto('https://discord.com/developers/applications', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(2000);
  return (
    (await page
      .locator('a[href^="/developers/applications/"]')
      .filter({ hasText: /greenroom/i })
      .first()
      .getAttribute('href')
      .catch(() => null)) ??
    (await page
      .locator('a[href^="/developers/applications/"]')
      .first()
      .getAttribute('href')
      .catch(() => null))
  );
}

async function recordCreateSegment() {
  const context = await launch(true);
  const page = await freshPage(context);

  await page.goto('https://discord.com/developers/applications', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await setupPage(page, { hideApplicationCards: true });
  await page.waitForTimeout(1500);
  await callout(page, 'Open the Discord Developer Portal', 'Start on Applications, then create a new application for greenroom.');

  const newApp = page.getByRole('button', { name: /^New Application$/i });
  await focusLocator(page, newApp);
  await callout(page, 'Click New Application', 'This creates the Discord app that owns the bot token and application ID.');
  await newApp.click();
  await page.waitForTimeout(800);
  await setupPage(page);

  const dialog = page.locator('[role="dialog"]').last();
  const nameInput = dialog.locator('input[name="name"]');
  await focusLocator(page, nameInput);
  await nameInput.fill('greenroom');
  await callout(page, 'Name the application', 'Use greenroom or another name your server members will recognize.');

  await dialog.locator('input[type="checkbox"]').check({ force: true });
  await callout(page, 'Accept Discord developer terms', 'Discord requires this before creating the app.');
  const createButton = dialog.getByRole('button', { name: /^Create$/i });
  await focusLocator(page, createButton);
  await callout(page, 'Click Create', 'Discord may ask for a human check. Complete it, then the app opens.');
  return saveVideo(page, context, 'discord-create-part.webm');
}

async function openCreateFlowForUser(rl) {
  const context = await launch(false);
  const page = await freshPage(context);
  await page.goto('https://discord.com/developers/applications', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: /^New Application$/i }).click();
  await page.waitForTimeout(700);
  const dialog = page.locator('[role="dialog"]').last();
  await dialog.locator('input[name="name"]').fill('greenroom');
  await dialog.locator('input[type="checkbox"]').check({ force: true });
  console.log('Chrome is ready at the Discord Create button. Click Create and complete any human check.');
  await rl.question('Press Enter here after the greenroom app page is visible...');
  await context.close();
}

async function recordAppSegment(existingAppHref) {
  const context = await launch(true);
  const page = await freshPage(context);

  await page.goto(new URL(existingAppHref, 'https://discord.com').toString(), { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForURL(/\/developers\/applications\/\d+\/information/, { timeout: 30_000 });

  await setupPage(page);
  await muteSensitiveIds(page);
  await page.waitForTimeout(1600);
  const appIdLabel = page.getByText('Application ID', { exact: true });
  await appIdLabel.scrollIntoViewIfNeeded().catch(() => {});
  await focusLocator(page, appIdLabel);
  await callout(page, 'Copy the Application ID', 'Paste this into greenroom as the Discord Application ID.', 2200);
  await clearCallout(page);

  await page.locator('a[href$="/bot"]').first().click();
  await page.waitForURL(/\/bot$/, { timeout: 30_000 });
  await setupPage(page);
  await page.waitForTimeout(1600);

  const resetToken = page.getByRole('button', { name: /Reset Token/i });
  await resetToken.scrollIntoViewIfNeeded().catch(() => {});
  await focusLocator(page, resetToken);
  await callout(page, 'Bot token lives here', 'Use Reset Token / Copy Token when setting up greenroom. Never share this token publicly.', 2600);
  await clearCallout(page);

  const messageContent = page.getByText('Message Content Intent', { exact: true });
  await messageContent.scrollIntoViewIfNeeded().catch(() => {});
  await focusLocator(page, messageContent);
  await callout(page, 'Enable Message Content Intent', 'greenroom needs this so mention commands and text commands work correctly.', 2400);
  await page.waitForTimeout(700);
  return saveVideo(page, context, 'discord-settings-part.webm');
}

try {
  const rl = createInterface({ input, output });
  try {
    if (mode === 'create-only') {
      const createPart = await recordCreateSegment();
      console.log(`Saved ${path.relative(root, createPart)}`);
    } else {
      if (mode === 'from-scratch') {
        const createPart = await recordCreateSegment();
        console.log(`Saved ${path.relative(root, createPart)}`);
        await openCreateFlowForUser(rl);
      }

      const context = await launch(false);
      const page = await freshPage(context);
      const existingAppHref = await latestGreenroomAppHref(page);
      await context.close();
      if (!existingAppHref) throw new Error('No Discord application is available for the guide settings steps.');

      const settingsPart = await recordAppSegment(existingAppHref);
      console.log(`Saved ${path.relative(root, settingsPart)}`);
      if (mode !== 'settings-only') {
        console.log('Discord guide parts are ready. Concatenate discord-create-part.webm and discord-settings-part.webm.');
      }
    }
  } finally {
    rl.close();
  }
} catch (err) {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
}
