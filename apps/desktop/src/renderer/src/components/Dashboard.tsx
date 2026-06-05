import { useEffect, useRef, useState } from 'react';
import type { EngineSnapshot, EngineState, LogLine } from '@greenroom/shared';
import { EMPTY_PREREQS } from '@greenroom/shared';
import { AlertTriangle, CheckCircle2, MessageCircle, Power, Settings, Square, UserPlus } from 'lucide-react';
import { api } from '../lib/api';
import { Button, Card, Code, Modal, SectionHeader, StatusDot } from './ui';
import { SettingsModal } from './SettingsModal';

const STATE_LABEL: Record<EngineState, { label: string; tone: 'ok' | 'warn' | 'bad' | 'idle' }> = {
  idle: { label: 'Stopped', tone: 'idle' },
  preflight: { label: 'Preflight', tone: 'warn' },
  starting: { label: 'Starting…', tone: 'warn' },
  running: { label: 'Running', tone: 'ok' },
  degraded: { label: 'Degraded', tone: 'warn' },
  stopping: { label: 'Stopping…', tone: 'warn' },
  crashed: { label: 'Crashed', tone: 'bad' },
};

interface FriendlyLogItem {
  title: string;
  detail?: string;
  tone: 'ok' | 'warn' | 'bad' | 'idle';
}

interface ActivityItem extends FriendlyLogItem {
  key: string;
  ts: number;
}

function isAudioEngineLine(text: string): boolean {
  return /^\[AudioEngine(?:\s+FFmpeg)?\]/i.test(text) || /^\[Error\]\s+FFmpeg/i.test(text);
}

function isAudioEngineProblem(text: string): boolean {
  return isAudioEngineLine(text) && /failed|error|not found|cannot|invalid|unavailable/i.test(text);
}

function isFfmpegContinuationLine(text: string): boolean {
  return (
    /^\s*(built with|configuration:|libav\w+|libsw\w+|libpostproc)\b/i.test(text) ||
    /^\s*--enable-/i.test(text) ||
    /^\s*(Input|Output|Duration|Stream|Metadata|encoder)\b/i.test(text) ||
    /^\s*\S+\s*->\s*#\d+/i.test(text)
  );
}

function isRoutineLog(text: string): boolean {
  return (
    /^=+$/.test(text.trim()) ||
    /engine bootstrapping/i.test(text) ||
    /auth server listening/i.test(text) ||
    /login links use/i.test(text) ||
    /redirect URI is/i.test(text) ||
    /logged in as/i.test(text) ||
    /using the rule-based parser/i.test(text) ||
    /\[Bootstrap\] Fix: open the Discord Developer Portal/i.test(text) ||
    /loaded \d+ linked Spotify profile/i.test(text) ||
    /loaded \d+ user profile/i.test(text) ||
    /\[Bot\] Ready\. Loaded \d+ user profile mapping/i.test(text) ||
    /local llm ready/i.test(text) ||
    /\[SemanticParser\]/i.test(text) ||
    /\[Spotify\] Searching /i.test(text) ||
    /\[VoiceConnection\] Ready/i.test(text) ||
    /\[DiscordVoicePlayer\] Streaming loopback audio/i.test(text) ||
    /\[Bot\] Optimizing bitrate/i.test(text) ||
    /\[Bot\] Could not optimize bitrate/i.test(text)
  );
}

function isUserFacingLog(line: LogLine): boolean {
  const text = line.text;
  if (isRoutineLog(text)) return false;
  if (isFfmpegContinuationLine(text)) return false;
  if (isAudioEngineLine(text) && !isAudioEngineProblem(text)) return false;
  return true;
}

