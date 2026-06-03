#!/usr/bin/env node
import { chromium } from 'playwright';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import path from 'node:path';

const root = process.cwd();
const profileDir = path.join(root, '.guide-recorder', 'browser-profile');
const browserPath = process.argv.find((arg) => arg.startsWith('--browser-path='))?.split('=').slice(1).join('=');

async function listDemoApps(page) {
  await page.goto('https://discord.com/developers/applications', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(2000);
  return page.locator('a[href^="/developers/applications/"]').evaluateAll((nodes) =>
    nodes
      .map((node) => ({
        name: (node.textContent ?? '').trim().split('\n').pop()?.trim() ?? '',
        href: node.getAttribute('href') ?? '',
      }))
      .filter((app) => /^greenroom guide demo\b/i.test(app.name)),
  );
}

const rl = createInterface({ input, output });
const context = await chromium.launchPersistentContext(profileDir, {
  executablePath: browserPath,
  channel: browserPath ? undefined : 'chrome',
  headless: false,
  viewport: { width: 1280, height: 800 },
});
const page = context.pages()[0] ?? (await context.newPage());

try {
  let apps = await listDemoApps(page);
  if (apps.length === 0) {
    console.log('No greenroom guide demo apps found.');
    await context.close();
    process.exit(0);
  }

  for (const app of apps) {
    console.log(`Deleting ${app.name}...`);
    await page.goto(new URL(`${app.href}/information`, 'https://discord.com').toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });
    await page.waitForTimeout(1500);
    const deleteButton = page.getByRole('button', { name: /Delete App/i }).last();
    await deleteButton.scrollIntoViewIfNeeded().catch(() => {});
    await deleteButton.click();
    await page.waitForTimeout(700);
    const dialog = page.locator('[role="dialog"]').last();
    await dialog.locator('input[name="appName"]').fill(app.name);
    await dialog.getByRole('button', { name: /Delete App/i }).click({ force: true });
    await page.waitForTimeout(1500);

    console.log(`If Chrome asks for 2FA, complete it for ${app.name}.`);
    await rl.question('Press Enter here after the app is deleted or after you complete the 2FA prompt...');
  }

  apps = await listDemoApps(page);
  if (apps.length > 0) {
    console.log('Still present:');
    for (const app of apps) console.log(`- ${app.name}`);
  } else {
    console.log('All greenroom guide demo apps are deleted.');
  }
} finally {
  rl.close();
  await context.close().catch(() => {});
}
