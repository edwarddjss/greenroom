import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DiscordValidation, PrereqReport, SpotifyValidation, TunnelStatus } from '@greenroom/shared';
import { EMPTY_PREREQS, botInviteUrl } from '@greenroom/shared';
import { Copy, ExternalLink, PlayCircle, X } from 'lucide-react';
import { api } from '../lib/api';
import { Button, Card, Pill, ProgressBar } from './ui';

type StepId = 'welcome' | 'vbcable' | 'routing' | 'discord' | 'spotify' | 'commands' | 'invite' | 'model' | 'finish';
const ORDER: StepId[] = ['welcome', 'vbcable', 'routing', 'discord', 'spotify', 'commands', 'invite', 'model', 'finish'];
const TITLES: Record<StepId, string> = {
  welcome: 'Welcome',
  vbcable: 'Audio cable',
  routing: 'Route Spotify',
  discord: 'Discord bot',
  spotify: 'Spotify app',
  commands: 'Commands',
  invite: 'Invite bot',
  model: 'Local AI model',
  finish: 'Prove it works',
};

type GuideId = 'discord' | 'spotify' | 'routing' | 'vbcable';

interface Guide {
  title: string;
  summary: string;
  primaryLabel: string;
  primaryUrl: string;
  videoSrc?: string;
  posterSrc?: string;
  steps: string[];
}

const GUIDES: Record<GuideId, Guide> = {
  discord: {
    title: 'Discord bot setup',
    summary: 'Create the application, add a bot, enable Message Content Intent, then copy the bot token and Application ID.',
    primaryLabel: 'Open Discord Developer Portal',
    primaryUrl: 'https://discord.com/developers/applications',
    videoSrc: '/guides/discord-bot.webm',
    posterSrc: '/guides/discord-bot-poster.jpg',
    steps: [
      'Create a new application.',
      'Open General Information and copy the Application ID.',
      'Open Bot, then reset or copy the bot token.',
      'Enable Message Content Intent under Privileged Gateway Intents.',
    ],
  },
  spotify: {
    title: 'Spotify app setup',
    summary: 'Create or open a Spotify developer app, add the exact redirect URI from greenroom, then copy the Client ID and Client Secret.',
    primaryLabel: 'Open Spotify Dashboard',
    primaryUrl: 'https://developer.spotify.com/dashboard',
    videoSrc: '/guides/spotify-app.webm',
    posterSrc: '/guides/spotify-app-poster.jpg',
    steps: [
      'Create a Spotify app, or open the greenroom app if you already made one.',
      'Copy the Client ID and reveal the Client Secret.',
      'Open app settings.',
      'Paste the redirect URI shown in greenroom, including /callback.',
      'Click Add, save the Spotify app, then paste the Client ID and Client Secret into greenroom.',
    ],
  },
  routing: {
    title: 'Route Spotify audio',
    summary: 'Set only Spotify to the virtual cable so greenroom captures music without routing every system sound.',
    primaryLabel: 'Open Windows volume mixer',
    primaryUrl: 'ms-settings:apps-volume',
    steps: [
      'Open Windows Volume Mixer.',
      'Find Spotify in the app list.',
      'Set Spotify output to CABLE Input (VB-Audio Virtual Cable).',
      'Leave system output on your headphones or speakers.',
    ],
  },
  vbcable: {
    title: 'Install VB-Cable',
    summary: 'VB-Cable creates the virtual audio path used to capture Spotify from the host PC.',
    primaryLabel: 'Open VB-Cable download page',
    primaryUrl: 'https://vb-audio.com/Cable/',
    steps: [
      'Download VB-Cable from VB-Audio.',
      'Run the installer as administrator.',
      'Restart Windows if the installer asks.',
      'Reopen greenroom and re-check this step.',
    ],
  },
};

