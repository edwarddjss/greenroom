import { useEffect, useRef, useState } from 'react';
import type { EngineSnapshot, EngineState, LogLine } from '@greenroom/shared';
import { EMPTY_PREREQS } from '@greenroom/shared';
import { AlertTriangle, CheckCircle2, Copy, MessageCircle, Power, Settings, Square, Trash2, UserPlus } from 'lucide-react';
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

function formatSupportLogs(logs: LogLine[]): string {
  return logs
    .map((line) => {
      const time = new Date(line.ts).toLocaleTimeString();
      const item = friendlyLog(line);
      return item.detail ? `[${time}] ${item.title}: ${item.detail}` : `[${time}] ${item.title}`;
    })
    .join('\n');
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
  if (/auth server listening/i.test(text)) return { title: 'Login page is ready', detail: 'Spotify account linking can receive callbacks.', tone: 'ok' };
  if (/login links use/i.test(text)) return { title: 'Spotify login link is public', detail: text.replace(/^\[Spotify\]\s*/i, ''), tone: 'ok' };
  if (/redirect URI is/i.test(text)) return { title: 'Spotify redirect is configured', detail: text.replace(/^\[Spotify\]\s*/i, ''), tone: 'ok' };
  if (/logged in as/i.test(text)) return { title: 'Discord bot is online', detail: text.replace(/^\[Discord\]\s*/i, ''), tone: 'ok' };
  if (/discord login failed/i.test(text)) return { title: 'Discord login failed', detail: text.replace(/^\[Bootstrap\]\s*/i, ''), tone: 'bad' };
  if (/port .* already in use|port .* unavailable/i.test(text)) return { title: 'Spotify login port is busy', detail: 'Another app is using the login callback port.', tone: 'bad' };
  if (/spotify linked|authorization successful/i.test(text)) return { title: 'Spotify account linked', detail: 'A user completed Spotify login.', tone: 'ok' };
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
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [vbAlertDismissed, setVbAlertDismissed] = useState(false);
  const [followLogs, setFollowLogs] = useState(true);
  const logScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void api.engineGetSnapshot().then(setSnapshot);
    void api.prereqsScan();
    void api.discordInviteUrl().then(setInviteUrl);
    const offState = api.onEngineState(setSnapshot);
    const offLog = api.onEngineLog((lines) => setLogs((prev) => [...prev, ...lines].slice(-500)));
    const offPrereqs = api.onPrereqs((prereqs) => setSnapshot((prev) => ({ ...prev, prereqs })));
    return () => {
      offState();
      offLog();
      offPrereqs();
    };
  }, []);

  useEffect(() => {
    if (followLogs && logScrollRef.current) {
      logScrollRef.current.scrollTo({ top: logScrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [logs, followLogs]);

  const handleLogScroll = (): void => {
    const el = logScrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setFollowLogs(distanceFromBottom < 48);
  };

  const running = snapshot.state === 'running' || snapshot.state === 'degraded' || snapshot.state === 'starting';
  const stateInfo = STATE_LABEL[snapshot.state];
  const vbCableProblem = snapshot.prereqs.vbcable.status !== 'ok' && snapshot.prereqs.vbcable.status !== 'unknown';
  const visibleLogs = logs.filter(isUserFacingLog);
  const needsSetup = !snapshot.spotifyLinked;
  const homeTone = snapshot.lastError ? 'bad' : needsSetup ? 'warn' : snapshot.captureActive ? 'ok' : stateInfo.tone;
  const homeTitle = snapshot.lastError
    ? 'Something needs attention'
    : !running
      ? 'Bot is stopped'
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
  const copyLogs = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(formatSupportLogs(visibleLogs));
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
    setTimeout(() => setCopyState('idle'), 1800);
  };

  const jumpToLatest = (): void => {
    setFollowLogs(true);
    logScrollRef.current?.scrollTo({ top: logScrollRef.current.scrollHeight, behavior: 'smooth' });
  };

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
            <Button variant="danger" onClick={() => void api.engineStop().then(setSnapshot)}>
              <Square size={15} strokeWidth={2.2} aria-hidden="true" />
              Stop
            </Button>
          ) : (
            <Button onClick={() => void api.engineStart().then(setSnapshot)}>
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
                      : 'border-warn/25 bg-warn/10'
                }`}
              >
                {snapshot.lastError ? (
                  <AlertTriangle size={20} strokeWidth={2.1} className="text-danger" aria-hidden="true" />
                ) : (
                  <CheckCircle2 size={20} strokeWidth={2.1} className={homeTone === 'ok' ? 'text-accent' : 'text-warn'} aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0">
                <h1 className="text-base font-semibold tracking-tight">{homeTitle}</h1>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">{nextStep}</p>
              </div>
            </div>

            <div className="space-y-2">
              <StatusRow tone={stateInfo.tone} label="Bot" value={running ? 'Online' : stateInfo.label} />
              <StatusRow tone={snapshot.spotifyLinked ? 'ok' : 'warn'} label="Spotify account" value={snapshot.spotifyLinked ? 'Linked' : 'Needs /login'} />
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
            detail="Filtered events for troubleshooting."
            className="mb-3"
            action={
              <div className="flex flex-wrap justify-end gap-2">
                {!followLogs && (
                  <Button variant="ghost" size="sm" onClick={jumpToLatest}>
                    Latest
                  </Button>
                )}
                <Button variant="ghost" size="sm" disabled={visibleLogs.length === 0} onClick={() => void copyLogs()}>
                  <Copy size={14} strokeWidth={2.1} aria-hidden="true" />
                  {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy support log'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setLogs([]);
                    setFollowLogs(true);
                  }}
                >
                  <Trash2 size={14} strokeWidth={2.1} aria-hidden="true" />
                  Clear
                </Button>
              </div>
            }
          />
          <div ref={logScrollRef} onScroll={handleLogScroll} className="min-h-0 flex-1 overflow-auto rounded-lg border border-line bg-sunken p-3 text-sm">
            {visibleLogs.length === 0 ? (
              <div className="grid h-full place-items-center text-center text-muted">
                <div>
                  <div className="text-sm font-medium text-text/80">No activity yet</div>
                  <div className="mt-1 text-xs">Start the bot, then use Discord commands.</div>
                </div>
              </div>
            ) : (
              visibleLogs.map((line, i) => {
                const item = friendlyLog(line);
                return (
                <div key={i} className="mb-2 flex gap-3 rounded-lg bg-white/[0.03] px-3 py-2 last:mb-0">
                  <div className="pt-1">
                    <StatusDot tone={item.tone} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">{item.title}</span>
                      <span className="text-xs text-muted">{new Date(line.ts).toLocaleTimeString()}</span>
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
