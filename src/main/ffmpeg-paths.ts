import { app } from 'electron';

/**
 * Get the correct ffmpeg/ffprobe paths for both development and production
 *
 * In development: Uses paths from @ffmpeg-installer packages directly
 * In production: Uses paths from asar-unpacked directory
 */

// Get raw paths from installer packages
const ffmpegInstallerPath = require('@ffmpeg-installer/ffmpeg').path;
const ffprobeInstallerPath = require('@ffprobe-installer/ffprobe').path;

/**
 * Fix path for packaged Electron app
 * In production, the path contains 'app.asar' but binaries are in 'app.asar.unpacked'
 */
function getUnpackedPath(installerPath: string): string {
  if (app.isPackaged) {
    // Replace app.asar with app.asar.unpacked in the path
    return installerPath.replace('app.asar', 'app.asar.unpacked');
  }
  return installerPath;
}

export const ffmpegPath = getUnpackedPath(ffmpegInstallerPath);
export const ffprobePath = getUnpackedPath(ffprobeInstallerPath);

// Log paths for debugging
console.log('📹 FFmpeg path:', ffmpegPath);
console.log('📹 FFprobe path:', ffprobePath);
