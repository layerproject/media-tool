import React from 'react';
import SearchArtworks from '@/views/SearchArtworks';
import ScreenRecord from '@/views/ScreenRecord';
import VideoTools from '@/views/VideoTools';
import ImageTools from '@/views/ImageTools';
import BunnyCDN from '@/views/BunnyCDN';

interface ContentAreaProps {
  activeView: string;
}

const ContentArea: React.FC<ContentAreaProps> = ({ activeView }) => {
  const renderContent = () => {
    switch (activeView) {
      case 'search-artworks':
        return <SearchArtworks />;
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
