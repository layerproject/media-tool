import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent, session, dialog } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { exec } from 'child_process';
import { authStore, bunnyConfigStore, BunnyConfig } from './store';
import { startRecording, stopRecording, isRecording, RecordingOptions } from './recorder';
import { processVideoFile, getVideoFiles, generateThumbnail, cancelProcessing, resetCancellation, wasCancelled } from './video-processor';
import {
  captureGenerativeFrames,
  extractVideoFrames,
  stopFrameCapture,
  isCapturing,
  getVideoInfo,
  GenerativeFrameCaptureOptions,
  VideoFrameCaptureOptions,
  FrameCaptureProgress,
} from './frame-capturer';
import {
  uploadFolders,
  downloadAllContent,
  scanStorageContent,
  UploadProgress,
  DownloadProgress,
} from './bunny-api';
import {
  generateGifs,
  cancelGifGeneration,
  getVideoDuration,
  GifOptions,
  GifProgress,
} from './gif-generator';

// Load environment variables from .env.local (for development) or .env.production (for production)
// Use --prod flag to test production env locally without packaging
const isDevelopment = !app.isPackaged;
const useProductionEnv = process.argv.includes('--prod');

if (isDevelopment && !useProductionEnv) {
  // Development: load from project root
  const envLocalPath = path.join(__dirname, '../../.env.local');
  const envPath = path.join(__dirname, '../../.env');
  console.log('📁 Loading development env from:', envLocalPath);
  dotenv.config({ path: envLocalPath });
  dotenv.config({ path: envPath });
} else if (isDevelopment && useProductionEnv) {
  // Development with --prod flag: load .env.production from project root
  const envProdPath = path.join(__dirname, '../../.env.production');
  console.log('📁 Loading production env from:', envProdPath);
  dotenv.config({ path: envProdPath });
} else {
  // Production build: load from resources folder (extraResources copies .env.production to resources/.env)
  const resourcesPath = process.resourcesPath;
  const envPath = path.join(resourcesPath, '.env');
  console.log('📁 Loading production env from resources:', envPath);
  dotenv.config({ path: envPath });
}

// API URL for setting cookies and GraphQL requests
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const isProduction = API_URL.startsWith('https://');
console.log('🌐 API URL:', API_URL, isProduction ? '(production)' : '(development)');

// Keep a global reference of the window object
let mainWindow: BrowserWindow | null;

/**
 * Create the main application window
 */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, '../../assets/icons/icon.png')
  });

  // Load the main view
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Open DevTools in development mode
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * App ready event
 */
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    // On macOS, re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

/**
 * Quit when all windows are closed
 */
