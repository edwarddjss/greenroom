import { useEffect, useState } from 'react';
import type { CredsStatus, DiscordValidation, PrereqReport, SpotifyValidation, TunnelStatus, VbCableInstallResult } from '@greenroom/shared';
import { botInviteUrl } from '@greenroom/shared';
import { api } from '../lib/api';
import { useUpdater } from '../lib/useUpdater';
import { ExternalLink, LifeBuoy } from 'lucide-react';
import { Button, Code, Field, Modal, ProgressBar, SectionHeader } from './ui';

export function SettingsModal({
  prereqs,
  onPrereqs,
  onClose,
}: {
  prereqs: PrereqReport;
  onPrereqs: (prereqs: PrereqReport) => void;
  onClose: () => void;
}): JSX.Element {
  const [discordToken, setDiscordToken] = useState('');
  const [discordClientId, setDiscordClientId] = useState('');
  const [spotifyClientId, setSpotifyClientId] = useState('');
  const [spotifyClientSecret, setSpotifyClientSecret] = useState('');
  const [discordResult, setDiscordResult] = useState<DiscordValidation | null>(null);
  const [spotifyResult, setSpotifyResult] = useState<SpotifyValidation | null>(null);
  const [busy, setBusy] = useState<'discord' | 'spotify' | 'commands' | null>(null);
  const [tunnelBusy, setTunnelBusy] = useState(false);
  const [tunnel, setTunnel] = useState<TunnelStatus>({ running: false });
  const [commandMessage, setCommandMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: 'ok' | 'bad'; message: string } | null>(null);
  const [credsSummary, setCredsSummary] = useState<string>('Loading...');
  const [credsStatus, setCredsStatus] = useState<CredsStatus | null>(null);
  const [savedInviteUrl, setSavedInviteUrl] = useState<string | null>(null);
  const [installingCable, setInstallingCable] = useState(false);
  const [cableInstallResult, setCableInstallResult] = useState<VbCableInstallResult | null>(null);
  const update = useUpdater();

  useEffect(() => {
    void api.tunnelStatus().then(setTunnel);
    void api.discordInviteUrl().then(setSavedInviteUrl);
    void api.credsStatus().then((status) => {
      setCredsStatus(status);
      const discord = status.hasDiscord ? 'Discord set' : 'Discord missing';
      const spotify = status.hasSpotify ? 'Spotify set' : 'Spotify missing';
      setCredsSummary(`${discord} · ${spotify}`);
    });
  }, []);

  const inviteUrl = /^\d{17,20}$/.test(discordClientId) ? botInviteUrl(discordClientId) : savedInviteUrl;
  const hasDiscordDraft = discordToken.trim() && discordClientId.trim();
  const hasSpotifyDraft = spotifyClientId.trim() && spotifyClientSecret.trim();

  const saveDiscord = async (): Promise<void> => {
    setBusy('discord');
    setDiscordResult(null);
    const result = await api.validateDiscord(discordToken, discordClientId);
    if (result.ok) {
      await api.credsSave({ discordToken, discordClientId });
      setCredsSummary((prev) => prev.replace('Discord missing', 'Discord set'));
      setCredsStatus(await api.credsStatus());
      setSavedInviteUrl(botInviteUrl(discordClientId));
      setDiscordToken('');
      setDiscordClientId('');
      showToast('ok', 'Discord credentials saved.');
    } else {
      setDiscordResult(result);
    }
    setBusy(null);
  };

  const saveSpotify = async (): Promise<void> => {
    setBusy('spotify');
    setSpotifyResult(null);
    const result = await api.validateSpotify(spotifyClientId, spotifyClientSecret);
    if (result.ok) {
      await api.credsSave({ spotifyClientId, spotifyClientSecret });
      setCredsSummary((prev) => prev.replace('Spotify missing', 'Spotify set'));
      setCredsStatus(await api.credsStatus());
      setSpotifyClientId('');
      setSpotifyClientSecret('');
      showToast('ok', 'Spotify credentials saved.');
    } else {
      setSpotifyResult(result);
    }
    setBusy(null);
  };

  const installCable = async (): Promise<void> => {
    setInstallingCable(true);
    setCableInstallResult(null);
    try {
      const result = await api.vbcableInstall();
      setCableInstallResult(result);
      onPrereqs(await api.prereqsScan());
    } finally {
      setInstallingCable(false);
    }
  };

  const registerCommands = async (): Promise<void> => {
    setBusy('commands');
    setCommandMessage(null);
    try {
      const result = await api.commandsRegister();
      setCommandMessage(result.ok ? 'Slash commands are ready.' : (result.error ?? 'Could not register slash commands. Try again.'));
    } catch {
      setCommandMessage('Could not register slash commands. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const startTunnel = async (): Promise<void> => {
    setTunnelBusy(true);
    setTunnel(await api.tunnelStart());
    setTunnelBusy(false);
  };

  const stopTunnel = async (): Promise<void> => {
    setTunnelBusy(true);
    setTunnel(await api.tunnelStop());
    setTunnelBusy(false);
  };

  const copyText = async (label: string, value: string | undefined): Promise<void> => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    showToast('ok', `${label} copied.`);
  };

  const showToast = (tone: 'ok' | 'bad', message: string): void => {
    setToast({ tone, message });
    setTimeout(() => setToast(null), 2200);
  };

  const vbCableNeedsAttention = prereqs.vbcable.status !== 'ok' && prereqs.vbcable.status !== 'unknown';
  const activeRedirectUri = tunnel.callbackUrl ?? 'Start the tunnel above to get the Spotify redirect URI.';
  const discordSaved = credsStatus?.hasDiscord === true;
  const spotifySaved = credsStatus?.hasSpotify === true;

  const exportDiagnostics = async (): Promise<void> => {
    const result = await api.diagnosticsExport();
    const opened = await api.diagnosticsOpen(result.path);
    showToast(opened.ok ? 'ok' : 'bad', opened.ok ? 'Diagnostics report opened.' : (opened.error ?? 'Diagnostics report was created, but could not be opened.'));
  };

  const checkForUpdates = async (): Promise<void> => {
    await api.updaterCheck();
  };

  const updateDetail = (() => {
    switch (update.phase) {
      case 'checking':
        return 'Checking for updates…';
      case 'available':
        return `Version ${update.version ?? ''} is available. Downloading in the background.`;
      case 'downloading':
        return `Downloading${update.percent === undefined ? '…' : ` · ${Math.round(update.percent)}%`}`;
      case 'downloaded':
        return `Version ${update.version ?? ''} is ready. Restart Greenroom to install it.`;
      case 'error':
        return update.error ?? 'Could not check for updates.';
      default:
        return update.lastCheckedAt ? `Up to date · checked ${new Date(update.lastCheckedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Updates download automatically when available.';
    }
  })();

  return (
    <Modal size="md" onClose={onClose} labelledBy="settings-title">
      <div className="flex items-start justify-between gap-3 border-b border-line p-5">
        <div>
          <h2 id="settings-title" className="text-base font-semibold tracking-tight">Settings</h2>
          <p className="mt-0.5 text-[13px] text-muted">{credsSummary}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-auto p-5">
          <section className="space-y-3">
            {vbCableNeedsAttention && (
              <div className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm">
                <div className="font-semibold text-danger">Audio setup needs attention</div>
                <div className="mt-1 text-muted">Greenroom could not access the virtual audio device it needs.</div>
                <Button className="mt-3" variant="ghost" disabled={installingCable} onClick={() => void installCable()}>
                  {installingCable ? 'Repairing…' : 'Repair audio setup'}
                </Button>
                {cableInstallResult && (
                  <p className={`mt-2 text-xs ${cableInstallResult.ok ? 'text-accent' : 'text-danger'}`}>{cableInstallResult.message}</p>
                )}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <SectionHeader
              label="Public Spotify login"
              detail="Use this when friends need to link Spotify from outside the host PC."
              action={
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" size="sm" disabled={tunnelBusy} onClick={() => void startTunnel()}>
                    {tunnelBusy ? 'Starting…' : tunnel.running ? 'Refresh tunnel' : 'Start tunnel'}
                  </Button>
                  <Button variant="ghost" size="sm" disabled={tunnelBusy || !tunnel.running} onClick={() => void stopTunnel()}>
                    Stop
                  </Button>
                </div>
              }
            />
            <div className="space-y-2 rounded-lg border border-line bg-sunken p-3">
              <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                <Code className="min-w-0 truncate py-2">
                  {tunnel.callbackUrl ?? 'Start the tunnel, then add this callback in Spotify.'}
                </Code>
                <Button variant="ghost" size="sm" disabled={!tunnel.callbackUrl} onClick={() => void copyText('Redirect URI', tunnel.callbackUrl)}>
                  Copy redirect
                </Button>
              </div>
              {tunnel.error && (
                <p className="text-xs text-warn">
                  {tunnel.error}
                  {tunnel.url ? ` Tunnel URL: ${tunnel.url}` : ''}
                </p>
              )}
              <p className="text-xs text-muted">Add the Redirect URI above in the Spotify Developer Dashboard. The bot restarts automatically when this URL changes.</p>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <SectionHeader label="Discord bot" action={<SavedBadge saved={discordSaved} />} />
              <Field label={discordSaved ? 'Replace bot token' : 'Bot token'} mono type="password" placeholder={discordSaved ? 'Enter a new token to replace the saved token' : 'New bot token'} value={discordToken} onChange={(e) => setDiscordToken(e.target.value)} />
              <Field label={discordSaved ? 'Replace Application ID' : 'Application ID'} mono placeholder={discordSaved ? 'Enter a new ID to replace the saved ID' : 'Application ID'} value={discordClientId} onChange={(e) => setDiscordClientId(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                <Button disabled={!hasDiscordDraft || busy === 'discord'} onClick={() => void saveDiscord()}>
                  {busy === 'discord' ? 'Saving…' : 'Validate & save'}
                </Button>
                <Button variant="ghost" disabled={!inviteUrl} onClick={() => inviteUrl && window.open(inviteUrl, '_blank')}>
                  Invite bot
                </Button>
              </div>
              {discordResult && !discordResult.ok && <p className="text-sm text-danger">{discordResult.error}</p>}
            </div>

            <div className="space-y-3">
              <SectionHeader label="Spotify app" action={<SavedBadge saved={spotifySaved} />} />
              <Code className={`block break-all whitespace-normal ${tunnel.callbackUrl ? '' : 'text-muted'}`}>{activeRedirectUri}</Code>
              <Field label={spotifySaved ? 'Replace Client ID' : 'Client ID'} mono placeholder={spotifySaved ? 'Enter a new ID to replace the saved ID' : 'New client ID'} value={spotifyClientId} onChange={(e) => setSpotifyClientId(e.target.value)} />
              <Field label={spotifySaved ? 'Replace Client secret' : 'Client secret'} mono type="password" placeholder={spotifySaved ? 'Enter a new secret to replace the saved secret' : 'New client secret'} value={spotifyClientSecret} onChange={(e) => setSpotifyClientSecret(e.target.value)} />
              <Button disabled={!hasSpotifyDraft || busy === 'spotify'} onClick={() => void saveSpotify()}>
                {busy === 'spotify' ? 'Saving…' : 'Validate & save'}
              </Button>
              {spotifyResult && !spotifyResult.ok && <p className="text-sm text-danger">{spotifyResult.error}</p>}
            </div>
          </section>

          <section className="space-y-3">
            <SectionHeader label="Discord commands" />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" disabled={busy === 'commands'} onClick={() => void registerCommands()}>
                {busy === 'commands' ? 'Registering…' : 'Register slash commands'}
              </Button>
              {commandMessage && <span className="text-sm text-muted">{commandMessage}</span>}
            </div>
          </section>

          <section className="space-y-3 border-t border-line pt-5">
            <SectionHeader
              label="About & updates"
              detail={`greenroom ${update.currentVersion ? `v${update.currentVersion}` : ''}`}
              action={
                update.phase === 'downloaded' ? (
                  <Button size="sm" onClick={() => void api.updaterInstall()}>Restart to update</Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!update.supported || update.phase === 'checking' || update.phase === 'downloading'}
                    onClick={() => void checkForUpdates()}
                  >
                    {update.phase === 'checking' ? 'Checking…' : 'Check for updates'}
                  </Button>
                )
              }
            />
            <div className={`rounded-lg border p-3 text-xs ${update.phase === 'error' ? 'border-danger/35 bg-danger/10 text-danger' : 'border-line bg-sunken text-muted'}`}>
              <p>{update.supported ? updateDetail : 'Automatic updates are available in the installed Windows app.'}</p>
              {update.phase === 'downloading' && <div className="mt-3"><ProgressBar value={update.percent ?? 0} /></div>}
              {update.phase === 'error' && update.supported && (
                <Button className="mt-3" variant="ghost" size="sm" onClick={() => void checkForUpdates()}>Retry</Button>
              )}
            </div>
          </section>

          <section className="space-y-3 border-t border-line pt-5">
            <SectionHeader
              label="Get support"
              detail="Create a privacy-safe report when something is not working."
              icon={<LifeBuoy size={15} strokeWidth={2.1} aria-hidden="true" />}
            />
            <p className="text-xs leading-relaxed text-muted">
              The report includes app and system status, but never your Discord token, Spotify secret, or linked-account tokens. Review it before attaching it to an issue.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={() => void exportDiagnostics()}>Create support report</Button>
              <Button variant="ghost" size="sm" onClick={() => window.open('https://github.com/edwarddjss/greenroom/issues/new', '_blank')}>
                <ExternalLink size={14} strokeWidth={2.1} aria-hidden="true" />
                Report an issue
              </Button>
            </div>
          </section>
      </div>

      {toast && (
        <div className={`fixed bottom-5 right-5 z-10 animate-pop-in rounded-lg px-4 py-3 text-sm font-medium shadow-raised ${toast.tone === 'ok' ? 'bg-accent text-accent-ink' : 'bg-danger text-white'}`}>
          {toast.message}
        </div>
      )}
    </Modal>
  );
}

function SavedBadge({ saved }: { saved: boolean }): JSX.Element {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${saved ? 'bg-accent/15 text-accent' : 'bg-white/10 text-muted'}`}>
      {saved ? 'Saved' : 'Missing'}
    </span>
  );
}
