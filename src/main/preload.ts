import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload script - Exposes safe APIs to the renderer process
 * This acts as a bridge between the main and renderer processes
 */

// Define the API shape for type safety
export interface ElectronAPI {
  getVersion: () => Promise<string>;
  getPath: (name: string) => Promise<string>;
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

  // Add more API methods here as needed
  // Example:
  // sendMessage: (channel: string, data: any) => ipcRenderer.send(channel, data),
  // onMessage: (channel: string, callback: (...args: any[]) => void) =>
  //   ipcRenderer.on(channel, (event, ...args) => callback(...args))
} as ElectronAPI);

/**
 * Platform information
 */
contextBridge.exposeInMainWorld('platform', {
  isMac: process.platform === 'darwin',
  isWindows: process.platform === 'win32',
  isLinux: process.platform === 'linux'
} as PlatformInfo);
