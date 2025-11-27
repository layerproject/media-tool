import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FolderOpen, FileVideo, Play, Square } from 'lucide-react';

export interface FramesCaptureProps {
  artistName?: string;
  artworkTitle?: string;
  variationId?: string;
  variationNumbering?: number;
  variationUrl?: string;
}

type SourceMode = 'generative' | 'video';
type ImageFormat = 'jpeg' | 'png';
type Resolution = '2k' | '4k' | '8k';

// Estimated file sizes per frame in KB
const FRAME_SIZES = {
  jpeg: {
    '2k': 150,   // ~150KB per JPEG at 1080x1080
    '4k': 500,   // ~500KB per JPEG at 2160x2160
    '8k': 1800,  // ~1.8MB per JPEG at 4320x4320
  },
  png: {
    '2k': 1200,  // ~1.2MB per PNG at 1080x1080
    '4k': 4500,  // ~4.5MB per PNG at 2160x2160
    '8k': 18000, // ~18MB per PNG at 4320x4320
  },
};

// Resolution dimensions
const RESOLUTION_LABELS = {
  '2k': '2K (1080x1080)',
  '4k': '4K (2160x2160)',
  '8k': '8K (4320x4320)',
};

// Format human-readable file size
const formatFileSize = (sizeKB: number): string => {
  if (sizeKB >= 1024 * 1024) {
    return `${(sizeKB / (1024 * 1024)).toFixed(1)} GB`;
  }
  if (sizeKB >= 1024) {
    return `${(sizeKB / 1024).toFixed(1)} MB`;
  }
  return `${Math.round(sizeKB)} KB`;
};

// Sanitize string for folder name
const sanitizeForFolderName = (str: string): string => {
  return str
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
};

