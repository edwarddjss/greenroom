import fs from 'node:fs';
import { z } from 'zod';
import type { ChatHistoryItem, LlamaChatSession, LlamaJsonSchemaGrammar } from 'node-llama-cpp';
import { config } from '../config.js';
import { IntentName, type ParsedIntent } from '../types.js';
import type { NluProvider } from './types.js';

const SYSTEM_PROMPT = `You are the intent router for a Spotify Discord music bot.
Classify the user's message into exactly one intent and extract fields.
Intents: GREET, LOGIN, STATUS, STOP, QUEUE, CLEAR_QUEUE, PLAY, FRIEND_PLAY, EFFECT_BASS, EFFECT_SPEEDUP, EFFECT_SLOWED, EFFECT_CLEAR.
For PLAY and QUEUE, set "query" to the song, artist, or vibe (strip command words).
Use CLEAR_QUEUE when the user asks to clear, empty, flush, or reset the Spotify queue.
For FRIEND_PLAY (e.g. "play drew's playlist"), set "friend" to the name and "target" to what they want.
"response" is a short, upbeat one-line DJ-style acknowledgement.
Leave any unused string field empty.`;

const SCHEMA = {
  type: 'object',
  properties: {
    intent: {
      enum: ['PLAY', 'STOP', 'EFFECT_BASS', 'EFFECT_SPEEDUP', 'EFFECT_SLOWED', 'EFFECT_CLEAR', 'QUEUE', 'CLEAR_QUEUE', 'STATUS', 'LOGIN', 'FRIEND_PLAY', 'GREET'],
    },
    query: { type: 'string' },
    friend: { type: 'string' },
    target: { type: 'string' },
    response: { type: 'string' },
  },
} as const;

const LlmOutput = z.object({
  intent: IntentName,
  query: z.string().optional(),
  friend: z.string().optional(),
  target: z.string().optional(),
  response: z.string().optional(),
});

function normalize(raw: unknown): ParsedIntent | null {
  const parsed = LlmOutput.safeParse(raw);
  if (!parsed.success) return null;
  const out: ParsedIntent = { intent: parsed.data.intent };
  if (parsed.data.query?.trim()) out.query = parsed.data.query.trim();
  if (parsed.data.friend?.trim()) out.friend = parsed.data.friend.trim();
  if (parsed.data.target?.trim()) out.target = parsed.data.target.trim();
  if (parsed.data.response?.trim()) out.response = parsed.data.response.trim();
  return out;
}

async function withModelWarningFilter<T>(fn: () => Promise<T>): Promise<T> {
  const originalWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string | Uint8Array, ...args: unknown[]) => {
    const text = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    if (text.includes('[node-llama-cpp] load: control-looking token')) return true;
    return originalWrite(chunk as string, ...(args as [BufferEncoding?, ((err?: Error | null) => void)?]));
  }) as typeof process.stderr.write;
  try {
    return await fn();
  } finally {
    process.stderr.write = originalWrite as typeof process.stderr.write;
  }
}

type State = 'uninit' | 'loading' | 'ready' | 'failed';

class LocalLlmProvider implements NluProvider {
  readonly name = 'local-llm';
  private state: State = 'uninit';
  private session: LlamaChatSession | null = null;
  private grammar: LlamaJsonSchemaGrammar<typeof SCHEMA> | null = null;
  private baseHistory: ChatHistoryItem[] = [];
  // Serialize prompts: a single chat session cannot run concurrent generations.
  private queue: Promise<unknown> = Promise.resolve();

  isReady(): boolean {
    return this.state === 'ready';
  }

  async init(): Promise<void> {
    if (this.state !== 'uninit') return;
    if (!config.nluEnabled) {
      this.state = 'failed';
      return;
    }
    if (!fs.existsSync(config.nluModelPath)) {
      this.state = 'failed';
      console.log('[NLU] Local model not present; using the rule-based parser.');
      return;
    }
    this.state = 'loading';
    try {
      const { getLlama, LlamaChatSession } = await import('node-llama-cpp');
      const llama = await getLlama();
      const model = await withModelWarningFilter(() => llama.loadModel({ modelPath: config.nluModelPath }));
      const context = await model.createContext({ contextSize: 2048 });
      this.grammar = await llama.createGrammarForJsonSchema(SCHEMA);
      this.session = new LlamaChatSession({ contextSequence: context.getSequence(), systemPrompt: SYSTEM_PROMPT });
      this.baseHistory = this.session.getChatHistory();
      this.state = 'ready';
      console.log('[NLU] Local LLM ready.');
    } catch (err) {
      this.state = 'failed';
      console.warn('[NLU] Local LLM init failed; using the rule-based parser:', (err as Error).message);
    }
  }

  async classify(content: string): Promise<ParsedIntent | null> {
    if (this.state === 'uninit') await this.init();
    const session = this.session;
    const grammar = this.grammar;
    if (this.state !== 'ready' || !session || !grammar) return null;

    const run = this.queue.then(async () => {
      // Reset to the system-prompt-only history so each classification is independent.
      session.setChatHistory(this.baseHistory);
      const raw = await session.prompt(content, { grammar, maxTokens: 200 });
      return grammar.parse(raw) as unknown;
    });
    this.queue = run.catch(() => undefined);

    try {
      return normalize(await run);
    } catch (err) {
      console.warn('[NLU] Local classify failed:', (err as Error).message);
      return null;
    }
  }
}

export const localLlmProvider = new LocalLlmProvider();
