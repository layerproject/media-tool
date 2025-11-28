/**
 * Application constants
 */

// API URL for Layer Core - fetched from main process environment
// This will be populated asynchronously when the app starts
let _apiUrl = 'http://localhost:3000'; // fallback

// Initialize API URL from main process
export async function initApiUrl(): Promise<void> {
  try {
    _apiUrl = await window.electronAPI.getApiUrl();
    console.log('API URL initialized:', _apiUrl);
  } catch (error) {
    console.error('Failed to get API URL from main process:', error);
  }
}

// Getter for API URL
export function getApiUrl(): string {
  return _apiUrl;
}

// Default organization ID (used when user has no organizations)
export const DEFAULT_ORG_ID = 'a0000000-0000-0000-0000-000000000000';
