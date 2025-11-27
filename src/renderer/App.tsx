import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import ContentArea from './components/ContentArea';

// Extend Window interface
declare global {
  interface Window {
    electronAPI: {
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
      graphqlRequest: <T = unknown>(query: string, variables?: Record<string, unknown>) => Promise<{
        data?: T;
        errors?: Array<{ message: string; path?: string[]; locations?: Array<{ line: number; column: number }> }>;
      }>;
    };
    platform: {
      isMac: boolean;
      isWindows: boolean;
      isLinux: boolean;
    };
  }
}

// Variation data for screen recording
export interface VariationData {
  artworkTitle: string;
  variationId: string;
  variationNumbering: number;
  variationUrl: string;
}

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<string>('search-artworks');
  const [selectedVariation, setSelectedVariation] = useState<VariationData | null>(null);

  const handleNavigate = (view: string, data?: VariationData) => {
    setActiveView(view);
    if (data) {
      setSelectedVariation(data);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar activeItem={activeView} onItemClick={setActiveView} />
      <ContentArea
        activeView={activeView}
        onNavigate={handleNavigate}
        selectedVariation={selectedVariation}
      />
    </div>
  );
};

export default App;