function friendlyLog(line: LogLine): FriendlyLogItem {
  const text = line.text;
  if (/discord login failed.*used disallowed intents/i.test(text)) {
    return {
      title: 'Discord setup needs attention',
      detail: 'Enable Message Content Intent in the Discord Developer Portal, then start the bot again.',
      tone: 'bad',
    };
  }
  if (/discord login failed/i.test(text)) {
    return { title: 'Discord login failed', detail: text.replace(/^.*discord login failed:\s*/i, ''), tone: 'bad' };
  }
  if (/port .* already in use|port .* unavailable/i.test(text)) return { title: 'Spotify login port is busy', detail: 'Another app is using the login callback port.', tone: 'bad' };
  if (/spotify linked|authorization successful/i.test(text)) return { title: 'Spotify account linked', detail: 'A user completed Spotify login.', tone: 'ok' };
  if (/\[AudioRouting\] Spotify audio is routed/i.test(text)) return { title: 'Spotify audio routed', detail: 'Spotify is now sending music to Discord.', tone: 'ok' };
  if (/\[AudioRouting\] Spotify audio was restored/i.test(text)) return { title: 'Spotify audio restored', detail: 'Spotify is back on your normal output.', tone: 'idle' };
  if (/\[AudioRouting\] Could not route Spotify automatically/i.test(text)) {
    return { title: 'Spotify audio routing needs attention', detail: 'Open Spotify and try again. If it stays silent, use the support report.', tone: 'warn' };
  }
  if (/\[AudioRouting\] Could not restore Spotify audio/i.test(text)) {
    return { title: 'Spotify audio did not restore', detail: 'Set Spotify back to your speakers in Windows Volume Mixer.', tone: 'warn' };
  }
  if (isAudioEngineProblem(text)) return { title: 'Audio capture issue', detail: 'greenroom could not start the local audio stream.', tone: 'bad' };
  if (/auto-resume failed/i.test(text)) return { title: 'Spotify playback did not auto-start', detail: 'Open Spotify desktop and start playback, then try again.', tone: 'warn' };
  if (/failed|error|critical/i.test(text)) return { title: 'Something needs attention', detail: text, tone: 'bad' };
  if (/warn|warning/i.test(text) || line.level === 'warn') return { title: 'Heads up', detail: text, tone: 'warn' };
  return { title: text.replace(/^\[[^\]]+\]\s*/, ''), tone: line.level === 'error' ? 'bad' : 'idle' };
}

