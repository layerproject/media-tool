/**
 * GraphQL client that routes requests through Electron's main process
 * This ensures cookies are properly sent with requests (avoiding cross-origin issues)
 */

export interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: Array<{
    message: string;
    path?: string[];
    locations?: Array<{ line: number; column: number }>;
  }>;
}

/**
 * Execute a GraphQL request through Electron's main process proxy
 * This ensures authentication cookies are properly included
 */
export async function graphqlRequest<T = unknown>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const response = await window.electronAPI.graphqlRequest<T>(query, variables);

  if (response.errors && response.errors.length > 0) {
    console.error('GraphQL errors:', response.errors);
    throw new Error(response.errors[0].message);
  }

  if (!response.data) {
    throw new Error('No data returned from GraphQL request');
  }

  return response.data;
}

/**
 * Set the authorization token (triggers cookie storage via Electron API)
 * This is now handled by the setApiCookie IPC call, but we keep this for compatibility
 */
export const setAuthToken = async (token: string, refreshToken?: string) => {
  if (refreshToken) {
    await window.electronAPI.setApiCookie(token, refreshToken);
  }
};

/**
 * Clear the authorization token
 */
export const clearAuthToken = async () => {
  await window.electronAPI.clearApiCookie();
};
