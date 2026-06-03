import { isQueueRequest } from '../spotify-utils.js';
import type { ParsedIntent, IntentName } from '../types.js';
import type { NluProvider } from './types.js';

type ScorableIntent = Exclude<IntentName, 'GREET'>;

/** Deterministic regex/keyword intent parser. Always available, instant, offline. */
export function classifyRuleBased(content: string): ParsedIntent {
  const text = content.toLowerCase();
  const scores: Record<ScorableIntent, number> = {
    PLAY: 0, STOP: 0, EFFECT_BASS: 0, EFFECT_SPEEDUP: 0, EFFECT_SLOWED: 0,
    EFFECT_CLEAR: 0, QUEUE: 0, CLEAR_QUEUE: 0, STATUS: 0, LOGIN: 0, FRIEND_PLAY: 0,
  };

  if (/\b(clear|empty|flush|remove|reset)\s+(the\s+)?(spotify\s+)?queue\b/.test(text) || /\bqueue\s+(clear|empty|flush|reset)\b/.test(text)) scores.CLEAR_QUEUE += 10;
  if (/\b(stop|pause|leave|quit|disconnect|shut\s+up|get\s+out|go\s+away|bye|exit|kill)\b/.test(text)) scores.STOP += 5;
  if (/\b(bass|boost|bassboost|sub|low\s+end|subwoofer|heavy|deep)\b/.test(text)) scores.EFFECT_BASS += 5;
  if (/\b(speed\b(.*?)\bup|faster|nightcore|fast|accelerate|pitch\s+up)\b/.test(text)) scores.EFFECT_SPEEDUP += 5;
  if (/\b(slow\b(.*?)\bdown|slower|slowed|screwed|chop|reverb|pitch\s+down)\b/.test(text)) scores.EFFECT_SLOWED += 5;
  if (/\b(clear|normal|reset|remove|clean|standard|default|unboost|normalize)\b/.test(text)) scores.EFFECT_CLEAR += 5;
  if (isQueueRequest(text)) scores.QUEUE += 5;
  if (/\b(status|playing|song|current|track|now\s+playing|info|name|what\s+is\s+this|what\s+is\s+playing)\b/.test(text)) scores.STATUS += 5;
  if (/\b(login|link|auth|authorize|register|connect|account)\b/.test(text)) scores.LOGIN += 5;
  if (/\bplay\s+(\w+)'s\s+(.+)$/i.test(text)) scores.FRIEND_PLAY += 10;
  if (/\b(play|listen|put\s+on|stream|start|resume|crank|spin|bump|search)\b/.test(text)) scores.PLAY += 2;

  let bestIntent: ScorableIntent = 'PLAY';
  let highestScore = 0;
  for (const [intent, score] of Object.entries(scores) as [ScorableIntent, number][]) {
    if (score > highestScore) {
      highestScore = score;
      bestIntent = intent;
    }
  }

  if (highestScore === 0) {
    if (text.length < 4 || (/\b(hey|hello|hi|yo|whatsup|sup|bot)\b/.test(text) && text.split(' ').length <= 2)) {
      return { intent: 'GREET' };
    }
    return { intent: 'PLAY', query: content };
  }
  if (bestIntent === 'PLAY') {
    return { intent: 'PLAY', query: content.replace(/\b(play|listen|put\s+on|stream|start|resume|crank|spin|bump|search|this|some|a|the)\b/gi, '').trim() };
  }
  if (bestIntent === 'QUEUE') {
    return { intent: 'QUEUE', query: content.replace(/\b(queue|add\s+to\s+queue|enqueue|next\s+up|up\s+next|put\s+up\s+next|this|some|a|the)\b/gi, '').trim() };
  }
  if (bestIntent === 'FRIEND_PLAY') {
    const match = text.match(/\bplay\s+(\w+)'s\s+(.+)$/i);
    if (match?.[1] && match[2]) return { intent: 'FRIEND_PLAY', friend: match[1].trim(), target: match[2].trim() };
  }
  return { intent: bestIntent };
}

export const ruleBasedProvider: NluProvider = {
  name: 'rule-based',
  isReady: () => true,
  classify: (content) => Promise.resolve(classifyRuleBased(content)),
};