export function Dashboard(): JSX.Element {
  const [snapshot, setSnapshot] = useState<EngineSnapshot>({
    state: 'idle',
    prereqs: EMPTY_PREREQS,
    spotifyLinked: false,
    captureActive: false,
  });
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [vbAlertDismissed, setVbAlertDismissed] = useState(false);
  const snapshotRef = useRef(snapshot);

  const addActivity = (item: ActivityItem): void => {
    setActivity((prev) => [...prev.filter((entry) => entry.key !== item.key), item].slice(-50));
  };

  const applySnapshot = (next: EngineSnapshot): void => {
    const previous = snapshotRef.current;
    snapshotRef.current = next;
    setSnapshot(next);
    if (next.state === 'running' && previous.state !== 'running') {
      addActivity({ key: 'bot-online', ts: Date.now(), title: 'Bot is online', detail: 'Ready for commands in Discord.', tone: 'ok' });
    }
    if (next.state === 'idle' && previous.state !== 'idle') {
      addActivity({ key: 'bot-offline', ts: Date.now(), title: 'Bot stopped', detail: 'Start it again when you want to use Discord commands.', tone: 'idle' });
    }
    if (next.spotifyLinked && !previous.spotifyLinked) {
      addActivity({ key: 'spotify-linked', ts: Date.now(), title: 'Spotify account linked', detail: 'Spotify requests are ready.', tone: 'ok' });
    }
    if (next.captureActive && !previous.captureActive) {
      addActivity({ key: 'music-streaming', ts: Date.now(), title: 'Music is streaming', detail: 'Spotify audio is playing in Discord.', tone: 'ok' });
    }
    if (next.lastError && next.lastError !== previous.lastError) {
      addActivity({ key: `error-${next.lastError}`, ts: Date.now(), title: 'Something needs attention', detail: next.lastError, tone: 'bad' });
    }
  };

  useEffect(() => {
    void api.engineGetSnapshot().then(applySnapshot);
    void api.prereqsScan();
    void api.discordInviteUrl().then(setInviteUrl);
    const offState = api.onEngineState(applySnapshot);
    const offLog = api.onEngineLog((lines) => {
      for (const line of lines) {
        if (!isUserFacingLog(line)) continue;
        const item = friendlyLog(line);
        addActivity({ ...item, key: `${item.title}\n${item.detail ?? ''}`, ts: line.ts });
      }
    });
    const offPrereqs = api.onPrereqs((prereqs) => setSnapshot((prev) => ({ ...prev, prereqs })));
    return () => {
      offState();
      offLog();
      offPrereqs();
    };
  }, []);

  const running = snapshot.state === 'running' || snapshot.state === 'degraded' || snapshot.state === 'starting';
  const stateInfo = STATE_LABEL[snapshot.state];
  const vbCableProblem = snapshot.prereqs.vbcable.status !== 'ok' && snapshot.prereqs.vbcable.status !== 'unknown';
  const needsSetup = !snapshot.spotifyLinked;
  const homeTone = snapshot.lastError ? 'bad' : !running ? 'idle' : needsSetup ? 'warn' : 'ok';
  const homeTitle = snapshot.lastError
    ? 'Something needs attention'
    : !running
      ? 'Bot is off'
      : needsSetup
        ? 'Spotify needs linking'
        : snapshot.captureActive
          ? 'Music is streaming'
          : 'Ready in Discord';
  const nextStep = snapshot.lastError
    ? snapshot.lastError
    : !running
      ? 'Start the bot before using Discord commands.'
      : needsSetup
        ? 'In Discord, run /login and link your Spotify account.'
        : snapshot.captureActive
          ? 'Use /queue to add more music or /clearqueue to empty a long playlist.'
          : 'Use /play with a song name, playlist, or Spotify link.';
  return (
    <div className="mx-auto h-full max-w-5xl overflow-auto p-4 sm:p-6">
      <div className="flex min-h-full flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 rounded-full border border-line bg-white/[0.04] px-3 py-1 text-[13px] font-medium">
            <StatusDot tone={stateInfo.tone} />
            {stateInfo.label}
          </span>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" disabled={!inviteUrl} onClick={() => inviteUrl && window.open(inviteUrl, '_blank')}>
            <UserPlus size={16} strokeWidth={2.1} aria-hidden="true" />
            Invite bot
          </Button>
          <Button variant="ghost" onClick={() => setSettingsOpen(true)}>
            <Settings size={16} strokeWidth={2.1} aria-hidden="true" />
            Settings
          </Button>
          {running ? (
            <Button variant="danger" onClick={() => void api.engineStop().then(applySnapshot)}>
              <Square size={15} strokeWidth={2.2} aria-hidden="true" />
              Stop
            </Button>
          ) : (
            <Button onClick={() => void api.engineStart().then(applySnapshot)}>
              <Power size={16} strokeWidth={2.1} aria-hidden="true" />
              Start bot
            </Button>
          )}
        </div>
      </header>

      <div className="grid gap-4 min-[980px]:grid-cols-[320px_minmax(0,1fr)]">
        <section className="grid min-h-0 content-start gap-4">
          <Card className="space-y-5">
            <div className="flex items-start gap-3">
              <div
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg border ${
                  snapshot.lastError
                    ? 'border-danger/25 bg-danger/10'
                    : homeTone === 'ok'
                      ? 'border-accent/25 bg-accent/10'
                      : homeTone === 'idle'
                        ? 'border-line bg-white/[0.03]'
                      : 'border-warn/25 bg-warn/10'
                }`}
              >
                {snapshot.lastError ? (
                  <AlertTriangle size={20} strokeWidth={2.1} className="text-danger" aria-hidden="true" />
                ) : (
                  <CheckCircle2
                    size={20}
                    strokeWidth={2.1}
                    className={homeTone === 'ok' ? 'text-accent' : homeTone === 'idle' ? 'text-muted' : 'text-warn'}
                    aria-hidden="true"
                  />
                )}
              </div>
              <div className="min-w-0">
                <h1 className="text-base font-semibold tracking-tight">{homeTitle}</h1>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">{nextStep}</p>
              </div>
            </div>

            <div className="space-y-2">
              <StatusRow tone={stateInfo.tone} label="Bot" value={running ? 'Online' : stateInfo.label} />
              <StatusRow
                tone={!running ? 'idle' : snapshot.spotifyLinked ? 'ok' : 'warn'}
                label="Spotify"
                value={!running ? 'Checked on start' : snapshot.spotifyLinked ? 'Linked' : 'Needs /login'}
              />
              <StatusRow
                tone={snapshot.captureActive ? 'ok' : 'idle'}
                label="Audio"
                value={snapshot.captureActive ? 'Streaming' : running ? 'Starts with /play' : 'Off'}
              />
            </div>
          </Card>

          <Card className="space-y-3">
            <SectionHeader
              label="Use in Discord"
              icon={<MessageCircle size={15} strokeWidth={2.1} aria-hidden="true" />}
            />
            <div className="space-y-2 text-sm">
              <CommandRow command="/login" detail="Link Spotify once." />
              <CommandRow command="/play" detail="Play a song, playlist, or Spotify link." />
              <CommandRow command="/queue" detail="Add music without stopping the current track." />
              <CommandRow command="/clearqueue" detail="Empty a long playlist queue." />
            </div>
          </Card>
        </section>

        <Card className="flex min-h-[360px] flex-col">
          <SectionHeader
            label="Recent activity"
            detail="What Greenroom has done this session."
            className="mb-3"
          />
          <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-line bg-sunken p-3 text-sm">
            {activity.length === 0 ? (
              <div className="grid h-full place-items-center text-center text-muted">
                <div>
                  <div className="text-sm font-medium text-text/80">{running ? 'Ready for your first request' : 'Nothing happening yet'}</div>
                  <div className="mt-1 text-xs">{running ? 'Use /play in Discord to start music.' : 'Start the bot when you want to use it.'}</div>
                </div>
              </div>
            ) : (
              activity.map((item) => {
                return (
                <div key={item.key} className="mb-2 flex gap-3 rounded-lg bg-white/[0.03] px-3 py-2 last:mb-0">
                  <div className="pt-1">
                    <StatusDot tone={item.tone} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">{item.title}</span>
                      <span className="text-xs text-muted">{new Date(item.ts).toLocaleTimeString()}</span>
                    </div>
                    {item.detail && <div className="mt-0.5 truncate text-xs text-muted">{item.detail}</div>}
                  </div>
                </div>
                );
              })
            )}
          </div>
        </Card>
      </div>

      {settingsOpen && (
        <SettingsModal
          prereqs={snapshot.prereqs}
          onClose={() => setSettingsOpen(false)}
          onPrereqs={(prereqs) => setSnapshot((prev) => ({ ...prev, prereqs }))}
        />
      )}

      {vbCableProblem && !vbAlertDismissed && !settingsOpen && (
        <Modal size="sm" onClose={() => setVbAlertDismissed(true)} labelledBy="vb-alert-title">
          <div className="space-y-3 p-5">
            <h2 id="vb-alert-title" className="text-base font-semibold tracking-tight">
              VB-Cable needs attention
            </h2>
            <p className="text-[13px] leading-relaxed text-muted">
              {snapshot.prereqs.vbcable.detail ?? 'greenroom could not verify VB-Audio Virtual Cable.'}
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setVbAlertDismissed(true)}>Dismiss</Button>
              <Button
                onClick={() => {
                  setVbAlertDismissed(true);
                  setSettingsOpen(true);
                }}
              >
                Open settings
              </Button>
            </div>
          </div>
        </Modal>
      )}
      </div>
    </div>
  );
}

function StatusRow({ tone, label, value }: { tone: 'ok' | 'warn' | 'bad' | 'idle'; label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-white/[0.02] px-3 py-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <StatusDot tone={tone} />
        <span className="truncate text-[13px] font-medium">{label}</span>
      </div>
      <span className="shrink-0 text-xs text-muted">{value}</span>
    </div>
  );
}

function CommandRow({ command, detail }: { command: string; detail: string }): JSX.Element {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-white/[0.02] px-3 py-2">
      <Code className="shrink-0">{command}</Code>
      <span className="min-w-0 text-xs text-muted">{detail}</span>
    </div>
  );
}