app.on('window-all-closed', () => {
  // On macOS, apps stay active until explicitly quit
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * IPC Communication Examples
 */
ipcMain.handle('app:getVersion', (): string => {
  return app.getVersion();
});

ipcMain.handle('app:getPath', (_event: IpcMainInvokeEvent, name: string): string => {
  return app.getPath(name as any);
});

/**
 * Get the API URL from environment variables
 */
ipcMain.handle('app:getApiUrl', (): string => {
  return API_URL;
});

/**
 * Auth storage IPC handlers
 */
ipcMain.handle('auth:setTokens', (_event: IpcMainInvokeEvent, accessToken: string, refreshToken: string, expiresAt: number): void => {
  authStore.setTokens(accessToken, refreshToken, expiresAt);
});

ipcMain.handle('auth:getAccessToken', (): string | undefined => {
  return authStore.getAccessToken();
});

ipcMain.handle('auth:getRefreshToken', (): string | undefined => {
  return authStore.getRefreshToken();
});

ipcMain.handle('auth:clearTokens', (): void => {
  authStore.clearTokens();
});

ipcMain.handle('auth:isTokenValid', (): boolean => {
  return authStore.isTokenValid();
});

/**
 * Bunny CDN config IPC handlers
 */
ipcMain.handle('bunny:setConfig', (_event: IpcMainInvokeEvent, config: BunnyConfig): void => {
  bunnyConfigStore.setConfig(config);
});

ipcMain.handle('bunny:getConfig', (): BunnyConfig | null => {
  return bunnyConfigStore.getConfig();
});

ipcMain.handle('bunny:clearConfig', (): void => {
  bunnyConfigStore.clearConfig();
});

ipcMain.handle('bunny:hasConfig', (): boolean => {
  return bunnyConfigStore.hasConfig();
});

/**
 * Set Supabase auth cookie for API requests
 * This allows the renderer to authenticate with the GraphQL API
 */
ipcMain.handle('auth:setApiCookie', async (_event: IpcMainInvokeEvent, accessToken: string, refreshToken: string, expiresAt?: number): Promise<void> => {
  // The Supabase SSR package expects the full session object in the cookie
  // Including expires_at is critical for the session to be considered valid
  const cookieValue = JSON.stringify({
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'bearer',
    expires_at: expiresAt || Math.floor(Date.now() / 1000) + 3600, // Default 1 hour if not provided
    expires_in: 3600,
  });
  // Supabase SSR expects Base64-URL encoding with 'base64-' prefix
  // Base64-URL: replace + with -, / with _, and remove padding (=)
  const base64 = Buffer.from(cookieValue).toString('base64');
  const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const encodedCookie = `base64-${base64url}`;

  console.log('🔐 Setting auth cookie with expires_at:', expiresAt || 'default (1 hour)');

  // Cookie name format: sb-<project-ref>-auth-token
  // Project ref extracted from Supabase URL
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || '';
  const cookieName = `sb-${projectRef}-auth-token`;

  // Set the cookie for the API domain
  // Use secure cookies for HTTPS (production), non-secure for localhost (development)
  await session.defaultSession.cookies.set({
    url: API_URL,
    name: cookieName,
    value: encodedCookie,
    path: '/',
    httpOnly: false,
    secure: isProduction,
    sameSite: isProduction ? 'no_restriction' : 'lax',
  });

  console.log('Auth cookie set for API:', API_URL);
});

/**
 * Clear the API auth cookie
 */
ipcMain.handle('auth:clearApiCookie', async (): Promise<void> => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || '';
  const cookieName = `sb-${projectRef}-auth-token`;

  try {
    await session.defaultSession.cookies.remove(API_URL, cookieName);
    console.log('Auth cookie cleared');
  } catch (error) {
    console.error('Error clearing cookie:', error);
  }
});

/**
 * Debug: Get all cookies for the API domain
 */
ipcMain.handle('auth:getCookies', async (): Promise<Electron.Cookie[]> => {
  const cookies = await session.defaultSession.cookies.get({ url: API_URL });
  console.log('Current cookies for', API_URL, ':', cookies);
  return cookies;
});

/**
 * Recording IPC handlers
 */
ipcMain.handle('recording:start', async (
  _event: IpcMainInvokeEvent,
  options: RecordingOptions
): Promise<void> => {
  return new Promise((resolve) => {
    startRecording(
      options,
      (progress) => {
        // Send progress to renderer
        mainWindow?.webContents.send('recording:progress', progress);
      },
      (outputPath, error) => {
        // Send completion to renderer
        mainWindow?.webContents.send('recording:complete', { outputPath, error });
        // Play a higher-pitched macOS system sound on successful completion
        if (outputPath && !error) {
          exec('afplay /System/Library/Sounds/Glass.aiff');
        }
        resolve();
      }
    );
  });
});

ipcMain.handle('recording:stop', (): void => {
  stopRecording();
});

ipcMain.handle('recording:isRecording', (): boolean => {
  return isRecording();
});

/**
 * Proxy GraphQL requests through the main process
 * This ensures cookies are properly sent with the request
 */
ipcMain.handle('graphql:request', async (_event: IpcMainInvokeEvent, query: string, variables?: Record<string, unknown>): Promise<{ data?: unknown; errors?: unknown[] }> => {
  const GRAPHQL_ENDPOINT = `${API_URL}/api/graphql`;

  // Get all auth cookies (Supabase may chunk large sessions into multiple cookies)
  // Cookie pattern: sb-<project-ref>-auth-token, sb-<project-ref>-auth-token.0, etc.
  // Extract project ref from NEXT_PUBLIC_SUPABASE_URL (e.g., https://zurlsszhneycrkijevri.supabase.co)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || '';
  const cookiePrefix = `sb-${projectRef}-auth-token`;

  console.log('🔍 GraphQL request debug:');
  console.log('   GRAPHQL_ENDPOINT:', GRAPHQL_ENDPOINT);
  console.log('   supabaseUrl:', supabaseUrl);
  console.log('   projectRef:', projectRef);
  console.log('   cookiePrefix:', cookiePrefix);
  if (variables) {
    console.log('   variables:', JSON.stringify(variables));
  }

  const allCookies = await session.defaultSession.cookies.get({ url: API_URL });
  const authCookies = allCookies.filter(c => c.name.startsWith(cookiePrefix));

  console.log('   All cookies for', API_URL, ':', allCookies.map(c => c.name));

  // Build cookie header string with all matching cookies
  // Do NOT URL-encode - the base64 value should be sent as-is
  // The browser sends cookies without URL-encoding and the server expects that format
  const cookieHeader = authCookies.map(c => `${c.name}=${c.value}`).join('; ');

  console.log('🔄 Proxying GraphQL request with cookies:', authCookies.length > 0 ? `${authCookies.length} cookie(s)` : 'missing');
  if (authCookies.length > 0) {
    console.log('   Cookie names:', authCookies.map(c => c.name).join(', '));
  }

  try {
    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader,
        'x-prevent-csrf': '1', // Required by GraphQL Yoga CSRF prevention
      },
      body: JSON.stringify({ query, variables }),
    });

    // Check if response is OK and has JSON content type
    const contentType = response.headers.get('content-type') || '';
    const responseText = await response.text();

    console.log('📥 GraphQL response:');
    console.log('   Status:', response.status, response.statusText);
    console.log('   Content-Type:', contentType);

    if (!response.ok) {
      console.error('   Response body:', responseText.substring(0, 500));
      throw new Error(`HTTP ${response.status}: ${response.statusText} - ${responseText.substring(0, 200)}`);
    }

    if (!contentType.includes('application/json')) {
      console.error('   Non-JSON response:', responseText.substring(0, 500));
      throw new Error(`Expected JSON but got ${contentType}: ${responseText.substring(0, 200)}`);
    }

    const result = JSON.parse(responseText);

    if (result.errors) {
      console.error('GraphQL errors:', result.errors);
    }

    return result;
  } catch (error) {
    console.error('GraphQL proxy error:', error);
    throw error;
  }
});

