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
    };
    platform: {
      isMac: boolean;
      isWindows: boolean;
      isLinux: boolean;
    };
  }
}

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<string>('search-artworks');

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar activeItem={activeView} onItemClick={setActiveView} />
      <ContentArea activeView={activeView} onNavigate={setActiveView} />
    </div>
  );
};

export default App;
