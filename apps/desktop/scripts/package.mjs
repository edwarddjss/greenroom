import { run, pnpm } from './run.mjs';

await run(pnpm, ['run', 'build']);
await run(pnpm, ['exec', 'electron-builder', '--win', '--x64']);
