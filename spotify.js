import express from 'express';
import fetch from 'node-fetch';
import fs from 'fs';
import { EventEmitter } from 'events';
import { config } from './config.js';
import { extractSpotifyReference, normalizeSpotifySearchQuery } from './spotify-utils.js';

class SpotifyController extends EventEmitter {
  constructor() {
    super();
    this.profiles = {}; // Maps discordUserId -> { accessToken, refreshToken, expiresAt, audioDevice }
    this.expressServer = null;

    this.loadCredentials();
  }

  // Load profile tokens from disk if they exist
  loadCredentials() {
    try {
      if (fs.existsSync(config.authStorePath)) {
        this.profiles = JSON.parse(fs.readFileSync(config.authStorePath, 'utf8'));
        console.log(`[Spotify] Loaded ${Object.keys(this.profiles).length} user profiles from local storage.`);
      } else {
        console.log('[Spotify] No stored profiles found. Authenticating profiles on demand.');
      }
    } catch (error) {
      console.error('[Spotify] Failed to load credentials from file:', error.message);
    }
  }

  // Save profile tokens to disk
  saveCredentials() {
    try {
      fs.writeFileSync(config.authStorePath, JSON.stringify(this.profiles, null, 2), 'utf8');
      console.log('[Spotify] Saved all user profiles securely to disk.');
    } catch (error) {
      console.error('[Spotify] Failed to save credentials to file:', error.message);
    }
  }

  // Check if a specific user is authenticated
  isUserAuthenticated(discordUserId) {
    return !!(this.profiles[discordUserId] && this.profiles[discordUserId].refreshToken);
  }

  // Get custom audio device configured for a user (returns null if none)
  getUserAudioDevice(discordUserId) {
    return this.profiles[discordUserId]?.audioDevice || null;
  }

  // Configure custom audio device for a user
  setUserAudioDevice(discordUserId, deviceName) {
    if (this.profiles[discordUserId]) {
      this.profiles[discordUserId].audioDevice = deviceName;
      this.saveCredentials();
      return true;
    }
    return false;
  }

  // Start the HTTP server to listen for Spotify OAuth code
  startAuthServer() {
    if (this.expressServer) return;

    const app = express();

    // Initiates Spotify authorization callback passing user's discord ID in the state variable
    app.get('/login', (req, res) => {
      const discordUserId = req.query.state;
      if (!discordUserId) {
        return res.status(400).send('Error: Missing state parameter (discordUserId). Please request the login link via Discord command /login.');
      }

      const scopes = [
        'user-modify-playback-state',
        'user-read-playback-state',
        'user-read-currently-playing'
      ].join(' ');

      const authUrl = `https://accounts.spotify.com/authorize?` +
        new URLSearchParams({
          response_type: 'code',
          client_id: config.spotifyClientId,
          scope: scopes,
          redirect_uri: config.spotifyRedirectUri,
          state: discordUserId // Pass Discord ID to map on callback
        }).toString();

      res.redirect(authUrl);
    });

    app.get('/callback', async (req, res) => {
      const code = req.query.code;
      const discordUserId = req.query.state; // Extract Discord ID from state
      
      if (!code) {
        return res.status(400).send('Error: Missing authorization code.');
      }
      if (!discordUserId) {
        return res.status(400).send('Error: Missing state (discordUserId).');
      }

      try {
        const tokenResponse = await this.exchangeCode(code);
        
        // Save token to the user's profile
        this.profiles[discordUserId] = {
          accessToken: tokenResponse.access_token,
          refreshToken: tokenResponse.refresh_token || (this.profiles[discordUserId] ? this.profiles[discordUserId].refreshToken : null),
          expiresAt: Date.now() + (tokenResponse.expires_in * 1000),
          audioDevice: this.profiles[discordUserId]?.audioDevice || null // Preserve mapped audio device if already exists
        };

        this.saveCredentials();

        res.send(`
          <html>
            <body style="font-family: Arial, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background-color: #121212; color: #ffffff;">
              <h1 style="color: #1DB954;">✓ Spotify Authorized Successfully!</h1>
              <p>Your Spotify account is now linked to your Discord profile.</p>
              <p>You can close this tab and return to Discord.</p>
            </body>
          </html>
        `);

        console.log(`[Spotify] Authorization successful. Link created for Discord User ID: ${discordUserId}`);
        this.emit('authenticated', discordUserId);

      } catch (err) {
        console.error('[Spotify] Token exchange failed:', err.message);
        res.status(500).send(`Authentication failed: ${err.message}`);
      }
    });

    this.expressServer = app.listen(config.port, () => {
      console.log(`[Spotify] Authentication server listening on port ${config.port}`);
    });
  }

