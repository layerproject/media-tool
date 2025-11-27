import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload script - Exposes safe APIs to the renderer process
 * This acts as a bridge between the main and renderer processes
 */

// GraphQL response type
export interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: Array<{ message: string; path?: string[]; locations?: Array<{ line: number; column: number }> }>;
}

// Recording options type (must match main/recorder.ts)
export interface RecordingOptions {
  url: string;
  duration: number;
  format: 'prores' | 'mp4';
  resolution: '2k' | '4k';
  artistName: string;
  artworkTitle: string;
  variationNumbering: number;
}

// Define the API shape for type safety
export interface ElectronAPI {
  getVersion: () => Promise<string>;
  getPath: (name: string) => Promise<string>;
  // Auth storage methods
  setTokens: (accessToken: string, refreshToken: string, expiresAt: number) => Promise<void>;
  getAccessToken: () => Promise<string | undefined>;
  getRefreshToken: () => Promise<string | undefined>;
  clearTokens: () => Promise<void>;
  isTokenValid: () => Promise<boolean>;
  // API cookie methods for GraphQL authentication
  setApiCookie: (accessToken: string, refreshToken: string, expiresAt?: number) => Promise<void>;
  clearApiCookie: () => Promise<void>;
  getCookies: () => Promise<Array<{ name: string; value: string; domain?: string; path?: string }>>;
  // GraphQL proxy - routes requests through main process with proper cookies
  graphqlRequest: <T = unknown>(query: string, variables?: Record<string, unknown>) => Promise<GraphQLResponse<T>>;
  // Recording methods
  startRecording: (options: RecordingOptions) => Promise<void>;
  stopRecording: () => Promise<void>;
  isRecording: () => Promise<boolean>;
  onRecordingProgress: (callback: (progress: number) => void) => void;
  onRecordingComplete: (callback: (result: { outputPath: string | null; error?: string }) => void) => void;
  removeRecordingListeners: () => void;
  // File download
  downloadFile: (url: string, suggestedFilename: string) => Promise<{ success: boolean; path?: string; error?: string; size?: number }>;
}

export interface PlatformInfo {
  isMac: boolean;
  isWindows: boolean;
  isLinux: boolean;
}

contextBridge.exposeInMainWorld('electronAPI', {
  // App information
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  getPath: (name: string): Promise<string> => ipcRenderer.invoke('app:getPath', name),

  // Auth storage methods
  setTokens: (accessToken: string, refreshToken: string, expiresAt: number): Promise<void> =>
    ipcRenderer.invoke('auth:setTokens', accessToken, refreshToken, expiresAt),
  getAccessToken: (): Promise<string | undefined> =>
    ipcRenderer.invoke('auth:getAccessToken'),
  getRefreshToken: (): Promise<string | undefined> =>
    ipcRenderer.invoke('auth:getRefreshToken'),
  clearTokens: (): Promise<void> =>
    ipcRenderer.invoke('auth:clearTokens'),
  isTokenValid: (): Promise<boolean> =>
    ipcRenderer.invoke('auth:isTokenValid'),
  // API cookie methods for GraphQL authentication
  setApiCookie: (accessToken: string, refreshToken: string, expiresAt?: number): Promise<void> =>
    ipcRenderer.invoke('auth:setApiCookie', accessToken, refreshToken, expiresAt),
  clearApiCookie: (): Promise<void> =>
    ipcRenderer.invoke('auth:clearApiCookie'),
  getCookies: (): Promise<Array<{ name: string; value: string; domain?: string; path?: string }>> =>
    ipcRenderer.invoke('auth:getCookies'),
  // GraphQL proxy - routes requests through main process with proper cookies
  graphqlRequest: <T = unknown>(query: string, variables?: Record<string, unknown>): Promise<GraphQLResponse<T>> =>
    ipcRenderer.invoke('graphql:request', query, variables),

  // Recording methods
  startRecording: (options: RecordingOptions): Promise<void> =>
    ipcRenderer.invoke('recording:start', options),
  stopRecording: (): Promise<void> =>
    ipcRenderer.invoke('recording:stop'),
  isRecording: (): Promise<boolean> =>
    ipcRenderer.invoke('recording:isRecording'),
  onRecordingProgress: (callback: (progress: number) => void): void => {
    ipcRenderer.on('recording:progress', (_event, progress) => callback(progress));
  },
  onRecordingComplete: (callback: (result: { outputPath: string | null; error?: string }) => void): void => {
    ipcRenderer.on('recording:complete', (_event, result) => callback(result));
  },
  removeRecordingListeners: (): void => {
    ipcRenderer.removeAllListeners('recording:progress');
    ipcRenderer.removeAllListeners('recording:complete');
  },
  // File download
  downloadFile: (url: string, suggestedFilename: string): Promise<{ success: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke('file:download', url, suggestedFilename),
} as ElectronAPI);

/**
 * Platform information
 */
contextBridge.exposeInMainWorld('platform', {
  isMac: process.platform === 'darwin',
  isWindows: process.platform === 'win32',
  isLinux: process.platform === 'linux'
} as PlatformInfo);
