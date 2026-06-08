import { useEffect, useState } from 'react';
import type { CredsStatus, DiscordValidation, EngineCredentials, PrereqReport, SpotifyValidation, TunnelStatus, VbCableInstallResult } from '@greenroom/shared';
import { botInviteUrl } from '@greenroom/shared';
import { api } from '../lib/api';
import { Icon } from './Icon';
import { Button, Code, Field, Modal, SectionHeader } from './ui';

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
  const [revealedCreds, setRevealedCreds] = useState<Partial<EngineCredentials> | null>(null);
  const [replacingDiscord, setReplacingDiscord] = useState(false);
  const [replacingSpotify, setReplacingSpotify] = useState(false);
  const [savedInviteUrl, setSavedInviteUrl] = useState<string | null>(null);
  const [installingCable, setInstallingCable] = useState(false);
  const [cableInstallResult, setCableInstallResult] = useState<VbCableInstallResult | null>(null);

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
      setRevealedCreds(null);
      setReplacingDiscord(false);
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
      setRevealedCreds(null);
      setReplacingSpotify(false);
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
    try {
      setTunnel(await api.tunnelStart());
    } catch (err) {
      setTunnel({ running: false, error: err instanceof Error ? err.message : 'Could not get the Spotify redirect.' });
    } finally {
      setTunnelBusy(false);
    }
  };

  const copyText = async (label: string, value: string | undefined): Promise<void> => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    showToast('ok', `${label} copied.`);
  };

  const revealCreds = async (): Promise<void> => {
    setRevealedCreds(await api.credsReveal());
  };

  const toggleRevealedCreds = (): void => {
    if (revealedCreds) setRevealedCreds(null);
    else void revealCreds();
  };

  const showToast = (tone: 'ok' | 'bad', message: string): void => {
    setToast({ tone, message });
    setTimeout(() => setToast(null), 2200);
  };

  const vbCableNeedsAttention = prereqs.vbcable.status !== 'ok' && prereqs.vbcable.status !== 'unknown';
  const activeRedirectUri = tunnel.callbackUrl ?? 'Get a redirect to add in Spotify.';
  const discordSaved = credsStatus?.hasDiscord === true;
  const spotifySaved = credsStatus?.hasSpotify === true;
  const showDiscordFields = !discordSaved || replacingDiscord;
  const showSpotifyFields = !spotifySaved || replacingSpotify;

  const exportDiagnostics = async (): Promise<void> => {
    const result = await api.diagnosticsExport();
    const opened = await api.diagnosticsOpen(result.path);
    showToast(opened.ok ? 'ok' : 'bad', opened.ok ? 'Diagnostics report opened.' : (opened.error ?? 'Diagnostics report was created, but could not be opened.'));
  };

  const openSupportIssue = async (): Promise<void> => {
    const result = await api.diagnosticsIssue();
    showToast(result.ok ? 'ok' : 'bad', result.ok ? 'Support request opened. Report copied to clipboard.' : (result.error ?? 'Could not open support.'));
  };

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
              label="Spotify redirect"
              detail="Greenroom starts this automatically with the bot. Refresh only when Spotify needs a new redirect URI."
              action={
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" size="sm" disabled={tunnelBusy} onClick={() => void startTunnel()}>
                    {tunnelBusy ? 'Refreshing…' : tunnel.callbackUrl ? 'Refresh redirect' : 'Get redirect'}
                  </Button>
                </div>
              }
            />
            <div className="space-y-2 rounded-lg border border-line bg-sunken p-3">
              <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                <Code className="min-w-0 truncate py-2">
                  {tunnel.callbackUrl ?? 'Get a redirect, then add it in Spotify.'}
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
              <p className="text-xs text-muted">Add this Redirect URI in the Spotify Developer Dashboard. If the bot is already running, Greenroom restarts it after the redirect changes.</p>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <SectionHeader
                label="Discord bot"
                action={discordSaved && !replacingDiscord ? (
                  <Button variant="ghost" size="sm" onClick={() => setReplacingDiscord(true)}>Replace</Button>
                ) : null}
              />
              {discordSaved && !replacingDiscord ? (
                <div className="space-y-2">
                  <CredentialValue label="Bot token" value={revealedCreds?.discordToken} onReveal={toggleRevealedCreds} />
                  <CredentialValue
                    label="Application ID"
                    value={revealedCreds?.discordClientId}
                    onReveal={toggleRevealedCreds}
                  />
                </div>
              ) : (
                <>
                  <Field label="Bot token" mono type="password" placeholder="Bot token" value={discordToken} onChange={(e) => setDiscordToken(e.target.value)} />
                  <Field label="Application ID" mono placeholder="Application ID" value={discordClientId} onChange={(e) => setDiscordClientId(e.target.value)} />
                </>
              )}
              <div className="flex flex-wrap gap-2">
                {showDiscordFields && (
                  <Button disabled={!hasDiscordDraft || busy === 'discord'} onClick={() => void saveDiscord()}>
                    {busy === 'discord' ? 'Saving…' : 'Validate & save'}
                  </Button>
                )}
                {replacingDiscord && <Button variant="ghost" onClick={() => setReplacingDiscord(false)}>Cancel</Button>}
                <Button variant="ghost" disabled={!inviteUrl} onClick={() => inviteUrl && window.open(inviteUrl, '_blank')}>
                  Invite bot
                </Button>
              </div>
              {discordResult && !discordResult.ok && <p className="text-sm text-danger">{discordResult.error}</p>}
            </div>

            <div className="space-y-3">
              <SectionHeader
                label="Spotify app"
                action={spotifySaved && !replacingSpotify ? (
                  <Button variant="ghost" size="sm" onClick={() => setReplacingSpotify(true)}>Replace</Button>
                ) : null}
              />
              <Code className={`block break-all whitespace-normal ${tunnel.callbackUrl ? '' : 'text-muted'}`}>{activeRedirectUri}</Code>
              {spotifySaved && !replacingSpotify ? (
                <div className="space-y-2">
                  <CredentialValue label="Client ID" value={revealedCreds?.spotifyClientId} onReveal={toggleRevealedCreds} />
                  <CredentialValue
                    label="Client secret"
                    value={revealedCreds?.spotifyClientSecret}
                    onReveal={toggleRevealedCreds}
                  />
                </div>
              ) : (
                <>
                  <Field label="Client ID" mono placeholder="Client ID" value={spotifyClientId} onChange={(e) => setSpotifyClientId(e.target.value)} />
                  <Field label="Client secret" mono type="password" placeholder="Client secret" value={spotifyClientSecret} onChange={(e) => setSpotifyClientSecret(e.target.value)} />
                </>
              )}
              <div className="flex flex-wrap gap-2">
                {showSpotifyFields && (
                  <Button disabled={!hasSpotifyDraft || busy === 'spotify'} onClick={() => void saveSpotify()}>
                    {busy === 'spotify' ? 'Saving…' : 'Validate & save'}
                  </Button>
                )}
                {replacingSpotify && <Button variant="ghost" onClick={() => setReplacingSpotify(false)}>Cancel</Button>}
              </div>
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
              label="Support"
              detail="Open a GitHub issue with a safe app report attached."
              icon={<Icon name="lifebuoy" size={16} />}
            />
            <p className="text-xs leading-relaxed text-muted">
              The report includes app and system status. It never includes Discord tokens, Spotify secrets, or linked-account tokens.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void openSupportIssue()}>
                <Icon name="link" size={14} />
                Open support request
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void exportDiagnostics()}>Save report</Button>
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

function CredentialValue({
  label,
  value,
  onReveal,
}: {
  label: string;
  value: string | undefined;
  onReveal: () => void;
}): JSX.Element {
  const visible = Boolean(value);
  return (
    <div className="grid gap-2 md:grid-cols-[110px_minmax(0,1fr)_auto] md:items-center">
      <span className="text-xs font-medium text-muted">{label}</span>
      <Code className="block min-w-0 truncate py-2">{visible ? value : '************'}</Code>
      <Button variant="ghost" size="sm" onClick={onReveal}>{visible ? 'Hide' : 'Reveal'}</Button>
    </div>
  );
}
