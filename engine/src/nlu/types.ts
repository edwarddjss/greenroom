import type { ParsedIntent } from '../types.js';

/** A natural-language intent classifier. Providers are tried in priority order. */
export interface NluProvider {
  readonly name: string;
  /** True when the provider can serve a request right now. */
  isReady(): boolean;
  /** Returns a parsed intent, or null to defer to the next provider. */
  classify(content: string): Promise<ParsedIntent | null>;
}
