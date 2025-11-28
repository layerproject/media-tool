import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { ffmpegPath, ffprobePath } from './ffmpeg-paths';

// Track active processes for cancellation
let activeProcesses: ChildProcess[] = [];
let isCancelled = false;

/**
 * Cancel all active video processing
 */
export function cancelProcessing(): void {
  isCancelled = true;
  for (const proc of activeProcesses) {
    try {
      proc.kill('SIGKILL');
    } catch (e) {
      // Process may have already exited
    }
  }
  activeProcesses = [];
}

/**
 * Reset cancellation state (call before starting new processing)
 */
export function resetCancellation(): void {
  isCancelled = false;
  activeProcesses = [];
}

/**
 * Check if processing was cancelled
 */
export function wasCancelled(): boolean {
  return isCancelled;
}

export type Codec = 'h264' | 'hevc' | 'vp9';
export type Format = 'card' | 'featured' | 'page';

export interface VideoFileInfo {
  filePath: string;
  filename: string;
  duration: number;
}

export interface ProcessingJob {
  id: string;
  inputFile: VideoFileInfo;
  outputDir: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  currentFormat?: Format;
  currentCodec?: Codec;
  progress: number;
  error?: string;
  thumbnailPath?: string;
}

export interface FormatConfig {
  name: Format;
  width: number;
  height: number;
  duration: number | null; // null = use original duration
  startTime: number | null; // null = start from beginning
}

const FORMAT_CONFIGS: FormatConfig[] = [
  { name: 'card', width: 640, height: 640, duration: 5, startTime: 15 }, // Crop from 15s-20s
  { name: 'featured', width: 1500, height: 1500, duration: null, startTime: null },
  { name: 'page', width: 1000, height: 1000, duration: null, startTime: null },
];

const CODECS: Codec[] = ['h264', 'hevc', 'vp9'];

