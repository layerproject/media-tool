import Store from 'electron-store';

type AuthStore = {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
};

type BunnyConfigStore = {
  storageApiKey?: string;
  storageZoneName?: string;
  apiKey?: string;
  pullZoneId?: string;
  defaultRemotePath?: string;
};

// Lazy initialization - stores are created only when first accessed
let authStoreInstance: Store<AuthStore> | null = null;
let bunnyStoreInstance: Store<BunnyConfigStore> | null = null;

function getAuthStore(): Store<AuthStore> {
  if (!authStoreInstance) {
    authStoreInstance = new Store<AuthStore>({
      name: 'auth',
      encryptionKey: 'layer-media-tool-secure-key',
    });
  }
  return authStoreInstance;
}

function getBunnyStore(): Store<BunnyConfigStore> {
  if (!bunnyStoreInstance) {
    bunnyStoreInstance = new Store<BunnyConfigStore>({
      name: 'bunny-config',
      encryptionKey: 'layer-media-tool-bunny-key',
    });
  }
  return bunnyStoreInstance;
}

export const authStore = {
  setTokens: (accessToken: string, refreshToken: string, expiresAt: number) => {
    getAuthStore().set('accessToken', accessToken);
    getAuthStore().set('refreshToken', refreshToken);
    getAuthStore().set('expiresAt', expiresAt);
  },

  getAccessToken: (): string | undefined => {
    return getAuthStore().get('accessToken');
  },

  getRefreshToken: (): string | undefined => {
    return getAuthStore().get('refreshToken');
  },

  getExpiresAt: (): number | undefined => {
    return getAuthStore().get('expiresAt');
  },

  clearTokens: () => {
    getAuthStore().delete('accessToken');
    getAuthStore().delete('refreshToken');
    getAuthStore().delete('expiresAt');
  },

  isTokenValid: (): boolean => {
    const expiresAt = getAuthStore().get('expiresAt');
    if (!expiresAt) return false;
    return Date.now() < expiresAt;
  },
};

export interface BunnyConfig {
  storageApiKey: string;
  storageZoneName: string;
  apiKey: string;
  pullZoneId: string;
  defaultRemotePath: string;
}

export const bunnyConfigStore = {
  setConfig: (config: BunnyConfig) => {
    getBunnyStore().set('storageApiKey', config.storageApiKey);
    getBunnyStore().set('storageZoneName', config.storageZoneName);
    getBunnyStore().set('apiKey', config.apiKey);
    getBunnyStore().set('pullZoneId', config.pullZoneId);
    getBunnyStore().set('defaultRemotePath', config.defaultRemotePath);
  },

  getConfig: (): BunnyConfig | null => {
    const storageApiKey = getBunnyStore().get('storageApiKey');
    const storageZoneName = getBunnyStore().get('storageZoneName');
    const apiKey = getBunnyStore().get('apiKey');
    const pullZoneId = getBunnyStore().get('pullZoneId');
    const defaultRemotePath = getBunnyStore().get('defaultRemotePath');

    if (!storageApiKey || !storageZoneName || !apiKey || !pullZoneId || !defaultRemotePath) {
      return null;
    }

    return { storageApiKey, storageZoneName, apiKey, pullZoneId, defaultRemotePath };
  },

  clearConfig: () => {
    getBunnyStore().delete('storageApiKey');
    getBunnyStore().delete('storageZoneName');
    getBunnyStore().delete('apiKey');
    getBunnyStore().delete('pullZoneId');
    getBunnyStore().delete('defaultRemotePath');
  },

  hasConfig: (): boolean => {
    const config = bunnyConfigStore.getConfig();
    return config !== null;
  },
};
