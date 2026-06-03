const SPOTIFY_HTTP_LINK_RE = /open\.spotify\.com\/(track|playlist|album|artist)\/([a-zA-Z0-9]+)/i;
const SPOTIFY_URI_RE = /^spotify:(track|playlist|album|artist):([a-zA-Z0-9]+)$/i;

const SPOTIFY_QUERY_FILLERS: RegExp[] = [
  /\b(this|some|a|the|play|please|add|to|queue|enqueue|song|track)\b/gi,
  /\b(type\s+shit|type\s+beats?|type\s+music|kind\s+of\s+shit|kind\s+of\s+music|style\s+of\s+music|type\s+vibe|type\s+stuff|type\s+style|type\s+track|type\s+song|type\s+mix)\b/gi,
];

export type SpotifyReferenceType = 'track' | 'playlist' | 'album' | 'artist';

export interface SpotifyReference {
  type: SpotifyReferenceType;
  id: string;
  uri: string;
}

export function normalizeSpotifySearchQuery(query: string): string {
  let cleanQuery = query;
  for (const pattern of SPOTIFY_QUERY_FILLERS) {
    cleanQuery = cleanQuery.replace(pattern, ' ');
  }
  cleanQuery = cleanQuery.replace(/\s+/g, ' ').trim();
  return cleanQuery || query.trim();
}

export function extractDirectPlayQuery(content: string): string | null {
  const match = content.match(/^\s*(?:play|listen(?:\s+to)?|put\s+on|stream|crank|spin|bump|search(?:\s+for)?)\s+(.+)$/i);
  const query = match?.[1]?.trim();
  return query || null;
}

export function extractSpotifyReference(input: string | null | undefined): SpotifyReference | null {
  if (!input) return null;
  const normalizedInput = input.trim();

  const httpMatch = normalizedInput.match(SPOTIFY_HTTP_LINK_RE);
  if (httpMatch?.[1] && httpMatch[2]) {
    const type = httpMatch[1].toLowerCase() as SpotifyReferenceType;
    const id = httpMatch[2];
    return { type, id, uri: `spotify:${type}:${id}` };
  }

  const uriMatch = normalizedInput.match(SPOTIFY_URI_RE);
  if (uriMatch?.[1] && uriMatch[2]) {
    const type = uriMatch[1].toLowerCase() as SpotifyReferenceType;
    const id = uriMatch[2];
    return { type, id, uri: `spotify:${type}:${id}` };
  }

  return null;
}

export function isQueueRequest(text: string): boolean {
  return /\b(queue|add\s+to\s+queue|enqueue|next\s+up|up\s+next|put\s+up\s+next)\b/i.test(text);
}