const MINIMUM_DURATION_SECONDS = 30;

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

    proc.stdout.on('data', (data) => {
      output += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        const duration = parseFloat(output.trim());
        resolve(isNaN(duration) ? 30 : duration);
      } else {
        reject(new Error(`ffprobe exited with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

/**
 * Extract filename parts using _v{number}_ as the delimiter
 * Expected formats:
 *   - artist_title_v1.mp4
 *   - artist_title_v1_30s_4k.mp4
 *   - sam_shull_color_spots_v1_30s_4k.mp4
 *
 * The _v{number} pattern marks the end of the title and start of metadata
 */
function parseFilename(filename: string): { artist: string; title: string; variation: number } {
  // Remove extension
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');

  // Find the variation pattern _v{number} which separates the naming from metadata
  const variationMatch = nameWithoutExt.match(/_v(\d+)(?:_|$)/i);

  if (variationMatch) {
    const variation = parseInt(variationMatch[1], 10);
    // Get everything before _v{number}
    const beforeVariation = nameWithoutExt.substring(0, variationMatch.index);

    // Now split by underscore to get artist and title
    // We need to figure out where artist ends and title begins
    // Convention: first part is artist (can have underscores), rest before _v is title
    const parts = beforeVariation.split('_');

    if (parts.length >= 2) {
      // Try to detect artist name - typically 1-2 words (first_last or single)
      // Look for common patterns: if we have 3+ parts, first 2 are likely artist name
      // For "sam_shull_actinaria" -> artist: sam_shull, title: actinaria
      // For "smith_colorflow" -> artist: smith, title: colorflow

      // Heuristic: if there are 3+ parts, assume first 2 are artist name
      // This works for "firstname_lastname_title" pattern
      if (parts.length >= 3) {
        const artist = `${parts[0]}_${parts[1]}`;
        const title = parts.slice(2).join('_');
        return { artist, title, variation };
      }

      // For 2 parts: artist_title
      return {
        artist: parts[0],
        title: parts[1],
        variation
      };
    }

    // Single part before variation
    return {
      artist: 'unknown',
      title: beforeVariation || nameWithoutExt,
      variation
    };
  }

  // No variation pattern found - fallback to simple split
  const parts = nameWithoutExt.split('_');

  if (parts.length >= 2) {
    return {
      artist: parts[0],
      title: parts.slice(1).join('_'),
      variation: 1
    };
  }

  // Fallback: use whole name as title
  return {
    artist: 'unknown',
    title: nameWithoutExt,
    variation: 1
  };
}

/**
 * Generate the folder name for an artwork
 * Format: [artist_name]_[artwork_title]_v[number]
 */
function generateFolderName(artist: string, title: string, variation: number): string {
  return `${artist}_${title}_v${variation}`;
}

/**
 * Generate output filename
 */
function generateOutputFilename(
  artist: string,
  title: string,
  format: FormatConfig,
  duration: number,
  codec?: Codec,
  isThumbnail = false
): string {
  const durationSuffix = format.duration !== null ? format.duration : Math.round(duration);
  const base = `${artist}_${title}`;

  if (isThumbnail) {
    return `${base}_${format.name}_thumbnail_${format.width}x${format.height}_${durationSuffix}s.jpg`;
  }

  return `${base}_${format.name}_${format.width}x${format.height}_${durationSuffix}s.${codec}.mp4`;
}

/**
 * Generate thumbnail from video frame
 * @param startTime - Optional start time in seconds to extract frame from
 */
export async function generateThumbnail(
  inputPath: string,
  outputPath: string,
  width: number,
  height: number,
  startTime: number | null = null
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
    ];

    // Seek to start time if provided (placed before -i for faster seeking)
    if (startTime !== null) {
      args.push('-ss', String(startTime));
    }

    args.push(
      '-i', inputPath,
      '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
      '-vframes', '1',
      '-q:v', '2',
      outputPath
    );

    const proc = spawn(ffmpegPath, args);

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Thumbnail generation failed with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

/**
 * Encode video to specific codec and format
 */
export function encodeVideo(
  inputPath: string,
  outputPath: string,
  width: number,
  height: number,
  codec: Codec,
  duration: number | null,
  onProgress: (progress: number) => void,
  startTime: number | null = null
): { process: ChildProcess; promise: Promise<void> } {
  const args: string[] = [
    '-y',
  ];

  // Start time offset (placed before -i for faster seeking)
  if (startTime !== null) {
    args.push('-ss', String(startTime));
  }

  args.push('-i', inputPath);

  // Duration limit
  if (duration !== null) {
    args.push('-t', String(duration));
  }

  // Scale filter
  args.push('-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`);

  // Codec-specific settings
  switch (codec) {
    case 'h264':
      args.push(
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart'
      );
      break;
    case 'hevc':
      args.push(
        '-c:v', 'libx265',
        '-preset', 'medium',
        '-crf', '28',
        '-pix_fmt', 'yuv420p',
        '-tag:v', 'hvc1',
        '-movflags', '+faststart'
      );
      break;
    case 'vp9':
      args.push(
        '-c:v', 'libvpx-vp9',
        '-crf', '30',
        '-b:v', '0',
        '-pix_fmt', 'yuv420p'
      );
      break;
  }

  // No audio for web assets
  args.push('-an');

  // Progress output
  args.push('-progress', 'pipe:1');

  args.push(outputPath);

  const proc = spawn(ffmpegPath, args);

  // Track process for cancellation
  activeProcesses.push(proc);

  const promise = new Promise<void>((resolve, reject) => {
    proc.stdout?.on('data', (data) => {
      const output = data.toString();
      const timeMatch = output.match(/out_time_ms=(\d+)/);
      if (timeMatch) {
        const currentTimeMs = parseInt(timeMatch[1], 10);
        const currentTimeSec = currentTimeMs / 1000000;
        const totalDuration = duration ?? 30;
        const progress = Math.min((currentTimeSec / totalDuration) * 100, 100);
        onProgress(progress);
      }
    });

    proc.stderr?.on('data', (data) => {
      // Log errors but don't fail immediately
      const output = data.toString();
      if (output.includes('Error') || output.includes('error')) {
        console.error('ffmpeg stderr:', output);
      }
    });

    proc.on('close', (code) => {
      // Remove from active processes
      activeProcesses = activeProcesses.filter(p => p !== proc);

      if (isCancelled) {
        reject(new Error('Processing cancelled'));
      } else if (code === 0) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(`Encoding failed with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      activeProcesses = activeProcesses.filter(p => p !== proc);
      reject(err);
    });
  });

  return { process: proc, promise };
}

/**
 * Process a single video file through all formats and codecs
 * Creates a subfolder for each artwork: [artist]_[title]_v[number]
 */
export async function processVideoFile(
  inputPath: string,
  outputDir: string,
  onProgress: (update: {
    format: Format;
    codec: Codec | 'thumbnail';
    progress: number;
    status: 'processing' | 'completed' | 'error';
  }) => void
): Promise<void> {
  const filename = path.basename(inputPath);
  const { artist, title, variation } = parseFilename(filename);
  const videoDuration = await getVideoDuration(inputPath);

  // Validate minimum duration
  if (videoDuration < MINIMUM_DURATION_SECONDS) {
    throw new Error(`Video "${filename}" is only ${Math.round(videoDuration)}s. Minimum required duration is ${MINIMUM_DURATION_SECONDS}s.`);
  }

  // Create a subfolder for this artwork
  const folderName = generateFolderName(artist, title, variation);
  const artworkOutputDir = path.join(outputDir, folderName);

  // Ensure output directory exists
  if (!fs.existsSync(artworkOutputDir)) {
    fs.mkdirSync(artworkOutputDir, { recursive: true });
  }

  for (const formatConfig of FORMAT_CONFIGS) {
    const duration = formatConfig.duration ?? videoDuration;

    // Generate thumbnail for this format
    const thumbnailFilename = generateOutputFilename(artist, title, formatConfig, duration, undefined, true);
    const thumbnailPath = path.join(artworkOutputDir, thumbnailFilename);

    try {
      onProgress({ format: formatConfig.name, codec: 'thumbnail', progress: 0, status: 'processing' });
      await generateThumbnail(inputPath, thumbnailPath, formatConfig.width, formatConfig.height, formatConfig.startTime);
      onProgress({ format: formatConfig.name, codec: 'thumbnail', progress: 100, status: 'completed' });
    } catch (error) {
      console.error(`Thumbnail generation failed for ${formatConfig.name}:`, error);
      onProgress({ format: formatConfig.name, codec: 'thumbnail', progress: 0, status: 'error' });
    }

    // Encode to each codec
    for (const codec of CODECS) {
      const outputFilename = generateOutputFilename(artist, title, formatConfig, duration, codec);
      const outputPath = path.join(artworkOutputDir, outputFilename);

      try {
        onProgress({ format: formatConfig.name, codec, progress: 0, status: 'processing' });

        const { promise } = encodeVideo(
          inputPath,
          outputPath,
          formatConfig.width,
          formatConfig.height,
          codec,
          formatConfig.duration,
          (progress) => {
            onProgress({ format: formatConfig.name, codec, progress, status: 'processing' });
          },
          formatConfig.startTime
        );

        await promise;
        onProgress({ format: formatConfig.name, codec, progress: 100, status: 'completed' });
      } catch (error) {
        console.error(`Encoding failed for ${formatConfig.name} ${codec}:`, error);
        onProgress({ format: formatConfig.name, codec, progress: 0, status: 'error' });
      }
    }
  }
}

/**
 * Get list of video files from path (file or directory)
 */
export async function getVideoFiles(inputPath: string): Promise<string[]> {
  const stats = fs.statSync(inputPath);
  const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'];

  if (stats.isFile()) {
    const ext = path.extname(inputPath).toLowerCase();
    if (videoExtensions.includes(ext)) {
      return [inputPath];
    }
    return [];
  }

  if (stats.isDirectory()) {
    const files = fs.readdirSync(inputPath);
    return files
      .filter(file => videoExtensions.includes(path.extname(file).toLowerCase()))
      .map(file => path.join(inputPath, file));
  }

  return [];
}
