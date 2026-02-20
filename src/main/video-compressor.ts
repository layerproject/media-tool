import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { ffmpegPath, ffprobePath } from './ffmpeg-paths';

export type CompressScale = 'original' | '1080p' | '720p' | '480p';
export type CompressPreset = 'slow' | 'medium' | 'fast' | 'veryfast';

export interface CompressOptions {
  inputPath: string;
  scale: CompressScale;
  crf: number; // 0-51, lower = better quality, higher file size. 18-28 is typical.
  preset: CompressPreset;
  audioBitrate: number; // kbps, e.g. 128, 192, 256
  removeAudio: boolean; // Remove audio track entirely
}

export interface CompressProgress {
  progress: number; // 0-100
  currentSize: number; // bytes
  estimatedSize: number; // bytes
  status: 'compressing' | 'completed' | 'error' | 'cancelled';
  outputPath?: string;
  error?: string;
}

export interface VideoMetadata {
  width: number;
  height: number;
  duration: number;
  size: number; // bytes
  bitrate: number; // kbps
  codec: string;
}

// Track active process for cancellation
let activeProcess: ChildProcess | null = null;
let isCancelled = false;

// Scale heights in pixels
const scaleHeights: Record<CompressScale, number | null> = {
  'original': null,
  '1080p': 1080,
  '720p': 720,
  '480p': 480,
};

/**
 * Get video metadata using ffprobe
 */
export async function getVideoMetadata(filePath: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,codec_name,bit_rate:format=duration,size,bit_rate',
      '-of', 'json',
      filePath
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
      if (code === 0) {
        try {
          const data = JSON.parse(output);
          const stream = data.streams?.[0] || {};
          const format = data.format || {};

          resolve({
            width: stream.width || 0,
            height: stream.height || 0,
            duration: parseFloat(format.duration) || 0,
            size: parseInt(format.size) || 0,
            bitrate: Math.round((parseInt(format.bit_rate) || 0) / 1000),
            codec: stream.codec_name || 'unknown',
          });
        } catch (e) {
          reject(new Error(`Failed to parse ffprobe output: ${e}`));
        }
      } else {
        reject(new Error(`ffprobe exited with code ${code}: ${errorOutput}`));
      }
    });

    proc.on('error', reject);
  });
}

/**
 * Generate output filename with _compressed suffix
 */
function getOutputFilename(inputPath: string, scale: CompressScale): string {
  const dir = path.dirname(inputPath);
  const ext = path.extname(inputPath);
  const basename = path.basename(inputPath, ext);
  const scaleSuffix = scale === 'original' ? '' : `_${scale}`;
  return path.join(dir, `${basename}_compressed${scaleSuffix}.mp4`);
}

/**
 * Compress a video file
 */
export async function compressVideo(
  options: CompressOptions,
  onProgress: (progress: CompressProgress) => void
): Promise<void> {
  isCancelled = false;

  const { inputPath, scale, crf, preset, audioBitrate, removeAudio } = options;
  const outputPath = getOutputFilename(inputPath, scale);

  // Get input video metadata for progress calculation
  const metadata = await getVideoMetadata(inputPath);
  const duration = metadata.duration;

  // Build ffmpeg arguments
  const args: string[] = [
    '-y', // Overwrite output
    '-i', inputPath,
    '-c:v', 'libx264',
    '-preset', preset,
    '-crf', crf.toString(),
  ];

  // Handle audio
  if (removeAudio) {
    args.push('-an'); // Remove audio
  } else {
    args.push('-c:a', 'aac', '-b:a', `${audioBitrate}k`);
  }

  args.push('-movflags', '+faststart'); // Enable fast start for web playback

  // Add scale filter if not original
  const scaleHeight = scaleHeights[scale];
  if (scaleHeight !== null) {
    // Scale to height, maintain aspect ratio, ensure even dimensions
    args.push('-vf', `scale=-2:${scaleHeight}`);
  }

  // Add progress output and output file
  args.push('-progress', 'pipe:1', outputPath);

  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args);
    activeProcess = proc;

    let lastProgress = 0;

    proc.stdout?.on('data', (data) => {
      const output = data.toString();

      // Parse progress from ffmpeg output
      const timeMatch = output.match(/out_time_ms=(\d+)/);
      if (timeMatch && duration > 0) {
        const currentTimeMs = parseInt(timeMatch[1], 10);
        const currentTimeSec = currentTimeMs / 1000000;
        const progress = Math.min((currentTimeSec / duration) * 100, 99);

        if (progress > lastProgress) {
          lastProgress = progress;

          // Check current output file size
          let currentSize = 0;
          try {
            if (fs.existsSync(outputPath)) {
              currentSize = fs.statSync(outputPath).size;
            }
          } catch {
            // Ignore file access errors during encoding
          }

          // Estimate final size based on progress
          const estimatedSize = progress > 0 ? Math.round(currentSize / (progress / 100)) : 0;

          onProgress({
            progress: Math.round(progress),
            currentSize,
            estimatedSize,
            status: 'compressing',
          });
        }
      }
    });

    proc.stderr?.on('data', (data) => {
      const str = data.toString();
      if (str.includes('Error') || str.includes('error')) {
        console.error('FFmpeg error:', str);
      }
    });

    proc.on('close', (code) => {
      activeProcess = null;

      if (isCancelled) {
        // Clean up partial output file
        try {
          if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
          }
        } catch {
          // Ignore cleanup errors
        }

        onProgress({
          progress: 0,
          currentSize: 0,
          estimatedSize: 0,
          status: 'cancelled',
        });
        reject(new Error('Cancelled'));
      } else if (code === 0) {
        // Get final output size
        let finalSize = 0;
        try {
          finalSize = fs.statSync(outputPath).size;
        } catch {
          // Ignore
        }

        onProgress({
          progress: 100,
          currentSize: finalSize,
          estimatedSize: finalSize,
          status: 'completed',
          outputPath,
        });
        resolve();
      } else {
        onProgress({
          progress: 0,
          currentSize: 0,
          estimatedSize: 0,
          status: 'error',
          error: `FFmpeg exited with code ${code}`,
        });
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      activeProcess = null;
      onProgress({
        progress: 0,
        currentSize: 0,
        estimatedSize: 0,
        status: 'error',
        error: err.message,
      });
      reject(err);
    });
  });
}

/**
 * Cancel ongoing compression
 */
export function cancelCompression(): void {
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
