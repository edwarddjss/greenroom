#!/usr/bin/env node
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const profileDir = path.join(root, '.guide-recorder', 'browser-profile');
const rawDir = path.join(root, '.guide-recorder', 'raw');
const outDir = path.join(root, 'apps', 'desktop', 'src', 'renderer', 'public', 'guides');
const browserPath = process.argv.find((arg) => arg.startsWith('--browser-path='))?.split('=').slice(1).join('=');

fs.mkdirSync(rawDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

async function setupPage(page) {
  await page
    .addStyleTag({
      content: `
        input[type="password"],
        input[name*="client" i],
        input[id*="client" i],
        [aria-label*="client" i],
        input[name*="secret" i],
        input[id*="secret" i],
        [aria-label*="secret" i],
        [data-testid*="secret" i],
        [class*="secret" i] {
          filter: blur(10px) !important;
        }
        #greenroom-guide-callout {
          pointer-events: none;
          position: fixed;
          right: 28px;
          top: 28px;
          z-index: 2147483647;
          max-width: 380px;
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
      `,
    })
    .catch(() => {});
}

async function callout(page, title, detail = '', ms = 1700) {
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

async function focusLocator(page, locator) {
  await page
    .evaluate(() => document.querySelectorAll('.greenroom-guide-focus').forEach((el) => el.classList.remove('greenroom-guide-focus')))
    .catch(() => {});
  await locator
    .first()
    .evaluate((el) => el.classList.add('greenroom-guide-focus'))
    .catch(() => {});
}

async function muteExistingLocalRedirects(page) {
  await page
    .evaluate(() => {
      for (const el of document.querySelectorAll('body *')) {
        const text = el.textContent?.trim() ?? '';
        if (text.includes('127.0.0.1') || text.includes('localhost')) {
          if (el.children.length === 0 || el.tagName === 'INPUT') {
            el.style.filter = 'blur(8px)';
            el.style.opacity = '0.42';
          }
        }
      }
    })
    .catch(() => {});
}

async function muteSensitiveIds(page) {
  await page
    .evaluate(() => {
      for (const el of document.querySelectorAll('body *')) {
        const text = el.textContent?.trim() ?? '';
        if (/^[a-f0-9]{24,40}$/i.test(text)) {
          el.style.filter = 'blur(8px)';
          el.style.opacity = '0.44';
        }
      }
    })
    .catch(() => {});
}

async function freshPage(context) {
  const page = await context.newPage();
  for (const oldPage of context.pages()) {
    if (oldPage !== page) await oldPage.close().catch(() => {});
  }
  return page;
}

const context = await chromium.launchPersistentContext(profileDir, {
  executablePath: browserPath,
  channel: browserPath ? undefined : 'chrome',
  headless: false,
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: rawDir, size: { width: 1280, height: 800 } },
});

const page = await freshPage(context);

try {
  await page.goto('https://developer.spotify.com/dashboard', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await setupPage(page);
  await page.waitForTimeout(2500);

  const appLink = page.locator('a[href^="/dashboard/"]').filter({ hasText: /greenroom/i }).first();
  if (!(await appLink.count())) throw new Error('No greenroom Spotify app found in the dashboard.');
  await focusLocator(page, appLink);
  await callout(page, 'Open your Spotify app', 'Create a new app if needed, or open the greenroom app you already made.', 2200);
  await clearCallout(page);
  await appLink.click();
  await page.waitForURL(/\/dashboard\/[a-f0-9]+$/, { timeout: 30_000 });
  await setupPage(page);
  await muteSensitiveIds(page);
  await page.waitForTimeout(1800);

  const clientIdLabel = page.getByText('Client ID', { exact: true });
  await focusLocator(page, clientIdLabel);
  await callout(page, 'Copy the Client ID', 'Paste this into greenroom as the Spotify Client ID.', 2200);
  await clearCallout(page);

  const secretButton = page.getByRole('button', { name: /View client secret/i });
  await focusLocator(page, secretButton);
  await callout(page, 'Client Secret lives here', 'Click View client secret, then paste the secret into greenroom. Do not share it publicly.', 2500);
  await clearCallout(page);

  const editButton = page.getByRole('button', { name: /^Edit$/i });
  await focusLocator(page, editButton);
  await callout(page, 'Open app settings', 'Redirect URIs are configured inside Edit.', 1700);
  await editButton.click();
  await page.waitForTimeout(1600);
  await setupPage(page);
  await muteExistingLocalRedirects(page);

  const redirectLabel = page.getByText('Redirect URIs*', { exact: false }).first();
  await redirectLabel.scrollIntoViewIfNeeded().catch(() => {});
  await focusLocator(page, redirectLabel);
  await callout(page, 'Find Redirect URIs', 'Use the public callback URL shown in greenroom, ending in /callback.', 1800);
  await clearCallout(page);

  const redirectInput = page.locator('input[name="newRedirectUri"]').first();
  await redirectInput.scrollIntoViewIfNeeded().catch(() => {});
  await redirectInput.fill('https://your-tunnel.trycloudflare.com/callback');
  await focusLocator(page, redirectInput);
  await callout(page, 'Paste the greenroom redirect here', 'Click Add, then Save. Do not use localhost for friends outside your PC.', 2600);
  await clearCallout(page);

  const addButton = page.getByRole('button', { name: /^Add$/i }).first();
  await focusLocator(page, addButton);
  await callout(page, 'Add and Save', 'After adding the redirect URI, save the app before returning to greenroom.', 2200);

  const video = page.video();
  await page.close();
  await context.close();
  if (!video) throw new Error('No video recorded.');
  const rawPath = await video.path();
  const finalPath = path.join(outDir, 'spotify-app.webm');
  fs.copyFileSync(rawPath, finalPath);
  console.log(`Saved ${path.relative(root, finalPath)}`);
} catch (err) {
  await context.close().catch(() => {});
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
}
