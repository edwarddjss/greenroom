const SPOTIFY_HTTP_LINK_RE = /open\.spotify\.com\/(track|playlist|album|artist)\/([a-zA-Z0-9]+)/i;
const SPOTIFY_URI_RE = /^spotify:(track|playlist|album|artist):([a-zA-Z0-9]+)$/i;

const SPOTIFY_QUERY_FILLERS = [
  /\b(this|some|a|the|nigga|play|please|me|us|him|them|add|to|queue|enqueue|song|track)\b/gi,
  /\b(type\s+shit|type\s+beats?|type\s+music|kind\s+of\s+shit|kind\s+of\s+music|style\s+of\s+music|type\s+vibe|type\s+stuff|type\s+style|type\s+track|type\s+song|type\s+mix)\b/gi,
];

export function normalizeSpotifySearchQuery(query) {
  let cleanQuery = query;
  for (const pattern of SPOTIFY_QUERY_FILLERS) {
    cleanQuery = cleanQuery.replace(pattern, ' ');
  }

  cleanQuery = cleanQuery
    .replace(/\s+/g, ' ')
    .trim();

  return cleanQuery || query.trim();
}

export function extractSpotifyReference(input) {
  if (!input) return null;

  const normalizedInput = input.trim();
  const httpMatch = normalizedInput.match(SPOTIFY_HTTP_LINK_RE);
  if (httpMatch) {
    const type = httpMatch[1].toLowerCase();
    const id = httpMatch[2];
    return {
      type,
      id,
      uri: `spotify:${type}:${id}`,
    };
  }

  const uriMatch = normalizedInput.match(SPOTIFY_URI_RE);
  if (uriMatch) {
    const type = uriMatch[1].toLowerCase();
    const id = uriMatch[2];
    return {
      type,
      id,
      uri: `spotify:${type}:${id}`,
    };
  }

  return null;
}

export function isQueueRequest(text) {
  return /\b(queue|add\s+to\s+queue|enqueue|next\s+up|up\s+next|put\s+up\s+next)\b/i.test(text);
}
