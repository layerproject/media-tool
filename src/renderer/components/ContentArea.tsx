import React from 'react';
import SignInToLayer from '@/views/SignInToLayer';

interface ContentAreaProps {
  activeView: string;
}

const ContentArea: React.FC<ContentAreaProps> = ({ activeView }) => {
  const renderContent = () => {
    switch (activeView) {
      case 'sign-in-layer':
        return <SignInToLayer />;
      case 'search-artworks':
        return (
          <div>
            <h2 className="text-2xl font-semibold mb-4">Search Artworks</h2>
            <p className="text-muted-foreground">Search artworks content goes here...</p>
          </div>
        );
      case 'screen-record':
        return (
          <div>
            <h2 className="text-2xl font-semibold mb-4">Screen Record</h2>
            <p className="text-muted-foreground">Screen recording tools go here...</p>
          </div>
        );
      case 'video-tools':
        return (
          <div>
            <h2 className="text-2xl font-semibold mb-4">Video Tools</h2>
            <p className="text-muted-foreground">Video tools content goes here...</p>
          </div>
        );
      case 'image-tools':
        return (
          <div>
            <h2 className="text-2xl font-semibold mb-4">Image Tools</h2>
            <p className="text-muted-foreground">Image tools content goes here...</p>
          </div>
        );
      case 'bunny-cdn':
        return (
          <div>
            <h2 className="text-2xl font-semibold mb-4">Bunny CDN</h2>
            <p className="text-muted-foreground">Bunny CDN management goes here...</p>
          </div>
        );
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