export function Wizard({ onDone }: { onDone: () => void }): JSX.Element {
  const [stepIdx, setStepIdx] = useState(0);
  const step = ORDER[stepIdx] ?? 'welcome';

  const [prereqs, setPrereqs] = useState<PrereqReport>(EMPTY_PREREQS);
  const [scanning, setScanning] = useState(false);

  const [discordToken, setDiscordToken] = useState('');
  const [discordClientId, setDiscordClientId] = useState('');
  const [discordResult, setDiscordResult] = useState<DiscordValidation | null>(null);
  const [discordBusy, setDiscordBusy] = useState(false);

  const [spotifyClientId, setSpotifyClientId] = useState('');
  const [spotifyClientSecret, setSpotifyClientSecret] = useState('');
  const [spotifyResult, setSpotifyResult] = useState<SpotifyValidation | null>(null);
  const [spotifyBusy, setSpotifyBusy] = useState(false);
  const [tunnel, setTunnel] = useState<TunnelStatus>({ running: false });
  const [tunnelBusy, setTunnelBusy] = useState(false);

  const [routingConfirmed, setRoutingConfirmed] = useState(false);
  const [commandResult, setCommandResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [commandsBusy, setCommandsBusy] = useState(false);
  const [inviteOpened, setInviteOpened] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [guide, setGuide] = useState<GuideId | null>(null);
  const markModelReady = useCallback(() => setModelReady(true), []);

  const scan = async (): Promise<void> => {
    setScanning(true);
    setPrereqs(await api.prereqsScan());
    setScanning(false);
  };

  useEffect(() => {
    void scan();
    void api.tunnelStatus().then(setTunnel);
  }, []);

  // Debounced Discord validation.
  useEffect(() => {
    if (!discordToken || !discordClientId) {
      setDiscordResult(null);
      return;
    }
    setDiscordBusy(true);
    const t = setTimeout(() => {
      void api.validateDiscord(discordToken, discordClientId).then((r) => {
        setDiscordResult(r);
        setDiscordBusy(false);
        if (r.ok) void api.credsSave({ discordToken, discordClientId });
      });
    }, 600);
    return () => clearTimeout(t);
  }, [discordToken, discordClientId]);

  // Debounced Spotify validation.
  useEffect(() => {
    if (!spotifyClientId || !spotifyClientSecret) {
      setSpotifyResult(null);
      return;
    }
    setSpotifyBusy(true);
    const t = setTimeout(() => {
      void api.validateSpotify(spotifyClientId, spotifyClientSecret).then((r) => {
        setSpotifyResult(r);
        setSpotifyBusy(false);
        if (r.ok) void api.credsSave({ spotifyClientId, spotifyClientSecret });
      });
    }, 600);
    return () => clearTimeout(t);
  }, [spotifyClientId, spotifyClientSecret]);

  const canNext = useMemo<boolean>(() => {
    switch (step) {
      case 'vbcable':
        return prereqs.vbcable.status === 'ok' && prereqs.ffmpeg.status === 'ok';
      case 'routing':
        return routingConfirmed;
      case 'discord':
        return discordResult?.ok === true;
      case 'spotify':
        return spotifyResult?.ok === true;
      case 'commands':
        return commandResult?.ok === true;
      case 'invite':
        return inviteOpened;
      case 'model':
        return modelReady;
      default:
        return true;
    }
  }, [step, prereqs, routingConfirmed, discordResult, spotifyResult, commandResult, inviteOpened, modelReady]);

  const next = (): void => {
    if (!canNext) return;
    setStepIdx((i) => Math.min(ORDER.length - 1, i + 1));
  };
  const back = (): void => setStepIdx((i) => Math.max(0, i - 1));
  const startTunnel = async (): Promise<void> => {
    setTunnelBusy(true);
    setTunnel(await api.tunnelStart());
    setTunnelBusy(false);
  };
  const copyText = async (value: string | undefined): Promise<void> => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
  };

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-5 p-6">
      <div className="flex items-center gap-2">
        {ORDER.map((id, i) => (
          <div key={id} className={`h-1.5 flex-1 rounded-full ${i <= stepIdx ? 'bg-spotify' : 'bg-white/10'}`} />
        ))}
      </div>
      <h1 className="text-2xl font-bold">
        {TITLES[step]} <span className="text-muted text-base">· step {stepIdx + 1} of {ORDER.length}</span>
      </h1>

      <Card className="flex-1 overflow-auto">
        {step === 'welcome' && (
          <div className="space-y-3 text-sm leading-relaxed">
            <p>greenroom streams your own Spotify audio into a Discord voice channel, from your PC. This wizard gets you from zero to "Discord heard your Spotify."</p>
            <p className="text-muted">You'll need: a Discord account, Spotify Premium, and about 10 minutes. We'll install an audio cable and walk through two developer portals.</p>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Pill tone={prereqs.ffmpeg.status === 'ok' ? 'ok' : 'idle'} label="FFmpeg" detail={prereqs.ffmpeg.detail} />
              <Pill tone={prereqs.vbcable.status === 'ok' ? 'ok' : 'idle'} label="VB-Cable" detail={prereqs.vbcable.detail} />
            </div>
          </div>
        )}

        {step === 'vbcable' && (
          <div className="space-y-4 text-sm">
            <p>greenroom captures Spotify through VB-Audio Virtual Cable. {prereqs.vbcable.status === 'ok' ? 'It is installed.' : 'It is not installed yet.'}</p>
            <Pill tone={prereqs.vbcable.status === 'ok' ? 'ok' : 'bad'} label="VB-Cable" detail={prereqs.vbcable.detail} />
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => setGuide('vbcable')}>
                <PlayCircle size={16} strokeWidth={2.1} aria-hidden="true" />
                Show guide
              </Button>
              <Button variant="ghost" onClick={() => void api.vbcableInstall()}>Run installer (admin)</Button>
              <Button variant="ghost" disabled={scanning} onClick={() => void scan()}>{scanning ? 'Scanning…' : 'Re-check'}</Button>
            </div>
            <p className="text-muted text-xs">Installing VB-Cable needs admin rights and a reboot. After rebooting, reopen greenroom and we'll resume here.</p>
          </div>
        )}

        {step === 'routing' && (
          <div className="space-y-4 text-sm">
            <p>In the Windows Volume Mixer, set <b>Spotify</b>'s output device to <b>CABLE Input (VB-Audio Virtual Cable)</b>. Keep your system output on your real speakers so only Spotify is routed.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => setGuide('routing')}>
                <PlayCircle size={16} strokeWidth={2.1} aria-hidden="true" />
                Show guide
              </Button>
              <Button variant="ghost" onClick={() => window.open(GUIDES.routing.primaryUrl, '_blank')}>
                <ExternalLink size={16} strokeWidth={2.1} aria-hidden="true" />
                Open volume mixer
              </Button>
            </div>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={routingConfirmed} onChange={(e) => setRoutingConfirmed(e.target.checked)} />
              I set Spotify's output to CABLE Input
            </label>
            <p className="text-muted text-xs">Windows can't tell us app routing programmatically, so this is user-confirmed. The final step verifies real audio.</p>
          </div>
        )}

        {step === 'discord' && (
          <div className="space-y-3 text-sm">
            <p>Create a bot at the Discord Developer Portal, enable Message Content Intent, and paste the token and Application ID.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => setGuide('discord')}>
                <PlayCircle size={16} strokeWidth={2.1} aria-hidden="true" />
                Show guide
              </Button>
              <Button variant="ghost" onClick={() => window.open(GUIDES.discord.primaryUrl, '_blank')}>
                <ExternalLink size={16} strokeWidth={2.1} aria-hidden="true" />
                Open portal
              </Button>
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted">Bot token</span>
              <input className="w-full rounded-lg bg-black/40 px-3 py-2 font-mono" placeholder="Paste the bot token" type="password" value={discordToken} onChange={(e) => setDiscordToken(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted">Application ID</span>
              <input className="w-full rounded-lg bg-black/40 px-3 py-2 font-mono" placeholder="17-20 digit Application ID" value={discordClientId} onChange={(e) => setDiscordClientId(e.target.value)} />
            </label>
            {discordBusy && <p className="text-muted text-xs">Checking…</p>}
            {discordResult?.ok && (
              <div className="flex items-center gap-2 text-spotify">
                {discordResult.avatarUrl && <img src={discordResult.avatarUrl} alt="" className="h-6 w-6 rounded-full" />}
                Connected as {discordResult.botName}
              </div>
            )}
            {discordResult && !discordResult.ok && <p className="text-danger text-xs">{discordResult.error}</p>}
          </div>
        )}

        {step === 'spotify' && (
          <div className="space-y-3 text-sm">
            <p>Create or open a Spotify app in the Developer Dashboard. Set the Redirect URI to exactly:</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => setGuide('spotify')}>
                <PlayCircle size={16} strokeWidth={2.1} aria-hidden="true" />
                Show guide
              </Button>
              <Button variant="ghost" onClick={() => window.open(GUIDES.spotify.primaryUrl, '_blank')}>
                <ExternalLink size={16} strokeWidth={2.1} aria-hidden="true" />
                Open dashboard
              </Button>
            </div>
            <div className="grid gap-2 md:grid-cols-[1fr_auto]">
              <code className={`block min-w-0 truncate rounded-lg bg-black/40 px-3 py-2 ${tunnel.callbackUrl ? '' : 'text-muted'}`}>
                {tunnel.callbackUrl ?? 'Start the tunnel to get the Spotify redirect URI.'}
              </code>
              <div className="flex gap-2">
                <Button variant="ghost" disabled={tunnelBusy} onClick={() => void startTunnel()}>
                  {tunnelBusy ? 'Starting...' : tunnel.callbackUrl ? 'Refresh tunnel' : 'Start tunnel'}
                </Button>
                <Button variant="ghost" disabled={!tunnel.callbackUrl} onClick={() => void copyText(tunnel.callbackUrl)}>
                  <Copy size={16} strokeWidth={2.1} aria-hidden="true" />
                  Copy
                </Button>
              </div>
            </div>
            {tunnel.error && <p className="text-warn text-xs">{tunnel.error}</p>}
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted">Client ID</span>
              <input className="w-full rounded-lg bg-black/40 px-3 py-2 font-mono" placeholder="Paste the Spotify Client ID" value={spotifyClientId} onChange={(e) => setSpotifyClientId(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted">Client Secret</span>
              <input className="w-full rounded-lg bg-black/40 px-3 py-2 font-mono" placeholder="Paste the Spotify Client Secret" type="password" value={spotifyClientSecret} onChange={(e) => setSpotifyClientSecret(e.target.value)} />
            </label>
            {spotifyBusy && <p className="text-muted text-xs">Checking…</p>}
            {spotifyResult?.ok && <p className="text-spotify">Spotify credentials verified.</p>}
            {spotifyResult && !spotifyResult.ok && <p className="text-danger text-xs">{spotifyResult.error}</p>}
          </div>
        )}

        {step === 'commands' && (
          <div className="space-y-3 text-sm">
            <p>Register the slash commands ( /login, /play, /queue, /stop, /effect ) with Discord.</p>
            <Button
              disabled={commandsBusy}
              onClick={() => {
                setCommandsBusy(true);
                void api.commandsRegister()
                  .then((r) =>
                    setCommandResult({
                      ok: r.ok,
                      message: r.ok ? `Registered (${r.scope}).` : (r.error ?? 'Failed.'),
                    }),
                  )
                  .finally(() => setCommandsBusy(false));
              }}
            >
              {commandsBusy ? 'Registering...' : 'Register commands'}
            </Button>
            {commandResult && (
              <p className={commandResult.ok ? 'text-spotify' : 'text-danger'}>{commandResult.message}</p>
            )}
          </div>
        )}

        {step === 'invite' && (
          <div className="space-y-3 text-sm">
            <p>Invite the bot to your server with the right permissions.</p>
            <Button
              variant="ghost"
              onClick={() => {
                window.open(botInviteUrl(discordClientId), '_blank');
                setInviteOpened(true);
              }}
              disabled={!discordClientId}
            >
              Open invite link
            </Button>
            {inviteOpened && <p className="text-spotify">Invite link opened.</p>}
          </div>
        )}

        {step === 'model' && <ModelStep onReady={markModelReady} />}

        {step === 'finish' && <FinishStep />}
      </Card>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={back} disabled={stepIdx === 0}>Back</Button>
        {step === 'finish' ? (
          <Button onClick={() => { void api.engineStart(); onDone(); }}>Go to dashboard</Button>
        ) : (
          <Button onClick={next} disabled={!canNext}>Next</Button>
        )}
      </div>

      {guide && <GuideModal guide={GUIDES[guide]} onClose={() => setGuide(null)} />}
    </div>
  );
}