  stopAuthServer() {
    if (this.expressServer) {
      this.expressServer.close();
      this.expressServer = null;
      console.log('[Spotify] Authentication server stopped.');
    }
  }

  // Get login URL for a specific Discord user
  getLoginUrl(discordUserId) {
    return `http://localhost:${config.port}/login?state=${discordUserId}`;
  }

  // Exchange Auth Code for tokens
  async exchangeCode(code) {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${config.spotifyClientId}:${config.spotifyClientSecret}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: config.spotifyRedirectUri
      }).toString()
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Spotify token error: ${response.status} - ${errText}`);
    }

    return response.json();
  }

  // Retrieve Access Token for a specific user (Auto Refreshes)
  async getAccessToken(discordUserId) {
    const profile = this.profiles[discordUserId];
    if (!profile) {
      throw new Error('User profile is not registered with Spotify. Run /login first.');
    }

    // If token is expired or expires in the next 30 seconds, refresh it
    if (!profile.accessToken || Date.now() > (profile.expiresAt - 30000)) {
      if (!profile.refreshToken) {
        throw new Error('No refresh token available for this profile. User must authenticate.');
      }
      await this.refreshAccessToken(discordUserId);
    }
    return this.profiles[discordUserId].accessToken;
  }

  // Refresh token request for a specific user
  async refreshAccessToken(discordUserId) {
    const profile = this.profiles[discordUserId];
    console.log(`[Spotify] Refreshing access token for User: ${discordUserId}...`);
    
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${config.spotifyClientId}:${config.spotifyClientSecret}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: profile.refreshToken
      }).toString()
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Spotify token refresh error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    this.profiles[discordUserId].accessToken = data.access_token;
    this.profiles[discordUserId].expiresAt = Date.now() + (data.expires_in * 1000);
    if (data.refresh_token) {
      this.profiles[discordUserId].refreshToken = data.refresh_token;
    }
    this.saveCredentials();
    console.log(`[Spotify] Token refreshed successfully for User: ${discordUserId}`);
  }

  // Generic Spotify Web API Request Handler per-user
  async request(discordUserId, endpoint, method = 'GET', body = null) {
    const token = await this.getAccessToken(discordUserId);
    const url = `https://api.spotify.com/v1${endpoint}`;
    
    const options = {
      method: method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    let response = await fetch(url, options);

    // Handle rate limiting (status 429)
    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('Retry-After') || '2', 10);
      console.log(`[Spotify] Rate limited! Retrying after ${retryAfter} seconds...`);
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      response = await fetch(url, options);
    }

    if (response.status === 204) {
      return null; // Empty body responses (Standard for PUT/POST player endpoints)
    }

    if (!response.ok) {
      const errText = await response.text();
      let parsedError = errText;
      try {
        const parsed = JSON.parse(errText);
        parsedError = parsed.error ? parsed.error.message : errText;
      } catch (e) {}
      throw new Error(`Spotify Web API returned status ${response.status}: ${parsedError}`);
    }

    return response.json();
  }

  // ----------------------------------------------------
  // Spotify Connect Playback Controls
  // ----------------------------------------------------

  // Get active Spotify Connect devices for a user
  async getDevices(discordUserId) {
    const data = await this.request(discordUserId, '/me/player/devices', 'GET');
    return data.devices || [];
  }

  // Try to find the host machine device for a user
  async findTargetDevice(discordUserId) {
    const devices = await this.getDevices(discordUserId);
    if (devices.length === 0) return null;

    // 1. If target name is configured, find it
    if (config.spotifyTargetDeviceName) {
      const match = devices.find(d => d.name.toLowerCase().includes(config.spotifyTargetDeviceName.toLowerCase()));
      if (match) return match;
    }

    // 2. Otherwise find the first Computer
    const computer = devices.find(d => d.type.toLowerCase() === 'computer');
    if (computer) return computer;

    // 3. Fallback to any active device
    const active = devices.find(d => d.is_active);
    if (active) return active;

    // 4. Default to first device
    return devices[0];
  }

  // Play or resume active Spotify context for a specific user
  async play(discordUserId, deviceId = null) {
    const deviceParam = deviceId ? `?device_id=${deviceId}` : '';
    
    try {
      await this.request(discordUserId, `/me/player/play${deviceParam}`, 'PUT', {});
      return { success: true, message: 'Spotify resumed. Please ensure Spotify is active on your host client.' };
    } catch (error) {
      if (error.message.includes('Restriction violated')) {
        const state = await this.getPlaybackState(discordUserId).catch(() => null);
        if (state && state.isPlaying) {
          return { success: true, message: 'Spotify is already actively playing!' };
        }
        return { success: true, message: 'Spotify is already active. You can manage playback directly in the app!' };
      }
      throw new Error(`Could not start playback. Make sure your Spotify Desktop Client is running and active: ${error.message}`);
    }
  }

  // Search Spotify for a track or playlist and play it
  async searchAndPlay(discordUserId, query) {
    const cleanQuery = normalizeSpotifySearchQuery(query);

    console.log(`[Spotify] Searching for query: "${cleanQuery}" using User Session: ${discordUserId}...`);

    try {
      // Determine if it looks like a playlist, genre, or vibe query
      const isPlaylistQuery = /\b(music|playlist|mix|genre|chill|vibes|party|rap|rock|edm|house|garage|pop|lofi)\b/i.test(cleanQuery);
      
      let searchType = 'track';
      if (isPlaylistQuery) {
        searchType = 'playlist,track';
      }

      const searchResult = await this.request(
        discordUserId, 
        `/search?q=${encodeURIComponent(cleanQuery)}&type=${searchType}&limit=1`, 
        'GET'
      );

      if (!searchResult) {
        throw new Error('No search results found.');
      }

      let playBody = {};
      let matchName = '';
      let matchType = '';

      // Cleanly resolve the first non-null playable item to bypass deleted or restricted search nodes
      const playlist = searchResult.playlists?.items?.find(item => item !== null);
      const track = searchResult.tracks?.items?.find(item => item !== null);

      if (playlist) {
        playBody = { context_uri: playlist.uri };
        matchName = playlist.name;
        matchType = 'playlist';
      } else if (track) {
        playBody = { uris: [track.uri] };
        matchName = `${track.name} by ${track.artists.map(a => a.name).join(', ')}`;
        matchType = 'track';
      } else {
        throw new Error('No tracks or playlists found matching that query.');
      }

      // Play on active device
      const device = await this.findTargetDevice(discordUserId);
      const deviceId = device ? device.id : null;
      const deviceParam = deviceId ? `?device_id=${deviceId}` : '';

      await this.request(discordUserId, `/me/player/play${deviceParam}`, 'PUT', playBody);
      
      return { 
        success: true, 
        matchName, 
        matchType,
        deviceName: device ? device.name : 'Active Host Client'
      };

    } catch (err) {
      console.error('[Spotify] Search and play failed:', err.message);
      throw err;
    }
  }

  // Queue a track on the user's Spotify playback queue
  async queueTrack(discordUserId, queryOrLink) {
    const directReference = extractSpotifyReference(queryOrLink);
    let trackUri = null;
    let matchName = '';

    if (directReference) {
      if (directReference.type !== 'track') {
        throw new Error('Queueing currently supports individual track links or track searches only.');
      }

      trackUri = directReference.uri;
      matchName = `Spotify Link (${directReference.type})`;
    } else {
      const cleanQuery = normalizeSpotifySearchQuery(queryOrLink);
      console.log(`[Spotify] Queue search for query: "${cleanQuery}" using User Session: ${discordUserId}...`);

      const searchResult = await this.request(
        discordUserId,
        `/search?q=${encodeURIComponent(cleanQuery)}&type=track&limit=1`,
        'GET'
      );

      const track = searchResult?.tracks?.items?.find(item => item !== null);
      if (!track) {
        throw new Error('No tracks found matching that query.');
      }

      trackUri = track.uri;
      matchName = `${track.name} by ${track.artists.map(a => a.name).join(', ')}`;
    }

    const device = await this.findTargetDevice(discordUserId);
    const deviceId = device ? device.id : null;
    const queueParams = new URLSearchParams({ uri: trackUri });
    if (deviceId) queueParams.set('device_id', deviceId);

    await this.request(discordUserId, `/me/player/queue?${queueParams.toString()}`, 'POST');

    return {
      success: true,
      matchName,
      matchType: 'track',
      deviceName: device ? device.name : 'Active Host Client',
    };
  }

  // Resolve a friend's display name to their Spotify User ID by searching public playlists they created
  async resolveUserDisplayName(discordUserId, displayName) {
    const cleanName = displayName.trim();
    console.log(`[Spotify] Resolving display name: "${cleanName}"...`);
    
    try {
      const searchResult = await this.request(
        discordUserId,
        `/search?q=${encodeURIComponent(cleanName)}&type=playlist&limit=10`,
        'GET'
      );
      
      if (searchResult && searchResult.playlists && searchResult.playlists.items) {
        // Loop through search playlists and find one where the owner's display name matches
        const match = searchResult.playlists.items.find(item => {
          if (!item || !item.owner) return false;
          const ownerName = item.owner.display_name || '';
          return ownerName.toLowerCase().includes(cleanName.toLowerCase()) || 
                 cleanName.toLowerCase().includes(ownerName.toLowerCase());
        });
        
        if (match && match.owner) {
          console.log(`[Spotify] Resolved "${cleanName}" -> User ID: ${match.owner.id} (${match.owner.display_name})`);
          return {
            spotifyUserId: match.owner.id,
            spotifyDisplayName: match.owner.display_name || cleanName
          };
        }
      }
      
      // Fallback
      return {
        spotifyUserId: displayName.toLowerCase().replace(/\s+/g, ''),
        spotifyDisplayName: displayName
      };
    } catch (err) {
      console.warn(`[Spotify] Display name resolution failed:`, err.message);
      return {
        spotifyUserId: displayName.toLowerCase().replace(/\s+/g, ''),
        spotifyDisplayName: displayName
      };
    }
  }

  // Fetch playlists for a specific user ID and play the matching one
  async playUserPlaylist(discordUserId, spotifyUserId, playlistSearchQuery) {
    console.log(`[Spotify] Fetching playlists for User: ${spotifyUserId}, searching for: "${playlistSearchQuery}"...`);
    
    try {
      const response = await this.request(
        discordUserId,
        `/users/${spotifyUserId}/playlists?limit=50`,
        'GET'
      );
      
      if (!response || !response.items || response.items.length === 0) {
        throw new Error(`This user has no public playlists visible on Spotify.`);
      }
      
      const cleanSearch = playlistSearchQuery.toLowerCase().trim();
      let selectedPlaylist = null;
      
      // If the search query is generic, grab the first playlist
      if (/\b(playlist|mix|vibe|music|song|track)\b/i.test(cleanSearch) && cleanSearch.split(' ').length === 1) {
        selectedPlaylist = response.items.find(item => item !== null);
      } else {
        // Fuzzy-match playlist name
        selectedPlaylist = response.items.find(item => {
          if (!item) return false;
          return item.name.toLowerCase().includes(cleanSearch);
        });
      }
      
      if (!selectedPlaylist) {
        // Fallback to first available playlist
        selectedPlaylist = response.items.find(item => item !== null);
      }
      
      if (!selectedPlaylist) {
        throw new Error(`Could not find a playable playlist for this user.`);
      }
      
      // Play the selected playlist on active device
      const device = await this.findTargetDevice(discordUserId);
      const deviceId = device ? device.id : null;
      const deviceParam = deviceId ? `?device_id=${deviceId}` : '';
      
      await this.request(discordUserId, `/me/player/play${deviceParam}`, 'PUT', {
        context_uri: selectedPlaylist.uri
      });
      
      return {
        success: true,
        playlistName: selectedPlaylist.name,
        deviceName: device ? device.name : 'Active Host Client'
      };
    } catch (err) {
      console.error('[Spotify] Play user playlist failed:', err.message);
      throw err;
    }
  }

  // Pause playback for a user
  async pause(discordUserId, deviceId = null) {
    const deviceParam = deviceId ? `?device_id=${deviceId}` : '';
    await this.request(discordUserId, `/me/player/pause${deviceParam}`, 'PUT');
  }

  // Skip to next track for a user
  async next(discordUserId, deviceId = null) {
    const deviceParam = deviceId ? `?device_id=${deviceId}` : '';
    await this.request(discordUserId, `/me/player/next${deviceParam}`, 'POST');
  }

  // Transfer playback to host computer for a user
  async transferPlayback(discordUserId, deviceId) {
    await this.request(discordUserId, '/me/player', 'PUT', {
      device_ids: [deviceId],
      play: true
    });
  }

  // Get currently playing status for a user
  async getPlaybackState(discordUserId) {
    try {
      const state = await this.request(discordUserId, '/me/player', 'GET');
      if (!state) return { isPlaying: false, track: null };
      
      return {
        isPlaying: state.is_playing,
        track: state.item ? {
          name: state.item.name,
          artists: state.item.artists.map(a => a.name).join(', '),
          album: state.item.album.name,
          url: state.item.external_urls.spotify
        } : null,
        device: state.device ? {
          name: state.device.name,
          type: state.device.type,
          volume: state.device.volume_percent,
          id: state.device.id
        } : null
      };
    } catch (err) {
      console.error(`[Spotify] Failed to get playback state for ${discordUserId}:`, err.message);
      return { isPlaying: false, track: null, error: err.message };
    }
  }
}

export const spotify = new SpotifyController();
