import { run, pnpm } from './run.mjs';

await run(pnpm, ['--filter', '@greenroom/shared', 'build']);
await run(pnpm, ['--filter', '@greenroom/engine', 'build']);
await run(pnpm, ['exec', 'electron-vite', 'build']);
