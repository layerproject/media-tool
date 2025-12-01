import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { ffmpegPath, ffprobePath } from './ffmpeg-paths';

export type TargetSize = '10mb' | '5mb' | '2mb' | '1mb';
export type Scale = 'original' | '720p' | '480p' | '360p' | '240p';

export interface GifOptions {
  inputPath: string;
  startTime: number;
  endTime: number;
  targetSizes: TargetSize[];
  scales: Scale[];
  fps: number;
  dithering: boolean;
}

export interface GifProgress {
  currentExport: number;
  totalExports: number;
  scale: string;
  targetSize: string;
  progress: number;
  status: 'generating' | 'completed' | 'error';
  error?: string;
}

// Track active processes for cancellation
let activeProcess: ChildProcess | null = null;
let isCancelled = false;

// Size limits in bytes
const sizeLimits: Record<TargetSize, number> = {
  '10mb': 10 * 1024 * 1024,
  '5mb': 5 * 1024 * 1024,
  '2mb': 2 * 1024 * 1024,
  '1mb': 1 * 1024 * 1024,
};

// Scale heights in pixels
const scaleHeights: Record<Scale, number | null> = {
  'original': null,
  '720p': 720,
  '480p': 480,
  '360p': 360,
  '240p': 240,
};

/**
 * Get video duration using ffprobe
 */
