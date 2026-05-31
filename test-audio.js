import { spawn } from 'child_process';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env
dotenv.config({ path: path.join(__dirname, '.env') });

const device = process.env.AUDIO_DEVICE || 'CABLE Output (VB-Audio Virtual Cable)';
const platform = (process.env.AUDIO_PLATFORM || 'windows').toLowerCase();

console.log('====================================================');
console.log('🔍 Audio Loopback Diagnostic Utility');
console.log('====================================================\n');

// 1. Verify FFmpeg installation
const checkFFmpeg = () => {
  return new Promise((resolve) => {
    const check = spawn('ffmpeg', ['-version']);
    
    check.on('error', (err) => {
      if (err.code === 'ENOENT') {
        console.error('\x1b[31m❌ Error: FFmpeg was NOT found in your system PATH!\x1b[0m');
        console.error('Please download FFmpeg from: https://ffmpeg.org/download.html');
        console.error('Add the FFmpeg "bin" folder to your Windows System Environment Variables.\n');
        resolve(false);
      } else {
        console.error(`❌ Error checking FFmpeg: ${err.message}\n`);
        resolve(false);
      }
    });

    check.on('close', (code) => {
      if (code === 0) {
        console.log('✅ FFmpeg: Installed and verified in system PATH.');
        resolve(true);
      } else {
        console.error(`⚠️ FFmpeg returned an unexpected exit code: ${code}\n`);
        resolve(false);
      }
    });
  });
};

// 2. List available audio devices (DirectShow)
const listDirectShowDevices = () => {
  return new Promise((resolve) => {
    console.log('\nScanning available audio devices... (Please wait)');
    
    let args = [];
    if (platform === 'windows') {
      args = ['-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'];
    } else {
      args = ['-sources', 'pulse'];
    }

    const scan = spawn('ffmpeg', args);
    let output = '';

    // FFmpeg lists devices on stderr
    scan.stderr.on('data', (data) => {
      output += data.toString();
    });

    scan.on('close', () => {
      if (platform === 'windows') {
        console.log('\n--- DirectShow Device List ---');
        const lines = output.split('\n');
        let foundDevices = [];
        let captureLines = false;

        for (const line of lines) {
          if (line.includes('DirectShow audio devices')) {
            captureLines = true;
            continue;
          }
          if (captureLines && line.includes('DirectShow video devices')) {
            captureLines = false;
          }
          if (captureLines && line.includes(']  "')) {
            const match = line.match(/"([^"]+)"/);
            if (match) {
              console.log(`- ${match[1]}`);
              foundDevices.push(match[1]);
            }
          }
        }
        
        console.log('------------------------------');

        const exactMatch = foundDevices.some(d => d.toLowerCase() === device.toLowerCase());
        if (exactMatch) {
          console.log(`\n✅ Device Match: Virtual device "${device}" is active and available!`);
          resolve(true);
        } else {
          console.warn(`\n\x1b[33m⚠️ Device Warning: Could not find direct match for device "${device}"!\x1b[0m`);
          console.warn('Check the list above and make sure your .env variable AUDIO_DEVICE matches one of the names exactly.');
          resolve(false);
        }
      } else {
        console.log('\nPulseAudio sources scanned.');
        resolve(true);
      }
    });
  });
};

// 3. Perform a 5-second test capture to record file
const recordTestFile = () => {
  return new Promise((resolve) => {
    const outputFile = path.join(__dirname, 'capture-test.wav');
    console.log(`\n🎙️ Starting a 5-second recording test from "${device}"...`);
    console.log('👉 Make sure Spotify (or some other audio source) is currently playing sound!');
    console.log(`Saving output file to: ${outputFile}`);

    let args = [];
    if (platform === 'windows') {
      args = [
        '-y',
        '-f', 'dshow',
        '-i', `audio=${device}`,
        '-t', '5',
        outputFile
      ];
    } else {
      args = [
        '-y',
        '-f', 'pulse',
        '-i', device,
        '-t', '5',
        outputFile
      ];
    }

    const record = spawn('ffmpeg', args);
    let recordError = '';

    record.stderr.on('data', (data) => {
      recordError += data.toString();
    });

    record.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputFile)) {
        const stats = fs.statSync(outputFile);
        if (stats.size > 1000) {
          console.log(`\n\x1b[32m✅ Recording Successful!\x1b[0m`);
          console.log(`Created: capture-test.wav (${(stats.size / 1024).toFixed(1)} KB)`);
          console.log('Please open this file on your machine to verify that your Spotify music plays clearly!');
          resolve(true);
        } else {
          console.error('\n❌ Recording failed: The output file is empty. FFmpeg is capturing silence.');
          console.error('Verify that your virtual loopback/VB-Cable output is set as the active output for Spotify.');
          resolve(false);
        }
      } else {
        console.error(`\n❌ Capture Failed (Exit code: ${code})`);
        console.error('Errors returned from FFmpeg:');
        console.error(recordError.trim().split('\n').slice(-5).join('\n'));
        resolve(false);
      }
    });
  });
};

// Main Runner
(async () => {
  const hasFFmpeg = await checkFFmpeg();
  if (!hasFFmpeg) return;

  const deviceReady = await listDirectShowDevices();
  
  // Proceed with capture test
  await recordTestFile();
  console.log('\nDiagnostic checks completed.');
})();
