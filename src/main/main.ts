import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent, session } from 'electron';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { exec } from 'child_process';
import { authStore } from './store';
import { startRecording, stopRecording, isRecording, RecordingOptions } from './recorder';

// Load environment variables from .env.local (for development) or .env (for production)
// In production builds, the .env file should be in the app resources folder
const envLocalPath = path.join(__dirname, '../../.env.local');
const envPath = path.join(__dirname, '../../.env');
dotenv.config({ path: envLocalPath });
dotenv.config({ path: envPath });

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
  const cookieName = 'sb-sxfoqpyacxczdxxknkhb-auth-token';

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
  const cookieName = 'sb-sxfoqpyacxczdxxknkhb-auth-token';

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
  const cookiePrefix = 'sb-sxfoqpyacxczdxxknkhb-auth-token';
  const allCookies = await session.defaultSession.cookies.get({ url: API_URL });
  const authCookies = allCookies.filter(c => c.name.startsWith(cookiePrefix));

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

    const result = await response.json();

    if (result.errors) {
      console.error('GraphQL errors:', result.errors);
    }

    return result;
  } catch (error) {
    console.error('GraphQL proxy error:', error);
    throw error;
  }
});
