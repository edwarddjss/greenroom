import { spawn } from 'child_process';
import { PassThrough } from 'stream';
import { createAudioResource, StreamType } from '@discordjs/voice';
import { config } from './config.js';

class AudioCaptureEngine {
  constructor() {
    this.ffmpegProcess = null;
    this.audioResource = null;
  }

  // Starts spawning FFmpeg on a specific device with live audio effects and returns { resource, readyPromise }
  start(deviceName = null, effects = { bassboost: false, speed: 1.0 }) {
    const oldProcess = this.ffmpegProcess;
    if (oldProcess) {
      console.log('[AudioEngine] Stopping old process before starting new capture to release device lock.');
      oldProcess.removeAllListeners();
      try {
        oldProcess.stdout.destroy();
        oldProcess.stderr.destroy();
      } catch (e) {}
      oldProcess.kill('SIGKILL');
      this.ffmpegProcess = null;
    }

    const platform = config.audioPlatform;
    // Fallback to default config device if no custom device is passed
    const device = deviceName || config.audioDevice;
    let ffmpegArgs = [];

    // Dynamically compile active audio filters
    // Using ultra-fast zero-latency standard swr resampler and zero-latency volume scale to eliminate look-ahead and resampler latency
    let filterChain = 'aresample=48000:async=1,volume=0.95';
    
    if (effects.bassboost) {
      filterChain += ',bass=g=8'; // Boost low frequencies by 8dB
    }
    
    if (effects.speed && effects.speed !== 1.0) {
      filterChain += `,rubberband=pitch=${effects.speed}`; // Shift pitch up/down while preserving 1x speed to prevent buffer starvation
    }

    console.log(`[AudioEngine] Spawning FFmpeg capture on platform: ${platform}, device: "${device}", active effects:`, effects);

    if (platform === 'windows') {
      // DirectShow capture for Windows with Ultra-Low Latency optimizations (Raw s16le PCM)
      ffmpegArgs = [
        '-fflags', 'nobuffer',
        '-flags', 'low_delay',
        '-rtbufsize', '150M',
        '-thread_queue_size', '2048',  // Prevent input thread lag and buffer underruns
        '-audio_buffer_size', '10',    // Lower capture buffer to 10ms
        '-f', 'dshow',
        '-i', `audio=${device}`,
        '-af', filterChain,            // Apply dynamic filter chain
        '-acodec', 'pcm_s16le',        // Output raw signed 16-bit Little-Endian PCM
        '-ar', '48000',                // 48,000Hz sample rate (Discord standard)
        '-ac', '2',                    // 2 channels stereo
        '-f', 's16le',                 // Force output format to raw PCM
        'pipe:1'
      ];
    } else if (platform === 'linux') {
      // PulseAudio capture for Linux with Ultra-Low Latency optimizations (Raw s16le PCM)
      ffmpegArgs = [
        '-fflags', 'nobuffer',
        '-flags', 'low_delay',
        '-thread_queue_size', '1024',
        '-f', 'pulse',
        '-i', device,
        '-af', filterChain,
        '-acodec', 'pcm_s16le',
        '-ar', '48000',
        '-ac', '2',
        '-f', 's16le',
        'pipe:1'
      ];
    } else {
      throw new Error(`Unsupported audio platform: ${platform}. Must be 'windows' or 'linux'.`);
    }

    try {
      const newProcess = spawn('ffmpeg', ffmpegArgs, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      newProcess.on('error', (err) => {
        console.error('[AudioEngine] FFmpeg process encountered an error:', err.message);
        if (err.code === 'ENOENT') {
          console.error('\n\x1b[31m[Error] FFmpeg was not found in your system PATH!\x1b[0m');
        }
      });

      newProcess.stderr.on('data', (data) => {
        console.warn(`[AudioEngine FFmpeg-Stderr] ${data.toString().trim()}`);
      });

      newProcess.on('close', (code) => {
        console.log(`[AudioEngine] FFmpeg process exited with code ${code}`);
        if (this.ffmpegProcess === newProcess) {
          this.ffmpegProcess = null;
          this.audioResource = null;
        }
      });

      // Pipe FFmpeg output into a PassThrough stream to enable non-destructive buffer probing
      const passThrough = new PassThrough();
      newProcess.stdout.pipe(passThrough);

      const readyPromise = new Promise((resolve) => {
        let resolved = false;
        
        const doResolve = () => {
          if (!resolved) {
            resolved = true;
            resolve();
          }
        };

        // Once the first chunk of audio data is received, the stream is ready for playback
        passThrough.once('data', () => {
          console.log('[AudioEngine] New stream has started outputting active audio data.');
          doResolve();
        });

        // Fallback safety timeout (5 seconds) to prevent command freeze
        setTimeout(() => {
          if (!resolved) {
            console.warn('[AudioEngine] Safety timeout reached before stream outputted data.');
            doResolve();
          }
        }, 5000);
      });

      this.ffmpegProcess = newProcess;
      this.audioResource = createAudioResource(passThrough, {
        inputType: StreamType.Raw
      });

      console.log('[AudioEngine] Audio capture stream initialized successfully.');
      return { resource: this.audioResource, readyPromise };

    } catch (error) {
      console.error('[AudioEngine] Failed to spawn FFmpeg capture process:', error.message);
      this.stop();
      throw error;
    }
  }

  // Stops FFmpeg capture and cleans up resources
  stop() {
    if (this.ffmpegProcess) {
      console.log('[AudioEngine] Terminating FFmpeg capture process...');
      this.ffmpegProcess.removeAllListeners();
      try {
        this.ffmpegProcess.stdout.destroy();
        this.ffmpegProcess.stderr.destroy();
      } catch (e) {}
      this.ffmpegProcess.kill('SIGKILL');
      this.ffmpegProcess = null;
      console.log('[AudioEngine] FFmpeg process killed.');
    }
    this.audioResource = null;
  }

  isActive() {
    return this.ffmpegProcess !== null;
  }
}

export const audioEngine = new AudioCaptureEngine();
