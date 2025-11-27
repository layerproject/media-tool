import React from 'react';
import SignInToLayer from '@/views/SignInToLayer';
import SearchArtworks from '@/views/SearchArtworks';
import ScreenRecord from '@/views/ScreenRecord';
import VideoTools from '@/views/VideoTools';
import FramesCapture from '@/views/FramesCapture';
import BunnyCDN from '@/views/BunnyCDN';
import { VariationData, SearchState } from '@/App';

interface ContentAreaProps {
  activeView: string;
  onNavigate?: (view: string, data?: VariationData) => void;
  selectedVariation?: VariationData | null;
  searchState?: SearchState;
  onSearchStateChange?: (state: SearchState) => void;
}

const ContentArea: React.FC<ContentAreaProps> = ({ activeView, onNavigate, selectedVariation, searchState, onSearchStateChange }) => {
  const renderContent = () => {
    switch (activeView) {
      case 'sign-in-layer':
        return <SignInToLayer onNavigate={onNavigate} />;
      case 'search-artworks':
        return (
          <SearchArtworks
            onNavigate={onNavigate}
            searchState={searchState}
            onSearchStateChange={onSearchStateChange}
          />
        );
      case 'screen-record':
        return (
          <ScreenRecord
            artistName={selectedVariation?.artistName}
            artworkTitle={selectedVariation?.artworkTitle}
            variationId={selectedVariation?.variationId}
            variationNumbering={selectedVariation?.variationNumbering}
            variationUrl={selectedVariation?.variationUrl}
          />
        );
      case 'video-tools':
        return <VideoTools />;
      case 'frames-capture':
        return (
          <FramesCapture
            artistName={selectedVariation?.artistName}
            artworkTitle={selectedVariation?.artworkTitle}
            variationId={selectedVariation?.variationId}
            variationNumbering={selectedVariation?.variationNumbering}
            variationUrl={selectedVariation?.variationUrl}
          />
        );
      case 'bunny-cdn':
        return <BunnyCDN />;
      default:
        return null;
    }
  };

  return (
    <div className="flex-1 h-screen overflow-y-auto">
      <div className="p-8">
        {renderContent()}
      </div>
    </div>
  );
};

export default ContentArea;
