import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

export interface ScreenRecordProps {
  artworkTitle?: string;
  variationId?: string;
  variationNumbering?: number;
  variationUrl?: string;
}

const ScreenRecord: React.FC<ScreenRecordProps> = ({
  artworkTitle,
  variationId,
  variationNumbering,
  variationUrl
}) => {
  const [iframeKey, setIframeKey] = useState(0);

  const handleRecord = () => {
    console.log('Recording:', {
      artworkTitle,
      variationId,
      variationNumbering,
      variationUrl
    });
  };

  const handleRefresh = () => {
    setIframeKey(prev => prev + 1);
  };

  // Show placeholder if no variation is selected
  if (!variationUrl) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Select a variation from an artwork to start recording
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-border">
        <div className="text-sm">
          <span className="font-medium">{artworkTitle}</span>
          <span className="text-muted-foreground ml-2">
            #{variationNumbering}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handleRefresh}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button onClick={handleRecord}>
            Record
          </Button>
        </div>
      </div>

      {/* Iframe container with square aspect ratio */}
      <div className="flex-1 flex items-start justify-center">
        <div className="w-full max-w-2xl">
          <div className="aspect-square bg-muted rounded-lg overflow-hidden">
            <iframe
              key={iframeKey}
              src={variationUrl}
              title={`${artworkTitle} - Variation #${variationNumbering}`}
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScreenRecord;
