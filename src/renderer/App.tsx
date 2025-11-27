import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import ContentArea from './components/ContentArea';

// Recording options type
export interface RecordingOptions {
  url: string;
  duration: number;
  format: 'prores' | 'mp4';
  resolution: '2k' | '4k';
  artistName: string;
  artworkTitle: string;
  variationNumbering: number;
}

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
      // Recording methods
      startRecording: (options: RecordingOptions) => Promise<void>;
      stopRecording: () => Promise<void>;
      isRecording: () => Promise<boolean>;
      onRecordingProgress: (callback: (progress: number) => void) => void;
      onRecordingComplete: (callback: (result: { outputPath: string | null; error?: string }) => void) => void;
      removeRecordingListeners: () => void;
      // File download
      downloadFile: (url: string, suggestedFilename: string) => Promise<{ success: boolean; path?: string; error?: string; size?: number }>;
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
  artistName: string;
  artworkTitle: string;
  variationId: string;
  variationNumbering: number;
  variationUrl: string;
}

// Search state to persist across navigation
export interface SearchState {
  searchQuery: string;
  searchResults: unknown[];
  totalCount: number;
  selectedArtwork: unknown | null;
}

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<string>('search-artworks');
  const [selectedVariation, setSelectedVariation] = useState<VariationData | null>(null);

  // Persist search state across navigation
  const [searchState, setSearchState] = useState<SearchState>({
    searchQuery: '',
    searchResults: [],
    totalCount: 0,
    selectedArtwork: null,
  });

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
        searchState={searchState}
        onSearchStateChange={setSearchState}
      />
    </div>
  );
};

export default App;
