import { BrowserWindow, dialog } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Get ffmpeg path from the installer package
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

export interface RecordingOptions {
  url: string;
  duration: number; // seconds
  format: 'prores' | 'mp4';
  resolution: '2k' | '4k';
  artistName: string;
  artworkTitle: string;
  variationNumbering: number;
}

/**
 * Sanitize a string for use in filenames
 * - Lowercase
 * - Replace spaces and hyphens with underscores
 * - Remove special characters except underscores
 * - Collapse multiple underscores into one
 */
function sanitizeForFilename(str: string): string {
  return str
    .toLowerCase()
    .replace(/[\s-]+/g, '_')      // Replace spaces and hyphens with underscore
    .replace(/[^a-z0-9_]/g, '')   // Remove special characters except underscores
    .replace(/_+/g, '_')          // Collapse multiple underscores
    .replace(/^_|_$/g, '');       // Remove leading/trailing underscores
}

interface RecordingState {
  isRecording: boolean;
  shouldStop: boolean; // Signal to stop the capture loop
  offscreenWindow: BrowserWindow | null;
  ffmpegProcess: ChildProcess | null;
  frameCount: number;
  totalFrames: number;
  outputPath: string | null;
  tempDir: string | null;
  onProgress: ((progress: number) => void) | null;
  onComplete: ((outputPath: string | null, error?: string) => void) | null;
}

const state: RecordingState = {
  isRecording: false,
  shouldStop: false,
  offscreenWindow: null,
  ffmpegProcess: null,
  frameCount: 0,
  totalFrames: 0,
  outputPath: null,
  tempDir: null,
  onProgress: null,
  onComplete: null,
};

// Resolution dimensions (square aspect ratio)
const RESOLUTIONS = {
  '2k': { width: 1080, height: 1080 },
  '4k': { width: 2160, height: 2160 },
};

// Target frame rate
const FRAME_RATE = 30;

// Resolution-specific frame intervals (ms) to compensate for timing differences
// 2K is the baseline (33.33ms = 1000/30)
const FRAME_INTERVALS = {
  '2k': 1000 / 30,  // 33.33ms - baseline
  '4k': 100,        // slightly adjusted for 4K
};

/**
 * Helper to write file with promise and explicit buffer release
 */
