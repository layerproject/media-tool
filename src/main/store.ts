import Store from 'electron-store';

type AuthStore = {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
};

// Lazy initialization - store is created only when first accessed
let store: Store<AuthStore> | null = null;

function getStore(): Store<AuthStore> {
  if (!store) {
    store = new Store<AuthStore>({
      name: 'auth',
      encryptionKey: 'layer-media-tool-secure-key', // In production, use a more secure key
    });
  }
  return store;
}

export const authStore = {
  setTokens: (accessToken: string, refreshToken: string, expiresAt: number) => {
    getStore().set('accessToken', accessToken);
    getStore().set('refreshToken', refreshToken);
    getStore().set('expiresAt', expiresAt);
  },

  getAccessToken: (): string | undefined => {
    return getStore().get('accessToken');
  },

  getRefreshToken: (): string | undefined => {
    return getStore().get('refreshToken');
  },

  getExpiresAt: (): number | undefined => {
    return getStore().get('expiresAt');
  },

  clearTokens: () => {
    getStore().delete('accessToken');
    getStore().delete('refreshToken');
    getStore().delete('expiresAt');
  },

  isTokenValid: (): boolean => {
    const expiresAt = getStore().get('expiresAt');
    if (!expiresAt) return false;
    return Date.now() < expiresAt;
  },
};