function GuideModal({ guide, onClose }: { guide: Guide; onClose: () => void }): JSX.Element {
  const [videoFailed, setVideoFailed] = useState(false);
  const showVideo = Boolean(guide.videoSrc && !videoFailed);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <Card className="max-h-[calc(100vh-48px)] w-full max-w-4xl space-y-4 overflow-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{guide.title}</h2>
            <p className="mt-1 text-sm text-muted">{guide.summary}</p>
          </div>
          <button
            className="app-no-drag grid h-11 w-11 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
            aria-label="Close guide"
            title="Close"
            onClick={onClose}
          >
            <X size={18} strokeWidth={2.1} aria-hidden="true" />
          </button>
        </div>

        {showVideo ? (
          <video
            className="aspect-[8/5] w-full rounded-lg border border-white/5 bg-black"
            src={guide.videoSrc}
            poster={guide.posterSrc}
            controls
            muted
            playsInline
            onError={() => setVideoFailed(true)}
          />
        ) : (
          <div className="rounded-lg border border-white/5 bg-black/30 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <PlayCircle size={16} strokeWidth={2.1} aria-hidden="true" />
              Setup walkthrough
            </div>
            <div className="space-y-2">
              {guide.steps.map((item, index) => (
                <div key={item} className="flex gap-3 rounded-lg bg-white/[0.03] px-3 py-2 text-sm">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/10 text-xs text-white/75">{index + 1}</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button onClick={() => window.open(guide.primaryUrl, '_blank')}>
            <ExternalLink size={16} strokeWidth={2.1} aria-hidden="true" />
            {guide.primaryLabel}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function ModelStep({ onReady }: { onReady: () => void }): JSX.Element {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const off = api.onModelProgress((p) => {
      setProgress(p.totalBytes ? (p.receivedBytes / p.totalBytes) * 100 : 0);
    });
    setError(null);
    void api.modelEnsure()
      .then(() => {
        setProgress(100);
        setError(null);
        onReady();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Model download failed.');
      });
    return off;
  }, [attempt, onReady]);

  return (
    <div className="space-y-4 text-sm">
      <p>greenroom uses a local model for conversational command routing. Wait for this download to finish before continuing.</p>
      <div>
        <div className="mb-1 flex justify-between text-xs text-muted">
          <span>Local AI model</span>
          <span>{progress === null ? 'starting…' : progress >= 100 ? 'ready' : `${Math.round(progress)}%`}</span>
        </div>
        <ProgressBar value={progress ?? 0} />
      </div>
      {error && (
        <div className="space-y-2">
          <p className="text-danger text-xs">{error}</p>
          <Button variant="ghost" onClick={() => setAttempt((n) => n + 1)}>Retry</Button>
        </div>
      )}
    </div>
  );
}

function FinishStep(): JSX.Element {
  return (
    <div className="space-y-4 text-sm">
      <p>Last step: prove the loop works. Start the bot, run <code>/login</code> in Discord, join a voice channel, and run <code>/play</code>.</p>
      <p className="text-muted text-xs">Success = the dashboard shows Capture active with a non-silent audio level. If it's silent, your Spotify routing (step 3) is off.</p>
    </div>
  );
}