/**
 * Format bytes to human readable string
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Download a file from URL and save to user-selected location
 * Uses fetch with cookies for authenticated downloads
 * First makes HEAD request to get file size, then shows save dialog with size info
 */
ipcMain.handle('file:download', async (
  _event: IpcMainInvokeEvent,
  url: string,
  suggestedFilename: string
): Promise<{ success: boolean; path?: string; error?: string; size?: number }> => {
  try {
    // First, make HEAD request to get file size
    let fileSize: number | null = null;
    try {
      const headResponse = await fetch(url, { method: 'HEAD' });
      if (headResponse.ok) {
        const contentLength = headResponse.headers.get('content-length');
        if (contentLength) {
          fileSize = parseInt(contentLength, 10);
          console.log('File size:', formatFileSize(fileSize));
        }
      }
    } catch (headError) {
      console.log('HEAD request failed, continuing without size info:', headError);
    }

    // Show save dialog with file size in title if available
    const dialogTitle = fileSize
      ? `Save File (${formatFileSize(fileSize)})`
      : 'Save File';

    const result = await dialog.showSaveDialog({
      title: dialogTitle,
      defaultPath: suggestedFilename,
      filters: [
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (result.canceled || !result.filePath) {
      return { success: false, error: 'Cancelled' };
    }

    const savePath = result.filePath;

    console.log('Downloading file from:', url);

    // Fetch the file (signed Bunny CDN URL doesn't need cookies)
    const response = await fetch(url);

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    // Get the file content as buffer
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Write to file
    fs.writeFileSync(savePath, buffer);

    // Play success sound
    exec('afplay /System/Library/Sounds/Glass.aiff');

    return { success: true, path: savePath, size: buffer.length };
  } catch (error) {
    console.error('Download error:', error);
    return { success: false, error: String(error) };
  }
});

/**
 * Video file selection dialogs
 */
ipcMain.handle('dialog:selectVideoFiles', async (): Promise<{ filePaths: string[] }> => {
  const result = await dialog.showOpenDialog({
    title: 'Select Video Files',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Video Files', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'] },
    ],
  });

  return { filePaths: result.filePaths };
});

