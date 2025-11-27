import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RefreshCw, Square } from 'lucide-react';

export interface ScreenRecordProps {
  artworkTitle?: string;
  variationId?: string;
  variationNumbering?: number;
  variationUrl?: string;
}

type Duration = '5' | '30' | '60';
type Resolution = '2k' | '4k';
type Format = 'prores' | 'mp4';

const ScreenRecord: React.FC<ScreenRecordProps> = ({
  artworkTitle,
  variationNumbering,
  variationUrl
}) => {
  const [iframeKey, setIframeKey] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>('');

  // Recording options
  const [duration, setDuration] = useState<Duration>('30');
  const [resolution, setResolution] = useState<Resolution>('2k');
  const [format, setFormat] = useState<Format>('mp4');

  // Set up recording event listeners
  useEffect(() => {
    window.electronAPI.onRecordingProgress((prog) => {
      setProgress(prog);
      setStatus(`Capturing frames... ${Math.round(prog)}%`);
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
    if (!variationUrl || !artworkTitle || variationNumbering === undefined) {
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
          {/* Duration dropdown */}
          <Select
            value={duration}
            onValueChange={(val) => setDuration(val as Duration)}
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
            onValueChange={(val) => setResolution(val as Resolution)}
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
            onValueChange={(val) => setFormat(val as Format)}
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
