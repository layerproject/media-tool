import Store from 'electron-store';

type AuthStore = {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
};

const store = new Store<AuthStore>({
  name: 'auth',
  encryptionKey: 'layer-media-tool-secure-key', // In production, use a more secure key
}) as Store<AuthStore> & {
  set: <K extends keyof AuthStore>(key: K, value: AuthStore[K]) => void;
  get: <K extends keyof AuthStore>(key: K) => AuthStore[K];
  delete: <K extends keyof AuthStore>(key: K) => void;
};

export const authStore = {
  setTokens: (accessToken: string, refreshToken: string, expiresAt: number) => {
    store.set('accessToken', accessToken);
    store.set('refreshToken', refreshToken);
    store.set('expiresAt', expiresAt);
  },

  getAccessToken: (): string | undefined => {
    return store.get('accessToken');
  },

  getRefreshToken: (): string | undefined => {
    return store.get('refreshToken');
  },

  getExpiresAt: (): number | undefined => {
    return store.get('expiresAt');
  },

  clearTokens: () => {
    store.delete('accessToken');
    store.delete('refreshToken');
    store.delete('expiresAt');
  },

  isTokenValid: (): boolean => {
    const expiresAt = store.get('expiresAt');
    if (!expiresAt) return false;
    return Date.now() < expiresAt;
  },
};
