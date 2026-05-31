import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const memoryFilePath = path.join(__dirname, 'memory.json');

class MemoryManager {
  constructor() {
    this.memory = {
      aliases: {},
      pending: {}
    };
    this.loadMemory();
  }

  loadMemory() {
    try {
      if (fs.existsSync(memoryFilePath)) {
        const data = fs.readFileSync(memoryFilePath, 'utf8');
        this.memory = JSON.parse(data);
        if (!this.memory.aliases) this.memory.aliases = {};
        if (!this.memory.pending) this.memory.pending = {};
      } else {
        this.saveMemory();
      }
    } catch (e) {
      console.error('[Memory] Failed to load memory.json, starting fresh:', e.message);
    }
  }

  saveMemory() {
    try {
      fs.writeFileSync(memoryFilePath, JSON.stringify(this.memory, null, 2), 'utf8');
    } catch (e) {
      console.error('[Memory] Failed to save memory.json:', e.message);
    }
  }

  // Resolve alias case-insensitively
  resolveAlias(aliasName) {
    if (!aliasName) return null;
    const lowerAlias = aliasName.toLowerCase().trim();
    return this.memory.aliases[lowerAlias] || null;
  }

  // Set persistent alias mapping
  setAlias(aliasName, spotifyUserId, spotifyDisplayName) {
    const lowerAlias = aliasName.toLowerCase().trim();
    this.memory.aliases[lowerAlias] = {
      spotifyUserId,
      spotifyDisplayName
    };
    this.saveMemory();
  }

  // Track what alias a user wanted to play so we can auto-resume after they teach the bot
  setPending(discordUserId, aliasName, targetQuery) {
    this.memory.pending[discordUserId] = {
      aliasName,
      targetQuery,
      timestamp: Date.now()
    };
    this.saveMemory();
  }

  getPending(discordUserId) {
    const pending = this.memory.pending[discordUserId];
    // Expire pending associations after 5 minutes to avoid stale contexts
    if (pending && Date.now() - pending.timestamp < 300000) {
      return pending;
    }
    return null;
  }

  clearPending(discordUserId) {
    delete this.memory.pending[discordUserId];
    this.saveMemory();
  }
}

export const memoryManager = new MemoryManager();
