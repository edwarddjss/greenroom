import type { ParsedIntent } from '../types.js';
import { localLlmProvider } from './local-llm.js';
import { ruleBasedProvider } from './rule-based.js';
import type { NluProvider } from './types.js';

/**
 * Routes free-text @mention messages through the embedded LLM first, falling
 * back to the always-available rule-based parser. No external API key required.
 */
class NluRouter {
  private readonly providers: NluProvider[] = [localLlmProvider, ruleBasedProvider];

  /** Pre-load the local model in the background so the first message is fast. */
  async warmup(): Promise<void> {
    await localLlmProvider.init();
  }

  async classify(content: string): Promise<ParsedIntent> {
    for (const provider of this.providers) {
      const result = await provider.classify(content);
      if (result) return result;
    }
    // The rule-based provider never returns null, so this is unreachable in
    // practice; keep an explicit safety net for the type system.
    return { intent: 'PLAY', query: content };
  }
}

export const nluRouter = new NluRouter();
export { downloadModel, isModelPresent } from './model.js';