function writeFrameFile(framePath: string, buffer: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.writeFile(framePath, buffer, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Start recording a generative artwork
 * Uses SEQUENTIAL frame-by-frame capture to prevent memory buildup
 * Each frame is fully captured and written to disk before the next starts
 */
export async function startRecording(
  options: RecordingOptions,
  onProgress: (progress: number) => void,
  onComplete: (outputPath: string | null, error?: string) => void
): Promise<void> {
  if (state.isRecording) {
    onComplete(null, 'Recording already in progress');
    return;
  }

  const { url, duration, format, resolution } = options;
  const { width, height } = RESOLUTIONS[resolution];
  const totalFrames = duration * FRAME_RATE;

  console.log(`🎬 Starting recording: ${resolution} (${width}x${height}), ${duration}s @ ${FRAME_RATE}fps, ${format}`);
  console.log(`📊 Total frames to capture: ${totalFrames}`);

  // Prompt user for save location FIRST (before starting capture)
  const extension = format === 'prores' ? 'mov' : 'mp4';
  // Format: [artist_name]_[artwork_title]_v[number]_[seconds]s_[resolution]
  const artistPart = sanitizeForFilename(options.artistName);
  const titlePart = sanitizeForFilename(options.artworkTitle);
  const defaultName = `${artistPart}_${titlePart}_v${options.variationNumbering}_${duration}s_${resolution}.${extension}`;

  const result = await dialog.showSaveDialog({
    title: 'Save Recording',
    defaultPath: defaultName,
    filters: [
      format === 'prores'
        ? { name: 'QuickTime Movie', extensions: ['mov'] }
        : { name: 'MP4 Video', extensions: ['mp4'] },
    ],
  });

  if (result.canceled || !result.filePath) {
    console.log('Save cancelled');
    onComplete(null);
    return;
  }

  // Create temp directory for frames
  state.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'layer-record-'));
  state.outputPath = result.filePath;
  state.frameCount = 0;
  state.totalFrames = totalFrames;
  state.isRecording = true;
  state.shouldStop = false;
  state.onProgress = onProgress;
  state.onComplete = onComplete;

  console.log(`📁 Temp directory: ${state.tempDir}`);

  // Create offscreen window at full resolution
  state.offscreenWindow = new BrowserWindow({
    width,
    height,
    show: false,
    webPreferences: {
      offscreen: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load the artwork URL first
  try {
    await state.offscreenWindow.loadURL(url);
    console.log('✅ Artwork loaded, starting frame capture...');
  } catch (error) {
    console.error('Failed to load artwork:', error);
    cleanup();
    onComplete(null, `Failed to load artwork: ${error}`);
    return;
  }

  // Give the page a moment to render
  await sleep(500);

  // Inject frame-rate control script to pause animation between captures
  // This ensures consistent timing regardless of capture speed
  const frameInterval = FRAME_INTERVALS[resolution];
  await state.offscreenWindow.webContents.executeJavaScript(`
    (function() {
      // Store original requestAnimationFrame
      window.__originalRAF = window.requestAnimationFrame;
      window.__rafCallbacks = [];
      window.__rafPaused = true;
      // Simulated time tracking - starts at current time, advances by resolution-specific interval
      window.__simulatedTime = performance.now();
      window.__frameInterval = ${frameInterval}; // Resolution-specific: ${resolution}

      // Override requestAnimationFrame to queue callbacks when paused
      window.requestAnimationFrame = function(callback) {
        if (window.__rafPaused) {
          window.__rafCallbacks.push(callback);
          return window.__rafCallbacks.length;
        }
        return window.__originalRAF(callback);
      };

      // Function to advance one frame with precise time simulation
      window.__advanceFrame = function() {
        const callbacks = window.__rafCallbacks.slice();
        window.__rafCallbacks = [];
        // Advance simulated time by exactly one frame interval
        window.__simulatedTime += window.__frameInterval;
        const timestamp = window.__simulatedTime;
        callbacks.forEach(cb => {
          try { cb(timestamp); } catch(e) {}
        });
      };

      console.log('🎬 Frame control injected with interval: ${frameInterval.toFixed(2)}ms');
    })();
  `);

  // Start the sequential capture loop (non-blocking)
  captureFramesSequentially(options).catch(err => {
    console.error('Capture loop error:', err);
    if (state.onComplete) {
      state.onComplete(null, `Capture error: ${err.message}`);
    }
    cleanup();
  });
}

/**
 * Sequential frame capture loop with animation control
 * Captures one frame at a time, advances animation by exactly one frame,
 * then captures next. This ensures consistent playback speed at any resolution.
 */
async function captureFramesSequentially(options: RecordingOptions): Promise<void> {
  for (let frameNum = 0; frameNum < state.totalFrames; frameNum++) {
    // Check if we should stop
    if (state.shouldStop || !state.offscreenWindow || state.offscreenWindow.isDestroyed()) {
      console.log(`⏹️ Capture stopped at frame ${frameNum}`);
      return;
    }

    try {
      // Advance the animation by one frame (this triggers all queued requestAnimationFrame callbacks)
      await state.offscreenWindow.webContents.executeJavaScript('window.__advanceFrame()');

      // Small delay to let the frame render
      await sleep(5);

      // Capture the current frame
      const image = await state.offscreenWindow.webContents.capturePage();

      // Convert to JPEG instead of PNG for faster writes and smaller files
      // Quality 95 gives excellent quality with much smaller file size
      const buffer = image.toJPEG(95);

      const framePath = path.join(state.tempDir!, `frame_${String(frameNum).padStart(6, '0')}.jpg`);

      // Wait for file write to complete before capturing next frame
      await writeFrameFile(framePath, buffer);

      state.frameCount = frameNum + 1;

      // Report progress
      if (state.onProgress) {
        const progress = ((frameNum + 1) / state.totalFrames) * 100;
        state.onProgress(progress);
      }

      // Log every 30 frames (1 second of video)
      if ((frameNum + 1) % 30 === 0) {
        console.log(`📸 Captured ${frameNum + 1}/${state.totalFrames} frames`);
      }
    } catch (error) {
      console.error(`Error capturing frame ${frameNum}:`, error);
      // Continue to next frame on error
    }
  }

  // All frames captured, now encode
  console.log(`🎬 Captured ${state.frameCount} frames, encoding video...`);
  state.isRecording = false;
  await encodeVideo(options);
}

/**
 * Encode captured frames to video using ffmpeg
 */
async function encodeVideo(options: RecordingOptions): Promise<void> {
  if (!state.tempDir || !state.outputPath) {
    if (state.onComplete) {
      state.onComplete(null, 'No temp directory or output path');
    }
    return;
  }

  const { width, height } = RESOLUTIONS[options.resolution];
  const inputPattern = path.join(state.tempDir, 'frame_%06d.jpg');

  // Base ffmpeg args with progress output enabled
  const baseArgs = [
    '-y',
    '-framerate', String(FRAME_RATE),
    '-i', inputPattern,
    '-progress', 'pipe:1', // Output progress to stdout
  ];

  let ffmpegArgs: string[];

  if (options.format === 'prores') {
    // ProRes 4444 - high quality professional format
    ffmpegArgs = [
      ...baseArgs,
      '-c:v', 'prores_ks',
      '-profile:v', '4', // ProRes 4444
      '-pix_fmt', 'yuva444p10le',
      '-s', `${width}x${height}`,
      state.outputPath,
    ];
  } else {
    // H.264 MP4 - high quality, widely compatible
    ffmpegArgs = [
      ...baseArgs,
      '-c:v', 'libx264',
      '-preset', 'slow', // Better quality
      '-crf', '15', // Lower = higher quality (18 was default)
      '-pix_fmt', 'yuv420p',
      '-s', `${width}x${height}`,
      state.outputPath,
    ];
  }

  console.log('Running ffmpeg:', ffmpegPath, ffmpegArgs.join(' '));

  state.ffmpegProcess = spawn(ffmpegPath, ffmpegArgs);

  // Parse progress from stdout (machine-readable format from -progress pipe:1)
  // Format: key=value lines, with "progress=continue" or "progress=end" markers
  state.ffmpegProcess.stdout?.on('data', (data) => {
    const output = data.toString();
    // Look for frame= line to track encoding progress
    const frameMatch = output.match(/frame=(\d+)/);
    if (frameMatch && state.onProgress) {
      const encodedFrames = parseInt(frameMatch[1], 10);
      // Calculate encoding progress (100-200 range, where 100 = capture done, 200 = encoding done)
      const encodingProgress = 100 + (encodedFrames / state.totalFrames) * 100;
      state.onProgress(Math.min(encodingProgress, 199)); // Cap at 199, 200 means complete
    }
  });

  state.ffmpegProcess.stderr?.on('data', (data) => {
    // Only log errors, not progress (which we get from stdout now)
    const output = data.toString();
    if (!output.includes('frame=') && !output.includes('fps=')) {
      console.log('ffmpeg:', output);
    }
  });

  state.ffmpegProcess.on('close', (code) => {
    console.log(`ffmpeg exited with code ${code}`);
    const outputPath = state.outputPath;
    const complete = state.onComplete;

    cleanup();

    if (complete) {
      if (code === 0 && outputPath) {
        complete(outputPath);
      } else {
        complete(null, `ffmpeg encoding failed with code ${code}`);
      }
    }
  });

  state.ffmpegProcess.on('error', (error) => {
    console.error('ffmpeg error:', error);
    const complete = state.onComplete;
    cleanup();
    if (complete) {
      complete(null, `ffmpeg error: ${error.message}`);
    }
  });
}

/**
 * Stop recording early
 */
export function stopRecording(): void {
  console.log('🛑 Stopping recording...');

  // Signal the capture loop to stop
  state.shouldStop = true;
  state.isRecording = false;

  // Close offscreen window
  if (state.offscreenWindow && !state.offscreenWindow.isDestroyed()) {
    state.offscreenWindow.close();
    state.offscreenWindow = null;
  }

  // Kill ffmpeg if running
  if (state.ffmpegProcess) {
    try {
      state.ffmpegProcess.kill('SIGTERM');
    } catch (error) {
      // Process may already be dead
    }
    state.ffmpegProcess = null;
  }

  // Notify completion
  if (state.onComplete) {
    state.onComplete(null, 'Recording stopped');
  }

  // Clean up temp directory
  cleanupTempDir();

  // Reset state
  state.frameCount = 0;
  state.totalFrames = 0;
  state.outputPath = null;
  state.onProgress = null;
  state.onComplete = null;
}

/**
 * Clean up temp directory
 */
function cleanupTempDir(): void {
  if (state.tempDir && fs.existsSync(state.tempDir)) {
    try {
      fs.rmSync(state.tempDir, { recursive: true });
      console.log(`🗑️ Cleaned up temp directory: ${state.tempDir}`);
    } catch (error) {
      console.error('Failed to clean up temp dir:', error);
    }
  }
  state.tempDir = null;
}

/**
 * Clean up resources
 */
function cleanup(): void {
  state.isRecording = false;
  state.shouldStop = true;

  // Close offscreen window
  if (state.offscreenWindow && !state.offscreenWindow.isDestroyed()) {
    state.offscreenWindow.close();
  }
  state.offscreenWindow = null;

  // Kill ffmpeg if still running
  if (state.ffmpegProcess) {
    try {
      state.ffmpegProcess.kill('SIGTERM');
    } catch (error) {
      // Process may already be dead
    }
    state.ffmpegProcess = null;
  }

  // Clean up temp directory
  cleanupTempDir();

  state.frameCount = 0;
  state.totalFrames = 0;
  state.outputPath = null;
  state.onProgress = null;
  state.onComplete = null;
}

/**
 * Check if recording is in progress
 */
export function isRecording(): boolean {
  return state.isRecording;
}
