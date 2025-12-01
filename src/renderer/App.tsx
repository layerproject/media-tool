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
      getApiUrl: () => Promise<string>;
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
      // Video file selection
      selectVideoFiles: () => Promise<{ filePaths: string[] }>;
      selectVideoFolder: () => Promise<{ filePaths: string[] }>;
      selectDestinationFolder: () => Promise<{ filePath: string | null }>;
      selectMultipleFolders: () => Promise<{ filePaths: string[] }>;
      // Web assets processing
      processWebAssets: (filePaths: string[], outputDir: string) => Promise<void>;
      cancelWebAssets: () => Promise<void>;
      onWebAssetsProgress: (callback: (update: {
        filePath: string;
        format?: string;
        codec?: string;
        progress: number;
        status: 'pending' | 'processing' | 'completed' | 'error';
        jobStatus?: 'pending' | 'processing' | 'completed' | 'error';
        thumbnailDataUrl?: string;
        error?: string;
      }) => void) => void;
      removeWebAssetsListeners: () => void;
      // Frame capture
      getVideoInfo: (videoPath: string) => Promise<{ fps: number; duration: number; width: number; height: number }>;
      captureGenerativeFrames: (options: {
        url: string;
        fps: number;
        totalFrames: number;
        resolution: '2k' | '4k' | '8k';
        imageFormat: 'jpeg' | 'png';
        outputDir: string;
        folderName: string;
      }) => Promise<void>;
      captureVideoFrames: (options: {
        videoPath: string;
        fps: number;
        imageFormat: 'jpeg' | 'png';
        outputDir: string;
        folderName: string;
      }) => Promise<void>;
      stopFrameCapture: () => Promise<void>;
      isCapturing: () => Promise<boolean>;
      onFrameCaptureProgress: (callback: (progress: {
        currentFrame: number;
        totalFrames: number;
        status: 'capturing' | 'completed' | 'error' | 'cancelled';
        error?: string;
        outputFolder?: string;
      }) => void) => void;
      removeFrameCaptureListeners: () => void;
      // Bunny CDN config
      setBunnyConfig: (config: {
        storageApiKey: string;
        storageZoneName: string;
        apiKey: string;
        pullZoneId: string;
        defaultRemotePath: string;
      }) => Promise<void>;
      getBunnyConfig: () => Promise<{
        storageApiKey: string;
        storageZoneName: string;
        apiKey: string;
        pullZoneId: string;
        defaultRemotePath: string;
      } | null>;
      clearBunnyConfig: () => Promise<void>;
      hasBunnyConfig: () => Promise<boolean>;
      // Bunny CDN upload/download
      uploadFoldersToBunny: (folderPaths: string[]) => Promise<void>;
      scanBunnyContent: () => Promise<{ totalFiles: number; totalBytes: number }>;
      downloadFromBunny: (destinationFolder: string) => Promise<void>;
      onBunnyUploadProgress: (callback: (progress: {
        totalFiles: number;
        uploadedFiles: number;
        currentFile: string;
        status: 'uploading' | 'completed' | 'error';
        error?: string;
      }) => void) => void;
      onBunnyDownloadProgress: (callback: (progress: {
        totalFiles: number;
        downloadedFiles: number;
        currentFile: string;
        totalBytes: number;
        downloadedBytes: number;
        status: 'listing' | 'downloading' | 'completed' | 'error';
        error?: string;
      }) => void) => void;
      removeBunnyListeners: () => void;
      // GIF generation
      getVideoDuration: (filePath: string) => Promise<number>;
      generateGif: (options: {
        inputPath: string;
        startTime: number;
        endTime: number;
        targetSizes: ('10mb' | '5mb' | '2mb' | '1mb')[];
        scales: ('original' | '720p' | '480p' | '360p' | '240p')[];
        fps: number;
        dithering: boolean;
      }) => Promise<void>;
      cancelGif: () => Promise<void>;
      onGifProgress: (callback: (progress: {
        currentExport: number;
        totalExports: number;
        scale: string;
        targetSize: string;
        progress: number;
        status: 'generating' | 'completed' | 'error';
        error?: string;
      }) => void) => void;
      removeGifListeners: () => void;
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
