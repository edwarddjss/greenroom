import { useEffect, useMemo, useState } from 'react';
import type { CredsStatus, DiscordValidation, PrereqReport, SpotifyValidation, TunnelStatus, VbCableInstallResult } from '@greenroom/shared';
import { botInviteUrl } from '@greenroom/shared';
import { api } from '../lib/api';
import { Button, Code, Field, Modal, Pill, SectionHeader } from './ui';

const VISIBLE_PREREQS = [
  ['ffmpeg', 'FFmpeg'],
  ['vbcable', 'VB-Cable'],
  ['spotify', 'Spotify app'],
] as const;

function prereqTone(status: PrereqReport[keyof PrereqReport]): 'ok' | 'warn' | 'bad' | 'idle' {
  if (status.status === 'ok') return 'ok';
  if (status.status === 'unknown') return 'idle';
  if (status.confidence === 'user-confirmed' || status.confidence === 'not-verifiable') return 'warn';
  return 'bad';
}

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
  const [busy, setBusy] = useState<'scan' | 'discord' | 'spotify' | 'commands' | null>(null);
  const [tunnelBusy, setTunnelBusy] = useState(false);
  const [tunnel, setTunnel] = useState<TunnelStatus>({ running: false });
  const [commandMessage, setCommandMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: 'ok' | 'bad'; message: string } | null>(null);
  const [credsSummary, setCredsSummary] = useState<string>('Loading...');
  const [credsStatus, setCredsStatus] = useState<CredsStatus | null>(null);
  const [installingCable, setInstallingCable] = useState(false);
  const [cableInstallResult, setCableInstallResult] = useState<VbCableInstallResult | null>(null);

  useEffect(() => {
    void api.tunnelStatus().then(setTunnel);
    void api.credsStatus().then((status) => {
      setCredsStatus(status);
      const discord = status.hasDiscord ? 'Discord set' : 'Discord missing';
      const spotify = status.hasSpotify ? 'Spotify set' : 'Spotify missing';
      setCredsSummary(`${discord} · ${spotify}`);
    });
  }, []);

  const canInvite = /^\d{17,20}$/.test(discordClientId);
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

  const scan = async (): Promise<void> => {
    setBusy('scan');
    onPrereqs(await api.prereqsScan());
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

  const readyCount = useMemo(() => VISIBLE_PREREQS.filter(([key]) => prereqs[key].status === 'ok').length, [prereqs]);
  const vbCableNeedsAttention = prereqs.vbcable.status !== 'ok' && prereqs.vbcable.status !== 'unknown';
  const activeRedirectUri = tunnel.callbackUrl ?? 'Start the tunnel above to get the Spotify redirect URI.';
  const discordSaved = credsStatus?.hasDiscord === true;
  const spotifySaved = credsStatus?.hasSpotify === true;

  const exportDiagnostics = async (): Promise<void> => {
    const result = await api.diagnosticsExport();
    const opened = await api.diagnosticsOpen(result.path);
    showToast(opened.ok ? 'ok' : 'bad', opened.ok ? 'Diagnostics report opened.' : (opened.error ?? 'Diagnostics report was created, but could not be opened.'));
  };

  return (
    <Modal size="md" onClose={onClose} labelledBy="settings-title">
      <div className="flex items-start justify-between gap-3 border-b border-line p-5">
        <div>
          <h2 id="settings-title" className="text-base font-semibold tracking-tight">Settings</h2>
          <p className="mt-0.5 text-[13px] text-muted">{credsSummary} · {readyCount} of {VISIBLE_PREREQS.length} checks ready</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-auto p-5">
          <section className="space-y-3">
            <SectionHeader
              label="Installed status"
              action={
                <Button variant="ghost" size="sm" disabled={busy === 'scan'} onClick={() => void scan()}>
                  {busy === 'scan' ? 'Checking…' : 'Re-check'}
                </Button>
              }
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {VISIBLE_PREREQS.map(([key, label]) => (
                <Pill key={key} tone={prereqTone(prereqs[key])} label={label} detail={prereqs[key].detail} />
              ))}
            </div>
            {vbCableNeedsAttention && (
              <div className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm">
                <div className="font-semibold text-danger">VB-Cable issue detected</div>
                <div className="mt-1 text-muted">{prereqs.vbcable.detail ?? 'VB-Audio Virtual Cable was not detected.'}</div>
                <Button className="mt-3" variant="ghost" disabled={installingCable} onClick={() => void installCable()}>
                  {installingCable ? 'Installing…' : 'Install VB-Cable'}
                </Button>
                {cableInstallResult && (
                  <p className={`mt-2 text-xs ${cableInstallResult.ok ? 'text-accent' : 'text-danger'}`}>{cableInstallResult.message}</p>
                )}
              </div>
            )}
            <div className="rounded-lg border border-line bg-sunken p-3 text-sm">
              <div className="font-medium">Diagnostics</div>
              <p className="mt-1 text-xs text-muted">
                Exports a local JSON support report with platform info, app versions, prerequisite status, model presence, and which credentials are set. It does not include token values.
              </p>
              <Button className="mt-3" variant="ghost" size="sm" onClick={() => void exportDiagnostics()}>Export diagnostics</Button>
            </div>
          </section>

          <section className="space-y-3">
            <SectionHeader
              label="Public Spotify login"
              detail="Use this when friends need to link Spotify from outside the host PC."
              action={
                <div className="flex gap-2">
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
              <Field label="Bot token" mono type="password" placeholder={discordSaved ? 'Saved — leave blank to keep' : 'New bot token'} value={discordToken} onChange={(e) => setDiscordToken(e.target.value)} />
              <Field label="Application ID" mono placeholder={discordSaved ? 'Saved — leave blank to keep' : 'Application ID'} value={discordClientId} onChange={(e) => setDiscordClientId(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                <Button disabled={!hasDiscordDraft || busy === 'discord'} onClick={() => void saveDiscord()}>
                  {busy === 'discord' ? 'Saving…' : 'Validate & save'}
                </Button>
                <Button variant="ghost" disabled={!canInvite} onClick={() => window.open(botInviteUrl(discordClientId), '_blank')}>
                  Invite bot
                </Button>
              </div>
              {discordResult && !discordResult.ok && <p className="text-sm text-danger">{discordResult.error}</p>}
            </div>

            <div className="space-y-3">
              <SectionHeader label="Spotify app" action={<SavedBadge saved={spotifySaved} />} />
              <Code className={`block ${tunnel.callbackUrl ? '' : 'text-muted'}`}>{activeRedirectUri}</Code>
              <Field label="Client ID" mono placeholder={spotifySaved ? 'Saved — leave blank to keep' : 'New client ID'} value={spotifyClientId} onChange={(e) => setSpotifyClientId(e.target.value)} />
              <Field label="Client secret" mono type="password" placeholder={spotifySaved ? 'Saved — leave blank to keep' : 'New client secret'} value={spotifyClientSecret} onChange={(e) => setSpotifyClientSecret(e.target.value)} />
              <Button disabled={!hasSpotifyDraft || busy === 'spotify'} onClick={() => void saveSpotify()}>
                {busy === 'spotify' ? 'Saving…' : 'Validate & save'}
              </Button>
              {spotifyResult && !spotifyResult.ok && <p className="text-sm text-danger">{spotifyResult.error}</p>}
            </div>
          </section>

          <section className="space-y-3">
            <SectionHeader label="Discord commands" />
            <div className="flex items-center gap-2">
              <Button variant="ghost" disabled={busy === 'commands'} onClick={() => void registerCommands()}>
                {busy === 'commands' ? 'Registering…' : 'Register slash commands'}
              </Button>
              {commandMessage && <span className="text-sm text-muted">{commandMessage}</span>}
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