export async function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath
    ];

    const proc = spawn(ffprobePath, args);
    let output = '';

    proc.stdout?.on('data', (data) => {
      output += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        const duration = parseFloat(output.trim());
        resolve(isNaN(duration) ? 0 : duration);
      } else {
        reject(new Error(`ffprobe exited with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

/**
 * Generate a single GIF with two-pass encoding
 */
async function generateSingleGif(
  inputPath: string,
  outputPath: string,
  startTime: number,
  duration: number,
  scaleHeight: number | null,
  fps: number,
  dithering: boolean,
  onProgress: (progress: number) => void
): Promise<void> {
  const tempDir = os.tmpdir();
  const palettePath = path.join(tempDir, `palette_${Date.now()}.png`);

  try {
    // Build filter chain
    const filters: string[] = [`fps=${fps}`];
    if (scaleHeight !== null) {
      filters.push(`scale=-1:${scaleHeight}:flags=lanczos`);
    }
    const baseFilters = filters.join(',');

    // Pass 1: Generate palette
    const pass1Args = [
      '-y',
      '-ss', startTime.toString(),
      '-t', duration.toString(),
      '-i', inputPath,
      '-vf', `${baseFilters},palettegen=stats_mode=diff`,
      palettePath
    ];

    await runFfmpeg(pass1Args, duration, (p) => onProgress(p * 0.3)); // 0-30%

    if (isCancelled) return;

    // Pass 2: Generate GIF using palette
    const ditherMode = dithering ? 'floyd_steinberg' : 'none';
    const pass2Args = [
      '-y',
      '-ss', startTime.toString(),
      '-t', duration.toString(),
      '-i', inputPath,
      '-i', palettePath,
      '-lavfi', `${baseFilters}[x];[x][1:v]paletteuse=dither=${ditherMode}`,
      outputPath
    ];

    await runFfmpeg(pass2Args, duration, (p) => onProgress(30 + p * 0.7)); // 30-100%

  } finally {
    // Cleanup palette
    try {
      if (fs.existsSync(palettePath)) {
        fs.unlinkSync(palettePath);
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Run ffmpeg with progress tracking
 */
function runFfmpeg(
  args: string[],
  duration: number,
  onProgress: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Add progress output
    const fullArgs = [...args.slice(0, -1), '-progress', 'pipe:1', args[args.length - 1]];

    const proc = spawn(ffmpegPath, fullArgs);
    activeProcess = proc;

    proc.stdout?.on('data', (data) => {
      const output = data.toString();
      const timeMatch = output.match(/out_time_ms=(\d+)/);
      if (timeMatch) {
        const currentTimeMs = parseInt(timeMatch[1], 10);
        const currentTimeSec = currentTimeMs / 1000000;
        const progress = Math.min((currentTimeSec / duration) * 100, 100);
        onProgress(progress);
      }
    });

    proc.stderr?.on('data', (data) => {
      // ffmpeg outputs to stderr, but we don't need to log it all
      const str = data.toString();
      if (str.includes('Error') || str.includes('error')) {
        console.error('FFmpeg error:', str);
      }
    });

    proc.on('close', (code) => {
      activeProcess = null;
      if (isCancelled) {
        reject(new Error('Cancelled'));
      } else if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      activeProcess = null;
      reject(err);
    });
  });
}

/**
 * Generate output filename
 */
function getOutputFilename(
  inputPath: string,
  scale: Scale,
  targetSize: TargetSize
): string {
  const dir = path.dirname(inputPath);
  const basename = path.basename(inputPath, path.extname(inputPath));
  const sizeLabel = targetSize.replace('mb', 'MB');
  return path.join(dir, `${basename}_${scale}_${sizeLabel}.gif`);
}

/**
 * Main GIF generation function
 */
export async function generateGifs(
  options: GifOptions,
  onProgress: (progress: GifProgress) => void
): Promise<void> {
  isCancelled = false;

  const { inputPath, startTime, endTime, targetSizes, scales, fps, dithering } = options;
  const duration = endTime - startTime;

  // Build list of exports
  const exports: { scale: Scale; targetSize: TargetSize; scaleHeight: number | null }[] = [];

  for (const scale of scales) {
    for (const targetSize of targetSizes) {
      const scaleHeight = scale === 'original' ? null : scaleHeights[scale];
      exports.push({ scale, targetSize, scaleHeight });
    }
  }

  const totalExports = exports.length;

  for (let i = 0; i < exports.length; i++) {
    if (isCancelled) break;

    const { scale, targetSize, scaleHeight } = exports[i];
    const outputPath = getOutputFilename(inputPath, scale, targetSize);

    onProgress({
      currentExport: i + 1,
      totalExports,
      scale,
      targetSize: `< ${targetSize.toUpperCase()}`,
      progress: 0,
      status: 'generating',
    });

    try {
      await generateSingleGif(
        inputPath,
        outputPath,
        startTime,
        duration,
        scaleHeight,
        fps,
        dithering,
        (progress) => {
          onProgress({
            currentExport: i + 1,
            totalExports,
            scale,
            targetSize: `< ${targetSize.toUpperCase()}`,
            progress,
            status: 'generating',
          });
        }
      );

      // Check file size and warn if over limit
      const stats = fs.statSync(outputPath);
      const sizeLimit = sizeLimits[targetSize];
      if (stats.size > sizeLimit) {
        console.warn(`GIF ${outputPath} is ${(stats.size / 1024 / 1024).toFixed(2)}MB, exceeds target of ${targetSize}`);
        // Note: In a future version, we could retry with lower quality/fps
      }

      onProgress({
        currentExport: i + 1,
        totalExports,
        scale,
        targetSize: `< ${targetSize.toUpperCase()}`,
        progress: 100,
        status: i === exports.length - 1 ? 'completed' : 'generating',
      });

    } catch (error) {
      if (isCancelled) break;

      onProgress({
        currentExport: i + 1,
        totalExports,
        scale,
        targetSize: `< ${targetSize.toUpperCase()}`,
        progress: 0,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      });

      // Continue with next export on error
    }
  }

  if (!isCancelled) {
    onProgress({
      currentExport: totalExports,
      totalExports,
      scale: '',
      targetSize: '',
      progress: 100,
      status: 'completed',
    });
  }
}

/**
 * Cancel ongoing GIF generation
 */
export function cancelGifGeneration(): void {
  isCancelled = true;
  if (activeProcess) {
    try {
      activeProcess.kill('SIGKILL');
    } catch {
      // Process may have already exited
    }
    activeProcess = null;
  }
}
