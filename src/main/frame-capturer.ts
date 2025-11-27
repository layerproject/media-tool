import { BrowserWindow } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Get ffmpeg/ffprobe paths from the installer packages
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffprobePath = require('@ffprobe-installer/ffprobe').path;

export type ImageFormat = 'jpeg' | 'png';
export type Resolution = '2k' | '4k' | '8k';

export interface GenerativeFrameCaptureOptions {
  url: string;
  fps: number;
  totalFrames: number;
  resolution: Resolution;
  imageFormat: ImageFormat;
  outputDir: string;
  folderName: string;
}

export interface VideoFrameCaptureOptions {
  videoPath: string;
  fps: number;
  imageFormat: ImageFormat;
  outputDir: string;
  folderName: string;
}

export interface FrameCaptureProgress {
  currentFrame: number;
  totalFrames: number;
  status: 'capturing' | 'completed' | 'error' | 'cancelled';
  error?: string;
  outputFolder?: string;
}

// Resolution dimensions (square aspect ratio)
const RESOLUTIONS = {
  '2k': { width: 1080, height: 1080 },
  '4k': { width: 2160, height: 2160 },
  '8k': { width: 4320, height: 4320 },
};

interface CaptureState {
  isCapturing: boolean;
  shouldStop: boolean;
  offscreenWindow: BrowserWindow | null;
  ffmpegProcess: ChildProcess | null;
  currentFrame: number;
  totalFrames: number;
  outputFolder: string | null;
  onProgress: ((progress: FrameCaptureProgress) => void) | null;
}

const state: CaptureState = {
  isCapturing: false,
  shouldStop: false,
  offscreenWindow: null,
  ffmpegProcess: null,
  currentFrame: 0,
  totalFrames: 0,
  outputFolder: null,
  onProgress: null,
};

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Write frame file with promise
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
 * Get video info using ffprobe
 */