const FramesCapture: React.FC<FramesCaptureProps> = ({
  artworkTitle,
  variationNumbering,
  variationUrl
}) => {
  // Source mode
  const [sourceMode, setSourceMode] = useState<SourceMode>('generative');

  // Generative mode settings
  const [iframeUrl, setIframeUrl] = useState(variationUrl || '');
  const [fps, setFps] = useState(30);
  const [totalFrames, setTotalFrames] = useState(300);
  const [resolution, setResolution] = useState<Resolution>('2k');

  // Update iframe URL when variationUrl prop changes
  useEffect(() => {
    if (variationUrl) {
      setIframeUrl(variationUrl);
      setSourceMode('generative');
    }
  }, [variationUrl]);

  // Video mode settings
  const [videoFilePath, setVideoFilePath] = useState('');
  const [videoFps, setVideoFps] = useState(30);
  const [detectedVideoFps, setDetectedVideoFps] = useState<number | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [videoResolution, setVideoResolution] = useState<string | null>(null);
  const [videoWidth, setVideoWidth] = useState<number | null>(null);
  const [videoHeight, setVideoHeight] = useState<number | null>(null);

  // Common settings
  const [imageFormat, setImageFormat] = useState<ImageFormat>('jpeg');
  const [outputFolder, setOutputFolder] = useState('');

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [totalFramesProgress, setTotalFramesProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [outputFolderPath, setOutputFolderPath] = useState<string | null>(null);

  // Set up progress listener
  useEffect(() => {
    window.electronAPI.onFrameCaptureProgress((progress) => {
      setCurrentFrame(progress.currentFrame);
      setTotalFramesProgress(progress.totalFrames);

      if (progress.status === 'capturing') {
        const percent = Math.round((progress.currentFrame / progress.totalFrames) * 100);
        setStatus(`Capturing frame ${progress.currentFrame}/${progress.totalFrames} (${percent}%)`);
      } else if (progress.status === 'completed') {
        setIsProcessing(false);
        setStatus(`Completed! ${progress.totalFrames} frames saved`);
        if (progress.outputFolder) {
          setOutputFolderPath(progress.outputFolder);
        }
      } else if (progress.status === 'cancelled') {
        setIsProcessing(false);
        setStatus('Capture cancelled');
      } else if (progress.status === 'error') {
        setIsProcessing(false);
        setStatus(`Error: ${progress.error || 'Unknown error'}`);
      }
    });

    return () => {
      window.electronAPI.removeFrameCaptureListeners();
    };
  }, []);

  // Calculate estimated size for generative mode
  const getGenerativeEstimatedSize = (): string => {
    const sizePerFrame = FRAME_SIZES[imageFormat][resolution];
    const totalSizeKB = sizePerFrame * totalFrames;
    return formatFileSize(totalSizeKB);
  };

  // Calculate estimated size for video mode
  // Base estimates are for 1080x1080, scale based on actual video pixels
  const getVideoEstimatedSize = (): string => {
    const basePixels = 1080 * 1080; // Reference size for estimates
    const baseSizeJpeg = 150; // KB at 1080x1080
    const baseSizePng = 1200; // KB at 1080x1080

    // Calculate pixel ratio if we have video dimensions
    let pixelRatio = 1;
    if (videoWidth && videoHeight) {
      const videoPixels = videoWidth * videoHeight;
      pixelRatio = videoPixels / basePixels;
    }

    const sizePerFrame = (imageFormat === 'jpeg' ? baseSizeJpeg : baseSizePng) * pixelRatio;

    if (videoDuration) {
      const estimatedFrames = Math.ceil(videoDuration * videoFps);
      const totalSizeKB = sizePerFrame * estimatedFrames;
      return `~${formatFileSize(totalSizeKB)} (${estimatedFrames} frames)`;
    }
    const estimatedFrames = videoFps * 30;
    const totalSizeKB = sizePerFrame * estimatedFrames;
    return `~${formatFileSize(totalSizeKB)} per 30s of video`;
  };

  // Calculate duration for generative mode
  const getDuration = (): string => {
    const seconds = totalFrames / fps;
    if (seconds >= 60) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.round(seconds % 60);
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds.toFixed(1)}s`;
  };

  const handleSelectVideo = async () => {
    const result = await window.electronAPI.selectVideoFiles();
    if (result.filePaths && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      setVideoFilePath(filePath);

      // Get video info
      try {
        const info = await window.electronAPI.getVideoInfo(filePath);
        setDetectedVideoFps(info.fps);
        setVideoFps(Math.min(info.fps, 30)); // Default to video fps or 30, whichever is lower
        setVideoDuration(info.duration);
        setVideoResolution(`${info.width}x${info.height}`);
        setVideoWidth(info.width);
        setVideoHeight(info.height);
      } catch (error) {
        console.error('Failed to get video info:', error);
        setDetectedVideoFps(30);
        setVideoFps(30);
        setVideoWidth(null);
        setVideoHeight(null);
      }
    }
  };

  const handleSelectOutputFolder = async () => {
    const result = await window.electronAPI.selectDestinationFolder();
    if (result.filePath) {
      setOutputFolder(result.filePath);
    }
  };

  const handleStartCapture = async () => {
    if (sourceMode === 'generative' && !iframeUrl) {
      setStatus('Please enter an iframe URL');
      return;
    }
    if (sourceMode === 'video' && !videoFilePath) {
      setStatus('Please select a video file');
      return;
    }
    if (!outputFolder) {
      setStatus('Please select an output folder');
      return;
    }

    setIsProcessing(true);
    setCurrentFrame(0);
    setStatus('Starting frame capture...');
    setOutputFolderPath(null);

    // Generate folder name
    let folderName: string;
    if (artworkTitle && variationNumbering !== undefined) {
      folderName = `${sanitizeForFolderName(artworkTitle)}_v${variationNumbering}_frames`;
    } else if (sourceMode === 'video') {
      const videoName = videoFilePath.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'video';
      folderName = `${sanitizeForFolderName(videoName)}_frames`;
    } else {
      folderName = `frames_${Date.now()}`;
    }

    try {
      if (sourceMode === 'generative') {
        await window.electronAPI.captureGenerativeFrames({
          url: iframeUrl,
          fps,
          totalFrames,
          resolution,
          imageFormat,
          outputDir: outputFolder,
          folderName,
        });
      } else {
        await window.electronAPI.captureVideoFrames({
          videoPath: videoFilePath,
          fps: videoFps,
          imageFormat,
          outputDir: outputFolder,
          folderName,
        });
      }
    } catch (error) {
      console.error('Frame capture error:', error);
      setIsProcessing(false);
      setStatus(`Error: ${error}`);
    }
  };

  const handleStopCapture = async () => {
    setStatus('Stopping...');
    await window.electronAPI.stopFrameCapture();
  };

  const canStart = (sourceMode === 'generative' ? iframeUrl : videoFilePath) && outputFolder;
  const progressPercent = totalFramesProgress > 0 ? (currentFrame / totalFramesProgress) * 100 : 0;

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
        <div className="text-sm">
          {artworkTitle ? (
            <>
              <span className="font-medium">{artworkTitle}</span>
              {variationNumbering !== undefined && (
                <span className="text-muted-foreground ml-2">
                  #{variationNumbering}
                </span>
              )}
            </>
          ) : (
            <span className="font-medium">Frames Capture</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ToggleGroup
            type="single"
            value={sourceMode}
            onValueChange={(val) => val && setSourceMode(val as SourceMode)}
            disabled={isProcessing}
          >
            <ToggleGroupItem value="generative" aria-label="Generative">
              Generative
            </ToggleGroupItem>
            <ToggleGroupItem value="video" aria-label="Video">
              Video
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-6">
        {/* Source Input */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">
            {sourceMode === 'generative' ? 'Iframe URL' : 'Video File'}
          </Label>
          {sourceMode === 'generative' ? (
            <Input
              value={iframeUrl}
              onChange={(e) => setIframeUrl(e.target.value)}
              placeholder="Paste iframe URL here..."
              disabled={isProcessing}
            />
          ) : (
            <div className="flex gap-2">
              <Input
                value={videoFilePath ? videoFilePath.split('/').pop() || videoFilePath : ''}
                readOnly
                placeholder="No file selected"
                className="flex-1"
              />
              <Button variant="outline" onClick={handleSelectVideo} disabled={isProcessing}>
                <FileVideo className="w-4 h-4 mr-2" />
                Select
              </Button>
            </div>
          )}
          {sourceMode === 'video' && detectedVideoFps && (
            <p className="text-xs text-muted-foreground">
              Video: {videoResolution || 'Unknown'} @ {detectedVideoFps} FPS
              {videoDuration && ` (${Math.round(videoDuration)}s)`}
            </p>
          )}
        </div>

        {/* Frame Rate */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Frames per Second (FPS)</Label>
            <span className="text-sm text-muted-foreground">
              {sourceMode === 'generative' ? fps : videoFps} FPS
            </span>
          </div>
          <Slider
            value={[sourceMode === 'generative' ? fps : videoFps]}
            onValueChange={([val]) => {
              if (sourceMode === 'generative') {
                setFps(val);
              } else {
                setVideoFps(val);
              }
            }}
            min={1}
            max={sourceMode === 'video' && detectedVideoFps ? Math.ceil(detectedVideoFps) : 60}
            step={1}
            disabled={isProcessing}
          />
          <p className="text-xs text-muted-foreground">
            {sourceMode === 'generative'
              ? 'Higher FPS = smoother animation but more frames'
              : `Extract frames at this rate (max: ${detectedVideoFps || 60} FPS)`}
          </p>
        </div>

        {/* Total Frames (Generative only) */}
        {sourceMode === 'generative' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Total Frames</Label>
              <span className="text-sm text-muted-foreground">
                {totalFrames} frames ({getDuration()})
              </span>
            </div>
            <Slider
              value={[totalFrames]}
              onValueChange={([val]) => setTotalFrames(val)}
              min={fps}
              max={3000}
              step={fps}
              disabled={isProcessing}
            />
            <p className="text-xs text-muted-foreground">
              Minimum is 1 second ({fps} frames at current FPS)
            </p>
          </div>
        )}

        {/* Resolution (Generative only) */}
        {sourceMode === 'generative' && (
          <div className="space-y-3">
            <Label className="text-sm font-medium">Resolution</Label>
            <Select
              value={resolution}
              onValueChange={(val: string) => setResolution(val as Resolution)}
              disabled={isProcessing}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select resolution" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2k">{RESOLUTION_LABELS['2k']}</SelectItem>
                <SelectItem value="4k">{RESOLUTION_LABELS['4k']}</SelectItem>
                <SelectItem value="8k">{RESOLUTION_LABELS['8k']}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Higher resolution = larger files, longer capture time
            </p>
          </div>
        )}

        {/* Image Format */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Image Format</Label>
          <ToggleGroup
            type="single"
            value={imageFormat}
            onValueChange={(val) => val && setImageFormat(val as ImageFormat)}
            disabled={isProcessing}
            className="justify-start"
          >
            <ToggleGroupItem value="jpeg" aria-label="JPEG">
              JPEG
            </ToggleGroupItem>
            <ToggleGroupItem value="png" aria-label="PNG">
              PNG
            </ToggleGroupItem>
          </ToggleGroup>
          <p className="text-xs text-muted-foreground">
            {imageFormat === 'jpeg'
              ? 'JPEG: Smaller files, slight quality loss, faster'
              : 'PNG: Larger files, lossless quality, slower'}
          </p>
        </div>

        {/* Output Folder */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Output Folder</Label>
          <div className="flex gap-2">
            <Input
              value={outputFolder}
              readOnly
              placeholder="Choose output folder..."
              className="flex-1"
            />
            <Button variant="outline" onClick={handleSelectOutputFolder} disabled={isProcessing}>
              <FolderOpen className="w-4 h-4 mr-2" />
              Browse
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            A subfolder will be created with the captured frames
          </p>
        </div>

        {/* Estimated Size */}
        <div className="p-4 rounded-md bg-muted/30 border border-border">
          <h4 className="text-sm font-medium mb-2">Estimated Output</h4>
          <div className="text-sm text-muted-foreground space-y-1">
            {sourceMode === 'generative' ? (
              <>
                <p>Frames: {totalFrames}</p>
                <p>Duration: {getDuration()}</p>
                <p>Total size: ~{getGenerativeEstimatedSize()}</p>
              </>
            ) : (
              <>
                <p>Extracting at {videoFps} FPS</p>
                <p>Size estimate: {getVideoEstimatedSize()}</p>
              </>
            )}
          </div>
        </div>

        {/* Progress */}
        {isProcessing && (
          <div className="space-y-2">
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="text-sm text-muted-foreground">{status}</p>
          </div>
        )}

        {/* Status (when not processing) */}
        {!isProcessing && status && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{status}</p>
            {outputFolderPath && (
              <p className="text-xs text-muted-foreground truncate">
                Output: {outputFolderPath}
              </p>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          {isProcessing ? (
            <Button variant="destructive" onClick={handleStopCapture} className="flex-1">
              <Square className="w-4 h-4 mr-2 fill-current" />
              Stop
            </Button>
          ) : (
            <Button onClick={handleStartCapture} disabled={!canStart} className="flex-1">
              <Play className="w-4 h-4 mr-2" />
              Start Capture
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default FramesCapture;
