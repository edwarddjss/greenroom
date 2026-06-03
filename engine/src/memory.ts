import { config } from './config.js';
import { loadJson, saveJson } from './store.js';
import type { AliasEntry, MemoryState, PendingLearn } from './types.js';

const PENDING_TTL_MS = 5 * 60 * 1000;

class MemoryManager {
  private memory: MemoryState = { aliases: {}, pending: {} };

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      // Aliases carry no secrets, so the memory store stays plaintext.
      const loaded = loadJson<Partial<MemoryState>>(config.memoryStorePath, null, {});
      this.memory = {
        aliases: loaded.aliases ?? {},
        pending: loaded.pending ?? {},
      };
    } catch (error) {
      console.error('[Memory] Failed to load memory store, starting fresh:', (error as Error).message);
    }
  }

  private save(): void {
    try {
      saveJson(config.memoryStorePath, null, this.memory);
    } catch (error) {
      console.error('[Memory] Failed to save memory store:', (error as Error).message);
    }
  }

  resolveAlias(aliasName: string | null | undefined): AliasEntry | null {
    if (!aliasName) return null;
    return this.memory.aliases[aliasName.toLowerCase().trim()] ?? null;
  }

  setAlias(aliasName: string, spotifyUserId: string, spotifyDisplayName: string): void {
    this.memory.aliases[aliasName.toLowerCase().trim()] = { spotifyUserId, spotifyDisplayName };
    this.save();
  }

  setPending(discordUserId: string, aliasName: string, targetQuery: string): void {
    this.memory.pending[discordUserId] = { aliasName, targetQuery, timestamp: Date.now() };
    this.save();
  }

  getPending(discordUserId: string): PendingLearn | null {
    const pending = this.memory.pending[discordUserId];
    if (pending && Date.now() - pending.timestamp < PENDING_TTL_MS) return pending;
    return null;
  }

  clearPending(discordUserId: string): void {
    delete this.memory.pending[discordUserId];
    this.save();
  }
}

export const memoryManager = new MemoryManager();