ipcMain.handle('dialog:selectVideoFolder', async (): Promise<{ filePaths: string[] }> => {
  const result = await dialog.showOpenDialog({
    title: 'Select Folder with Videos',
    properties: ['openDirectory'],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { filePaths: [] };
  }

  // Get all video files from the selected folder
  const videoFiles = await getVideoFiles(result.filePaths[0]);
  return { filePaths: videoFiles };
});

ipcMain.handle('dialog:selectDestinationFolder', async (): Promise<{ filePath: string | null }> => {
  const result = await dialog.showOpenDialog({
    title: 'Select Destination Folder',
    properties: ['openDirectory', 'createDirectory'],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { filePath: null };
  }

  return { filePath: result.filePaths[0] };
});

ipcMain.handle('dialog:selectMultipleFolders', async (): Promise<{ filePaths: string[] }> => {
  const result = await dialog.showOpenDialog({
    title: 'Select Folders to Upload',
    properties: ['openDirectory', 'multiSelections'],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { filePaths: [] };
  }

  return { filePaths: result.filePaths };
});

/**
 * Web assets processing
 */
ipcMain.handle('webAssets:process', async (
  _event: IpcMainInvokeEvent,
  filePaths: string[],
  outputDir: string
): Promise<void> => {
  const os = require('os');
  const tempDir = os.tmpdir();

  // Reset cancellation state before starting
  resetCancellation();

  for (const filePath of filePaths) {
    // Check if cancelled before processing each file
    if (wasCancelled()) {
      break;
    }

    // Generate a preview thumbnail first for the UI
    const previewThumbnailPath = path.join(tempDir, `preview_${Date.now()}.jpg`);
    try {
      await generateThumbnail(filePath, previewThumbnailPath, 160, 160);
      // Read thumbnail and convert to data URL
      const thumbnailBuffer = fs.readFileSync(previewThumbnailPath);
      const thumbnailDataUrl = `data:image/jpeg;base64,${thumbnailBuffer.toString('base64')}`;

      // Send thumbnail to renderer
      mainWindow?.webContents.send('webAssets:progress', {
        filePath,
        thumbnailDataUrl,
        jobStatus: 'processing',
        progress: 0,
        status: 'processing',
      });

      // Clean up temp thumbnail
      fs.unlinkSync(previewThumbnailPath);
    } catch (error) {
      console.error('Failed to generate preview thumbnail:', error);
      mainWindow?.webContents.send('webAssets:progress', {
        filePath,
        jobStatus: 'processing',
        progress: 0,
        status: 'processing',
      });
    }

    // Check if cancelled before starting video processing
    if (wasCancelled()) {
      break;
    }

    // Process the video file
    try {
      await processVideoFile(filePath, outputDir, (update) => {
        mainWindow?.webContents.send('webAssets:progress', {
          filePath,
          format: update.format,
          codec: update.codec,
          progress: update.progress,
          status: update.status,
        });
      });

      // Mark job as completed (only if not cancelled)
      if (!wasCancelled()) {
        mainWindow?.webContents.send('webAssets:progress', {
          filePath,
          jobStatus: 'completed',
          progress: 100,
          status: 'completed',
        });
      }
    } catch (error) {
      // Don't report cancelled as error
      if (wasCancelled()) {
        break;
      }
      console.error('Video processing error:', error);
      mainWindow?.webContents.send('webAssets:progress', {
        filePath,
        jobStatus: 'error',
        progress: 0,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Play success sound when all done (only if not cancelled)
  if (!wasCancelled()) {
    exec('afplay /System/Library/Sounds/Glass.aiff');
  }
});

/**
 * Cancel web assets processing
 */
ipcMain.handle('webAssets:cancel', (): void => {
  cancelProcessing();
});

/**
 * Frame capture IPC handlers
 */

// Get video info (fps, duration, dimensions)
ipcMain.handle('frameCapture:getVideoInfo', async (
  _event: IpcMainInvokeEvent,
  videoPath: string
): Promise<{ fps: number; duration: number; width: number; height: number }> => {
  return getVideoInfo(videoPath);
});

// Capture frames from generative artwork (iframe)
ipcMain.handle('frameCapture:generative', async (
  _event: IpcMainInvokeEvent,
  options: GenerativeFrameCaptureOptions
): Promise<void> => {
  await captureGenerativeFrames(options, (progress: FrameCaptureProgress) => {
    mainWindow?.webContents.send('frameCapture:progress', progress);
  });

  // Play success sound on completion
  if (!isCapturing()) {
    exec('afplay /System/Library/Sounds/Glass.aiff');
  }
});

// Extract frames from video file
ipcMain.handle('frameCapture:video', async (
  _event: IpcMainInvokeEvent,
  options: VideoFrameCaptureOptions
): Promise<void> => {
  await extractVideoFrames(options, (progress: FrameCaptureProgress) => {
    mainWindow?.webContents.send('frameCapture:progress', progress);
  });

  // Play success sound on completion
  if (!isCapturing()) {
    exec('afplay /System/Library/Sounds/Glass.aiff');
  }
});

// Stop frame capture
ipcMain.handle('frameCapture:stop', (): void => {
  stopFrameCapture();
});

// Check if capture is in progress
ipcMain.handle('frameCapture:isCapturing', (): boolean => {
  return isCapturing();
});

/**
 * Bunny CDN upload/download IPC handlers
 */

// Upload folders to Bunny Storage
ipcMain.handle('bunny:uploadFolders', async (
  _event: IpcMainInvokeEvent,
  folderPaths: string[]
): Promise<void> => {
  await uploadFolders(folderPaths, (progress: UploadProgress) => {
    mainWindow?.webContents.send('bunny:uploadProgress', progress);
  });

  // Play success sound on completion
  exec('afplay /System/Library/Sounds/Glass.aiff');
});

// Scan storage content to get file count and total size
ipcMain.handle('bunny:scanContent', async (): Promise<{ totalFiles: number; totalBytes: number }> => {
  return scanStorageContent();
});

// Download all content from Bunny Storage
ipcMain.handle('bunny:downloadContent', async (
  _event: IpcMainInvokeEvent,
  destinationFolder: string
): Promise<void> => {
  await downloadAllContent(destinationFolder, (progress: DownloadProgress) => {
    mainWindow?.webContents.send('bunny:downloadProgress', progress);
  });

  // Play success sound on completion
  exec('afplay /System/Library/Sounds/Glass.aiff');
});

/**
 * GIF Generation IPC handlers
 */

// Get video duration
ipcMain.handle('gif:getVideoDuration', async (
  _event: IpcMainInvokeEvent,
  filePath: string
): Promise<number> => {
  return getVideoDuration(filePath);
});

// Generate GIFs
ipcMain.handle('gif:generate', async (
  _event: IpcMainInvokeEvent,
  options: GifOptions
): Promise<void> => {
  await generateGifs(options, (progress: GifProgress) => {
    mainWindow?.webContents.send('gif:progress', progress);
  });

  // Play success sound on completion
  exec('afplay /System/Library/Sounds/Glass.aiff');
});

// Cancel GIF generation
ipcMain.handle('gif:cancel', (): void => {
  cancelGifGeneration();
});
