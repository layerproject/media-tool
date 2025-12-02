import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RefreshCw, Square, Link, X } from 'lucide-react';

export interface ScreenRecordProps {
  artistName?: string;
  artworkTitle?: string;
  variationId?: string;
  variationNumbering?: number;
  variationUrl?: string;
}

type Duration = '5' | '30' | '60';
type Resolution = '2k' | '4k';
type Format = 'prores' | 'mp4';

// Estimated temp file sizes per frame (JPEG at quality 95)
const FRAME_SIZES = {
  '2k': 150,  // ~150KB per frame at 1080x1080
  '4k': 500,  // ~500KB per frame at 2160x2160
};

// Get estimated disk space needed for recording
const getEstimatedDiskSpace = (resolution: Resolution, durationSec: number): string => {
  const framesPerSecond = 30;
  const totalFrames = durationSec * framesPerSecond;
  const totalKB = totalFrames * FRAME_SIZES[resolution];

  if (totalKB >= 1024 * 1024) {
    return `~${(totalKB / (1024 * 1024)).toFixed(1)} GB`;
  }
  return `~${Math.round(totalKB / 1024)} MB`;
};

/**
 * Validate that a URL is a valid Layer asset view URL
 * Expected format: https://core.layer.com/view/asset/{assetId}
 */
function isValidLayerAssetUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    // Check if it's a layer.com domain and has /view/asset/ path
    return urlObj.hostname.endsWith('layer.com') && urlObj.pathname.includes('/view/asset/');
  } catch {
    return false;
  }
}

