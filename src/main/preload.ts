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
} as ElectronAPI);

/**
 * Platform information
 */
contextBridge.exposeInMainWorld('platform', {
  isMac: process.platform === 'darwin',
  isWindows: process.platform === 'win32',
  isLinux: process.platform === 'linux'
} as PlatformInfo);
