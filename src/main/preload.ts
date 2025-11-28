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

// Web assets progress update type
export interface WebAssetsProgressUpdate {
  filePath: string;
  format?: string;
  codec?: string;
  progress: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
  jobStatus?: 'pending' | 'processing' | 'completed' | 'error';
  thumbnailDataUrl?: string;
  error?: string;
}

// Frame capture types
export type ImageFormat = 'jpeg' | 'png';
export type CaptureResolution = '2k' | '4k' | '8k';

export interface GenerativeFrameCaptureOptions {
  url: string;
  fps: number;
  totalFrames: number;
  resolution: CaptureResolution;
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

export interface VideoInfo {
  fps: number;
  duration: number;
  width: number;
  height: number;
}

// Bunny CDN config type
export interface BunnyConfig {
  storageApiKey: string;
  storageZoneName: string;
  apiKey: string;
  pullZoneId: string;
  defaultRemotePath: string;
}

// Bunny upload/download progress types
export interface BunnyUploadProgress {
  totalFiles: number;
  uploadedFiles: number;
  currentFile: string;
  status: 'uploading' | 'completed' | 'error';
  error?: string;
}

export interface BunnyDownloadProgress {
  totalFiles: number;
  downloadedFiles: number;
  currentFile: string;
  totalBytes: number;
  downloadedBytes: number;
  status: 'listing' | 'downloading' | 'completed' | 'error';
  error?: string;
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
  // Video file selection
  selectVideoFiles: () => Promise<{ filePaths: string[] }>;
  selectVideoFolder: () => Promise<{ filePaths: string[] }>;
  selectDestinationFolder: () => Promise<{ filePath: string | null }>;
  selectMultipleFolders: () => Promise<{ filePaths: string[] }>;
  // Web assets processing
  processWebAssets: (filePaths: string[], outputDir: string) => Promise<void>;
  cancelWebAssets: () => Promise<void>;
  onWebAssetsProgress: (callback: (update: WebAssetsProgressUpdate) => void) => void;
  removeWebAssetsListeners: () => void;
  // Frame capture
  getVideoInfo: (videoPath: string) => Promise<VideoInfo>;
  captureGenerativeFrames: (options: GenerativeFrameCaptureOptions) => Promise<void>;
  captureVideoFrames: (options: VideoFrameCaptureOptions) => Promise<void>;
  stopFrameCapture: () => Promise<void>;
  isCapturing: () => Promise<boolean>;
  onFrameCaptureProgress: (callback: (progress: FrameCaptureProgress) => void) => void;
  removeFrameCaptureListeners: () => void;
  // Bunny CDN config
  setBunnyConfig: (config: BunnyConfig) => Promise<void>;
  getBunnyConfig: () => Promise<BunnyConfig | null>;
  clearBunnyConfig: () => Promise<void>;
  hasBunnyConfig: () => Promise<boolean>;
  // Bunny CDN upload/download
  uploadFoldersToBunny: (folderPaths: string[]) => Promise<void>;
  scanBunnyContent: () => Promise<{ totalFiles: number; totalBytes: number }>;
  downloadFromBunny: (destinationFolder: string) => Promise<void>;
  onBunnyUploadProgress: (callback: (progress: BunnyUploadProgress) => void) => void;
  onBunnyDownloadProgress: (callback: (progress: BunnyDownloadProgress) => void) => void;
  removeBunnyListeners: () => void;
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
  // Video file selection
  selectVideoFiles: (): Promise<{ filePaths: string[] }> =>
    ipcRenderer.invoke('dialog:selectVideoFiles'),
  selectVideoFolder: (): Promise<{ filePaths: string[] }> =>
    ipcRenderer.invoke('dialog:selectVideoFolder'),
  selectDestinationFolder: (): Promise<{ filePath: string | null }> =>
    ipcRenderer.invoke('dialog:selectDestinationFolder'),
  selectMultipleFolders: (): Promise<{ filePaths: string[] }> =>
    ipcRenderer.invoke('dialog:selectMultipleFolders'),
  // Web assets processing
  processWebAssets: (filePaths: string[], outputDir: string): Promise<void> =>
    ipcRenderer.invoke('webAssets:process', filePaths, outputDir),
  cancelWebAssets: (): Promise<void> =>
    ipcRenderer.invoke('webAssets:cancel'),
  onWebAssetsProgress: (callback: (update: WebAssetsProgressUpdate) => void): void => {
    ipcRenderer.on('webAssets:progress', (_event, update) => callback(update));
  },
  removeWebAssetsListeners: (): void => {
    ipcRenderer.removeAllListeners('webAssets:progress');
  },
  // Frame capture
  getVideoInfo: (videoPath: string): Promise<VideoInfo> =>
    ipcRenderer.invoke('frameCapture:getVideoInfo', videoPath),
  captureGenerativeFrames: (options: GenerativeFrameCaptureOptions): Promise<void> =>
    ipcRenderer.invoke('frameCapture:generative', options),
  captureVideoFrames: (options: VideoFrameCaptureOptions): Promise<void> =>
    ipcRenderer.invoke('frameCapture:video', options),
  stopFrameCapture: (): Promise<void> =>
    ipcRenderer.invoke('frameCapture:stop'),
  isCapturing: (): Promise<boolean> =>
    ipcRenderer.invoke('frameCapture:isCapturing'),
  onFrameCaptureProgress: (callback: (progress: FrameCaptureProgress) => void): void => {
    ipcRenderer.on('frameCapture:progress', (_event, progress) => callback(progress));
  },
  removeFrameCaptureListeners: (): void => {
    ipcRenderer.removeAllListeners('frameCapture:progress');
  },
  // Bunny CDN config
  setBunnyConfig: (config: BunnyConfig): Promise<void> =>
    ipcRenderer.invoke('bunny:setConfig', config),
  getBunnyConfig: (): Promise<BunnyConfig | null> =>
    ipcRenderer.invoke('bunny:getConfig'),
  clearBunnyConfig: (): Promise<void> =>
    ipcRenderer.invoke('bunny:clearConfig'),
  hasBunnyConfig: (): Promise<boolean> =>
    ipcRenderer.invoke('bunny:hasConfig'),
  // Bunny CDN upload/download
  uploadFoldersToBunny: (folderPaths: string[]): Promise<void> =>
    ipcRenderer.invoke('bunny:uploadFolders', folderPaths),
  scanBunnyContent: (): Promise<{ totalFiles: number; totalBytes: number }> =>
    ipcRenderer.invoke('bunny:scanContent'),
  downloadFromBunny: (destinationFolder: string): Promise<void> =>
    ipcRenderer.invoke('bunny:downloadContent', destinationFolder),
  onBunnyUploadProgress: (callback: (progress: BunnyUploadProgress) => void): void => {
    ipcRenderer.on('bunny:uploadProgress', (_event, progress) => callback(progress));
  },
  onBunnyDownloadProgress: (callback: (progress: BunnyDownloadProgress) => void): void => {
    ipcRenderer.on('bunny:downloadProgress', (_event, progress) => callback(progress));
  },
  removeBunnyListeners: (): void => {
    ipcRenderer.removeAllListeners('bunny:uploadProgress');
    ipcRenderer.removeAllListeners('bunny:downloadProgress');
  },
} as ElectronAPI);

/**
 * Platform information
 */
contextBridge.exposeInMainWorld('platform', {
  isMac: process.platform === 'darwin',
  isWindows: process.platform === 'win32',
  isLinux: process.platform === 'linux'
} as PlatformInfo);
