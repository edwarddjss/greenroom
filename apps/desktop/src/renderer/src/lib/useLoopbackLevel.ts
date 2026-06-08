import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';

// VB-Cable exposes its output as a recording device ("CABLE Output (VB-Audio ...)").
// Voicemeeter is the other common virtual cable users run.
const DEVICE_HINT = /(cable|vb-audio|voicemeeter|loopback)/i;

/**
 * Reads the live music level off the virtual audio cable the engine streams through,
 * entirely in the renderer — no engine RMS wiring needed. Returns a ref the
 * visualizer samples each frame (no re-renders). Falls back silently to 0 (ambient
 * motion) when there's no cable, no permission, or no secure context.
 */
export function useLoopbackLevel(active: boolean): MutableRefObject<number> {
  const levelRef = useRef(0);

  useEffect(() => {
    levelRef.current = 0;
    if (!active || !navigator.mediaDevices?.getUserMedia) return;

    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let raf = 0;
    let cancelled = false;

    const stop = (): void => {
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
      stream = null;
      ctx = null;
      levelRef.current = 0;
    };

    const start = async (): Promise<void> => {
      try {
        // A permission grant is required before device labels are exposed.
        const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cable = devices.find((d) => d.kind === 'audioinput' && DEVICE_HINT.test(d.label));

        if (!cable) {
          // No virtual cable to read — don't visualize the user's microphone.
          probe.getTracks().forEach((t) => t.stop());
          return;
        }

        probe.getTracks().forEach((t) => t.stop());
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: cable.deviceId },
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
        if (cancelled) return stop();

        ctx = new AudioContext();
        await ctx.resume();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.8;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const bins = new Uint8Array(analyser.frequencyBinCount);

        const tick = (): void => {
          analyser.getByteFrequencyData(bins);
          let sum = 0;
          for (let i = 0; i < bins.length; i++) sum += bins[i]! * bins[i]!;
          const rms = Math.sqrt(sum / bins.length) / 255;
          levelRef.current = Math.min(1, rms * 1.7);
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        // Permission denied / insecure context / device busy — stay on ambient motion.
        stop();
      }
    };

    void start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [active]);

  return levelRef;
}
