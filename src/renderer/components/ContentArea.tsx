import React from 'react';
import SignInToLayer from '@/views/SignInToLayer';
import SearchArtworks from '@/views/SearchArtworks';
import ScreenRecord from '@/views/ScreenRecord';
import VideoTools from '@/views/VideoTools';
import ImageTools from '@/views/ImageTools';
import BunnyCDN from '@/views/BunnyCDN';

interface ContentAreaProps {
  activeView: string;
  onNavigate?: (view: string) => void;
}

const ContentArea: React.FC<ContentAreaProps> = ({ activeView, onNavigate }) => {
  const renderContent = () => {
    switch (activeView) {
      case 'sign-in-layer':
        return <SignInToLayer onNavigate={onNavigate} />;
      case 'search-artworks':
        return <SearchArtworks onNavigate={onNavigate} />;
      case 'screen-record':
        return <ScreenRecord />;
      case 'video-tools':
        return <VideoTools />;
      case 'image-tools':
        return <ImageTools />;
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