export async function getVideoInfo(videoPath: string): Promise<{ fps: number; duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,r_frame_rate,duration',
      '-show_entries', 'format=duration',
      '-of', 'json',
      videoPath,
    ];

    const proc = spawn(ffprobePath, args);
    let output = '';
    let errorOutput = '';

    proc.stdout?.on('data', (data) => {
      output += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      errorOutput += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe failed: ${errorOutput}`));
        return;
      }

      try {
        const json = JSON.parse(output);
        const stream = json.streams?.[0];
        const format = json.format;

        // Parse frame rate (e.g., "30/1" or "30000/1001")
        let fps = 30;
        if (stream?.r_frame_rate) {
          const [num, den] = stream.r_frame_rate.split('/').map(Number);
          fps = den ? num / den : num;
        }

        // Get duration from stream or format
        const duration = parseFloat(stream?.duration || format?.duration || '0');

        resolve({
          fps: Math.round(fps * 100) / 100,
          duration,
          width: stream?.width || 1920,
          height: stream?.height || 1080,
        });
      } catch (error) {
        reject(new Error(`Failed to parse video info: ${error}`));
      }
    });
  });
}

/**
 * Capture frames from a generative artwork (iframe)
 */
export async function captureGenerativeFrames(
  options: GenerativeFrameCaptureOptions,
  onProgress: (progress: FrameCaptureProgress) => void
): Promise<void> {
  if (state.isCapturing) {
    onProgress({ currentFrame: 0, totalFrames: 0, status: 'error', error: 'Capture already in progress' });
    return;
  }

  const { url, fps, totalFrames, resolution, imageFormat, outputDir, folderName } = options;
  const { width, height } = RESOLUTIONS[resolution];

  console.log(`📷 Starting generative frame capture: ${resolution} (${width}x${height}), ${totalFrames} frames @ ${fps}fps`);

  // Create output folder
  const outputFolder = path.join(outputDir, folderName);
  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder, { recursive: true });
  }

  state.isCapturing = true;
  state.shouldStop = false;
  state.currentFrame = 0;
  state.totalFrames = totalFrames;
  state.outputFolder = outputFolder;
  state.onProgress = onProgress;

  // Create offscreen window
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

  try {
    // Load the artwork URL
    await state.offscreenWindow.loadURL(url);
    console.log('✅ Artwork loaded, starting frame capture...');
  } catch (error) {
    console.error('Failed to load artwork:', error);
    cleanup();
    onProgress({ currentFrame: 0, totalFrames, status: 'error', error: `Failed to load artwork: ${error}` });
    return;
  }

  // Give the page a moment to render
  await sleep(500);

  // Inject frame-rate control script
  const frameInterval = 1000 / fps;
  await state.offscreenWindow.webContents.executeJavaScript(`
    (function() {
      window.__originalRAF = window.requestAnimationFrame;
      window.__rafCallbacks = [];
      window.__rafPaused = true;
      window.__simulatedTime = performance.now();
      window.__frameInterval = ${frameInterval};

      window.requestAnimationFrame = function(callback) {
        if (window.__rafPaused) {
          window.__rafCallbacks.push(callback);
          return window.__rafCallbacks.length;
        }
        return window.__originalRAF(callback);
      };

      window.__advanceFrame = function() {
        const callbacks = window.__rafCallbacks.slice();
        window.__rafCallbacks = [];
        window.__simulatedTime += window.__frameInterval;
        const timestamp = window.__simulatedTime;
        callbacks.forEach(cb => {
          try { cb(timestamp); } catch(e) {}
        });
      };

      console.log('🎬 Frame control injected');
    })();
  `);

  // Capture frames sequentially
  const extension = imageFormat === 'jpeg' ? 'jpg' : 'png';

  for (let frameNum = 0; frameNum < totalFrames; frameNum++) {
    if (state.shouldStop || !state.offscreenWindow || state.offscreenWindow.isDestroyed()) {
      console.log(`⏹️ Capture stopped at frame ${frameNum}`);
      cleanup();
      onProgress({ currentFrame: frameNum, totalFrames, status: 'cancelled', outputFolder });
      return;
    }

    try {
      // Advance the animation
      await state.offscreenWindow.webContents.executeJavaScript('window.__advanceFrame()');
      await sleep(5);

      // Capture the frame
      const image = await state.offscreenWindow.webContents.capturePage();

      let buffer: Buffer;
      if (imageFormat === 'jpeg') {
        buffer = image.toJPEG(95);
      } else {
        buffer = image.toPNG();
      }

      const framePath = path.join(outputFolder, `frame_${String(frameNum).padStart(6, '0')}.${extension}`);
      await writeFrameFile(framePath, buffer);

      state.currentFrame = frameNum + 1;
      onProgress({ currentFrame: state.currentFrame, totalFrames, status: 'capturing', outputFolder });

      // Log every 30 frames
      if ((frameNum + 1) % 30 === 0) {
        console.log(`📸 Captured ${frameNum + 1}/${totalFrames} frames`);
      }
    } catch (error) {
      console.error(`Error capturing frame ${frameNum}:`, error);
    }
  }

  console.log(`✅ Completed capturing ${state.currentFrame} frames`);
  cleanup();
  onProgress({ currentFrame: totalFrames, totalFrames, status: 'completed', outputFolder });
}

/**
 * Extract frames from a video file using ffmpeg
 */
export async function extractVideoFrames(
  options: VideoFrameCaptureOptions,
  onProgress: (progress: FrameCaptureProgress) => void
): Promise<void> {
  if (state.isCapturing) {
    onProgress({ currentFrame: 0, totalFrames: 0, status: 'error', error: 'Capture already in progress' });
    return;
  }

  const { videoPath, fps, imageFormat, outputDir, folderName } = options;

  console.log(`📷 Starting video frame extraction: ${videoPath} @ ${fps}fps`);

  // Get video info to calculate total frames
  let videoInfo;
  try {
    videoInfo = await getVideoInfo(videoPath);
    console.log(`📊 Video info: ${videoInfo.width}x${videoInfo.height}, ${videoInfo.duration}s, ${videoInfo.fps}fps`);
  } catch (error) {
    onProgress({ currentFrame: 0, totalFrames: 0, status: 'error', error: `Failed to get video info: ${error}` });
    return;
  }

  const totalFrames = Math.ceil(videoInfo.duration * fps);
  console.log(`📊 Total frames to extract: ${totalFrames}`);

  // Create output folder
  const outputFolder = path.join(outputDir, folderName);
  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder, { recursive: true });
  }

  state.isCapturing = true;
  state.shouldStop = false;
  state.currentFrame = 0;
  state.totalFrames = totalFrames;
  state.outputFolder = outputFolder;
  state.onProgress = onProgress;

  const extension = imageFormat === 'jpeg' ? 'jpg' : 'png';
  const outputPattern = path.join(outputFolder, `frame_%06d.${extension}`);

  // Build ffmpeg args
  const args = [
    '-y',
    '-i', videoPath,
    '-vf', `fps=${fps}`,
  ];

  if (imageFormat === 'jpeg') {
    args.push('-q:v', '2'); // High quality JPEG
  }

  args.push('-progress', 'pipe:1');
  args.push(outputPattern);

  console.log('Running ffmpeg:', ffmpegPath, args.join(' '));

  state.ffmpegProcess = spawn(ffmpegPath, args);

  state.ffmpegProcess.stdout?.on('data', (data) => {
    const output = data.toString();
    const frameMatch = output.match(/frame=(\d+)/);
    if (frameMatch && state.onProgress) {
      state.currentFrame = parseInt(frameMatch[1], 10);
      onProgress({
        currentFrame: state.currentFrame,
        totalFrames,
        status: 'capturing',
        outputFolder,
      });
    }
  });

  state.ffmpegProcess.stderr?.on('data', (data) => {
    const output = data.toString();
    if (output.includes('Error') || output.includes('error')) {
      console.error('ffmpeg stderr:', output);
    }
  });

  return new Promise((resolve) => {
    state.ffmpegProcess?.on('close', (code) => {
      console.log(`ffmpeg exited with code ${code}`);
      const wasStoppped = state.shouldStop;
      const folder = state.outputFolder;
      const frames = state.currentFrame;

      cleanup();

      if (wasStoppped) {
        onProgress({ currentFrame: frames, totalFrames, status: 'cancelled', outputFolder: folder || undefined });
      } else if (code === 0) {
        onProgress({ currentFrame: totalFrames, totalFrames, status: 'completed', outputFolder: folder || undefined });
      } else {
        onProgress({ currentFrame: frames, totalFrames, status: 'error', error: `ffmpeg failed with code ${code}` });
      }
      resolve();
    });

    state.ffmpegProcess?.on('error', (error) => {
      console.error('ffmpeg error:', error);
      cleanup();
      onProgress({ currentFrame: 0, totalFrames, status: 'error', error: `ffmpeg error: ${error.message}` });
      resolve();
    });
  });
}

/**
 * Stop frame capture
 */
export function stopFrameCapture(): void {
  console.log('🛑 Stopping frame capture...');
  state.shouldStop = true;

  if (state.offscreenWindow && !state.offscreenWindow.isDestroyed()) {
    state.offscreenWindow.close();
    state.offscreenWindow = null;
  }

  if (state.ffmpegProcess) {
    try {
      state.ffmpegProcess.kill('SIGTERM');
    } catch (error) {
      // Process may already be dead
    }
    state.ffmpegProcess = null;
  }
}

/**
 * Check if capture is in progress
 */
export function isCapturing(): boolean {
  return state.isCapturing;
}

/**
 * Clean up resources
 */
function cleanup(): void {
  state.isCapturing = false;
  state.shouldStop = true;

  if (state.offscreenWindow && !state.offscreenWindow.isDestroyed()) {
    state.offscreenWindow.close();
  }
  state.offscreenWindow = null;

  if (state.ffmpegProcess) {
    try {
      state.ffmpegProcess.kill('SIGTERM');
    } catch (error) {
      // Process may already be dead
    }
  }
  state.ffmpegProcess = null;

  state.currentFrame = 0;
  state.totalFrames = 0;
  state.outputFolder = null;
  state.onProgress = null;
}