const ScreenRecord: React.FC<ScreenRecordProps> = ({
  artistName: propArtistName,
  artworkTitle: propArtworkTitle,
  variationNumbering: propVariationNumbering,
  variationUrl: propVariationUrl
}) => {
  const [iframeKey, setIframeKey] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>('');

  // Recording options
  const [duration, setDuration] = useState<Duration>('30');
  const [resolution, setResolution] = useState<Resolution>('2k');
  const [format, setFormat] = useState<Format>('mp4');

  // URL input state
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);

  // Override state from URL input
  const [overrideArtistName, setOverrideArtistName] = useState<string | null>(null);
  const [overrideArtworkTitle, setOverrideArtworkTitle] = useState<string | null>(null);
  const [overrideVariationUrl, setOverrideVariationUrl] = useState<string | null>(null);

  // Use override values if set, otherwise use props
  const artistName = overrideArtistName ?? propArtistName;
  const artworkTitle = overrideArtworkTitle ?? propArtworkTitle;
  const variationNumbering = overrideArtistName ? 0 : propVariationNumbering; // Always 0 for URL-loaded artworks
  const variationUrl = overrideVariationUrl ?? propVariationUrl;

  // Clear status when any recording option changes
  const handleDurationChange = (val: Duration) => {
    setDuration(val);
    setStatus('');
  };
  const handleResolutionChange = (val: Resolution) => {
    setResolution(val);
    setStatus('');
  };
  const handleFormatChange = (val: Format) => {
    setFormat(val);
    setStatus('');
  };

  // Set up recording event listeners
  useEffect(() => {
    window.electronAPI.onRecordingProgress((prog) => {
      // Progress is 0-100 for capture, 100-200 for encoding
      if (prog >= 100) {
        // Encoding phase: normalize 100-200 to 0-100 for display
        const encodingProgress = prog - 100;
        setProgress(encodingProgress);
        setStatus(`Encoding... ${Math.round(encodingProgress)}%`);
      } else {
        // Capture phase
        setProgress(prog);
        setStatus(`Capturing frames... ${Math.round(prog)}%`);
      }
    });

    window.electronAPI.onRecordingComplete((result) => {
      setIsRecording(false);
      setProgress(0);
      if (result.error) {
        setStatus(`Error: ${result.error}`);
      } else if (result.outputPath) {
        setStatus(`Saved to: ${result.outputPath}`);
      } else {
        setStatus('');
      }
    });

    return () => {
      window.electronAPI.removeRecordingListeners();
    };
  }, []);

  const handleRecord = async () => {
    if (!variationUrl || !artistName || !artworkTitle || variationNumbering === undefined) {
      return;
    }

    setIsRecording(true);
    setProgress(0);
    setStatus('Starting recording...');

    try {
      await window.electronAPI.startRecording({
        url: variationUrl,
        duration: parseInt(duration, 10),
        format,
        resolution,
        artistName,
        artworkTitle,
        variationNumbering,
      });
    } catch (error) {
      console.error('Recording error:', error);
      setIsRecording(false);
      setStatus(`Error: ${error}`);
    }
  };

  const handleStop = async () => {
    setStatus('Stopping...');
    await window.electronAPI.stopRecording();
  };

  const handleRefresh = () => {
    setIframeKey(prev => prev + 1);
  };

  // Handle loading artwork from URL
  const handleLoadFromUrl = () => {
    const trimmedUrl = urlInput.trim();

    if (!isValidLayerAssetUrl(trimmedUrl)) {
      setUrlError('Invalid URL. Expected format: https://core.layer.com/view/asset/{assetId}');
      return;
    }

    // Extract a title from the URL (use asset ID as fallback title)
    const urlObj = new URL(trimmedUrl);
    const pathParts = urlObj.pathname.split('/');
    const assetId = pathParts[pathParts.length - 1] || 'Unknown';

    // Set override values - use the URL directly as the iframe source
    setOverrideArtistName('Unknown');
    setOverrideArtworkTitle(`Asset ${assetId.substring(0, 8)}...`);
    setOverrideVariationUrl(trimmedUrl);
    setUrlInput('');
    setUrlError(null);
    setStatus('');
  };

  // Handle URL input key press
  const handleUrlKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleLoadFromUrl();
    }
  };

  // Clear override and go back to placeholder
  const handleClearOverride = () => {
    setOverrideArtistName(null);
    setOverrideArtworkTitle(null);
    setOverrideVariationUrl(null);
    setUrlInput('');
    setUrlError(null);
    setStatus('');
  };

  // Show placeholder if no variation is selected (either from props or URL)
  if (!variationUrl) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="max-w-md w-full space-y-6 text-center">
          <div className="text-muted-foreground">
            Select a variation from an artwork to start recording
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or paste a Layer URL</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Link className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  type="text"
                  placeholder="https://core.layer.com/view/asset/..."
                  value={urlInput}
                  onChange={(e) => {
                    setUrlInput(e.target.value);
                    setUrlError(null);
                  }}
                  onKeyDown={handleUrlKeyDown}
                  className="pl-9"
                />
              </div>
              <Button onClick={handleLoadFromUrl} disabled={!urlInput.trim()}>
                Load
              </Button>
            </div>
            {urlError && (
              <p className="text-sm text-destructive">{urlError}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Check if we're using URL-loaded artwork
  const isFromUrl = overrideArtistName !== null;

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-border">
        <div className="text-sm flex items-center gap-2">
          <span className="font-medium">{artworkTitle}</span>
          {variationNumbering !== undefined && variationNumbering > 0 && (
            <span className="text-muted-foreground">
              #{variationNumbering}
            </span>
          )}
          {isFromUrl && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearOverride}
              className="h-6 px-2 text-muted-foreground hover:text-foreground"
              disabled={isRecording}
            >
              <X className="w-3 h-3 mr-1" />
              Clear
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Duration dropdown */}
          <Select
            value={duration}
            onValueChange={(val: string) => handleDurationChange(val as Duration)}
            disabled={isRecording}
          >
            <SelectTrigger className="w-[100px]">
              <SelectValue placeholder="Duration" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5">5 sec</SelectItem>
              <SelectItem value="30">30 sec</SelectItem>
              <SelectItem value="60">60 sec</SelectItem>
            </SelectContent>
          </Select>

          {/* Resolution dropdown */}
          <Select
            value={resolution}
            onValueChange={(val: string) => handleResolutionChange(val as Resolution)}
            disabled={isRecording}
          >
            <SelectTrigger className="w-[80px]">
              <SelectValue placeholder="Resolution" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2k">2K</SelectItem>
              <SelectItem value="4k">4K</SelectItem>
            </SelectContent>
          </Select>

          {/* Format dropdown */}
          <Select
            value={format}
            onValueChange={(val: string) => handleFormatChange(val as Format)}
            disabled={isRecording}
          >
            <SelectTrigger className="w-[110px]">
              <SelectValue placeholder="Format" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mp4">MP4</SelectItem>
              <SelectItem value="prores">ProRes 4444</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={isRecording}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>

          {isRecording ? (
            <Button variant="destructive" onClick={handleStop}>
              <Square className="w-4 h-4 mr-2" />
              Stop
            </Button>
          ) : (
            <Button onClick={handleRecord}>
              Record
            </Button>
          )}
        </div>
      </div>

      {/* Recording info (shown when not recording) */}
      {!isRecording && !status && (
        <div className="mb-4 p-3 rounded-md bg-amber-500/10 border border-amber-500/20 text-sm space-y-1">
          <p className="text-amber-600 dark:text-amber-400">
            Temp disk space needed: {getEstimatedDiskSpace(resolution, parseInt(duration, 10))}
          </p>
          {resolution === '4k' && (
            <p className="text-amber-600 dark:text-amber-400">
              4K recordings take longer to capture and encode.
            </p>
          )}
        </div>
      )}

      {/* Progress bar (shown during recording) */}
      {isRecording && (
        <div className="mb-4">
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sm text-muted-foreground mt-1">{status}</p>
          <p className="text-xs text-muted-foreground mt-2">
            Recording happens in the background. The preview below may not be perfectly synced.
            Feel free to do something else while recording.
          </p>
        </div>
      )}

      {/* Status message (shown when not recording) */}
      {!isRecording && status && (
        <div className="mb-4">
          <p className="text-sm text-muted-foreground">{status}</p>
        </div>
      )}

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
