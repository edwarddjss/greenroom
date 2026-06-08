import type { DiscordValidation, SpotifyValidation } from '@greenroom/shared';

const TIMEOUT_MS = 10_000;

function withTimeout(signal: AbortSignal): RequestInit {
  return { signal };
}

/** Verify a Discord bot token + application id against the live API. */
export async function validateDiscord(token: string, clientId: string): Promise<DiscordValidation> {
  if (!/^\d{17,20}$/.test(clientId)) {
    return { ok: false, error: 'Application ID should be a 17-20 digit number.' };
  }
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bot ${token}` },
      ...withTimeout(ac.signal),
    });
    if (res.status === 401) return { ok: false, error: 'Invalid bot token.' };
    if (!res.ok) return { ok: false, error: `Discord API returned ${res.status}.` };
    const user = (await res.json()) as { id: string; username: string; avatar: string | null };
    const result: DiscordValidation = { ok: true, botName: user.username };
    if (user.avatar) result.avatarUrl = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`;
    return result;
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return { ok: false, error: aborted ? 'Timed out reaching Discord.' : 'Could not reach Discord - check your connection.' };
  } finally {
    clearTimeout(timer);
  }
}

/** Verify Spotify app credentials via the client-credentials flow. */
export async function validateSpotify(clientId: string, clientSecret: string): Promise<SpotifyValidation> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
      ...withTimeout(ac.signal),
    });
    if (res.ok) return { ok: true };
    if (res.status === 400) return { ok: false, error: 'Invalid Client ID or Secret.' };
    return { ok: false, error: `Spotify returned ${res.status}.` };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return { ok: false, error: aborted ? 'Timed out reaching Spotify.' : 'Could not reach Spotify - check your connection.' };
  } finally {
    clearTimeout(timer);
  }
}
