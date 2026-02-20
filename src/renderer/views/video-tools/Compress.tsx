import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { FileVideo, Square } from 'lucide-react';

type Scale = 'original' | '1080p' | '720p' | '480p';
type Preset = 'slow' | 'medium' | 'fast' | 'veryfast';

interface VideoMetadata {
  width: number;
  height: number;
  duration: number;
  size: number;
  bitrate: number;
  codec: string;
}

interface CompressProgress {
  progress: number;
  currentSize: number;
  estimatedSize: number;
  status: 'compressing' | 'completed' | 'error' | 'cancelled';
  outputPath?: string;
  error?: string;
}

const scaleOptions: { value: Scale; label: string }[] = [
  { value: 'original', label: 'Original' },
  { value: '1080p', label: '1080p' },
  { value: '720p', label: '720p' },
  { value: '480p', label: '480p' },
];

const presetOptions: { value: Preset; label: string; description: string }[] = [
  { value: 'veryfast', label: 'Very Fast', description: 'Fastest, larger file' },
  { value: 'fast', label: 'Fast', description: 'Quick encoding' },
  { value: 'medium', label: 'Medium', description: 'Balanced' },
  { value: 'slow', label: 'Slow', description: 'Better compression' },
];

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const Compress: React.FC = () => {
  const [videoFilePath, setVideoFilePath] = useState<string>('');
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [scale, setScale] = useState<Scale>('original');
  const [crf, setCrf] = useState<number>(23); // Default CRF (18-28 is typical range)
  const [preset, setPreset] = useState<Preset>('medium');
  const [audioBitrate, setAudioBitrate] = useState<number>(128);
  const [removeAudio, setRemoveAudio] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<CompressProgress | null>(null);

  useEffect(() => {
    window.electronAPI.onCompressProgress((update: CompressProgress) => {
      setProgress(update);
      if (update.status === 'completed' || update.status === 'error' || update.status === 'cancelled') {
        setIsProcessing(false);
      }
    });

    return () => {
      window.electronAPI.removeCompressListeners();
    };
  }, []);

  const handleSelectVideo = async () => {
    const result = await window.electronAPI.selectVideoFiles();
    if (result.filePaths && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      setVideoFilePath(filePath);
      setProgress(null);

      try {
        const meta = await window.electronAPI.getVideoMetadata(filePath);
        setMetadata(meta);

        // Auto-select scale based on video resolution
        if (meta.height > 1080) {
          setScale('1080p');
        } else {
          setScale('original');
        }
      } catch (error) {
        console.error('Failed to get video metadata:', error);
        setMetadata(null);
      }
    }
  };

  const handleCompress = async () => {
    if (!videoFilePath) return;

    setIsProcessing(true);
    setProgress(null);

    try {
      await window.electronAPI.compressVideo({
        inputPath: videoFilePath,
        scale,
        crf,
        preset,
        audioBitrate,
        removeAudio,
      });
    } catch (error) {
      console.error('Compression failed:', error);
      setIsProcessing(false);
    }
  };

  const handleCancel = async () => {
    await window.electronAPI.cancelCompression();
    setIsProcessing(false);
    setProgress(null);
  };

  const canCompress = videoFilePath && !isProcessing;

  // Estimate compression ratio based on CRF
  const getEstimatedReduction = (): string => {
    // Very rough estimates based on CRF values
    if (crf <= 18) return '~10-20% smaller';
    if (crf <= 23) return '~30-50% smaller';
    if (crf <= 28) return '~50-70% smaller';
    return '~70-80% smaller';
  };

  return (
    <div className="h-full flex flex-col max-w-2xl">
      <h2 className="text-xl font-semibold mb-6">Compress Video</h2>

      {/* Video File Selection */}
      <div className="space-y-2 mb-6">
        <Label>Video File</Label>
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
        {metadata && (
          <div className="text-xs text-muted-foreground space-y-1 mt-2 p-3 bg-muted/50 rounded-md">
            <p><span className="font-medium">Resolution:</span> {metadata.width}x{metadata.height}</p>
            <p><span className="font-medium">Duration:</span> {formatDuration(metadata.duration)}</p>
            <p><span className="font-medium">Size:</span> {formatFileSize(metadata.size)}</p>
            <p><span className="font-medium">Bitrate:</span> {metadata.bitrate} kbps</p>
            <p><span className="font-medium">Codec:</span> {metadata.codec}</p>
          </div>
        )}
      </div>

      {/* Scale Selection */}
      <div className="space-y-2 mb-6">
        <Label>Output Resolution</Label>
        <Select
          value={scale}
          onValueChange={(value) => setScale(value as Scale)}
          disabled={isProcessing}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {scaleOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
                {metadata && option.value === 'original' && ` (${metadata.height}p)`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Quality (CRF) Slider */}
      <div className="space-y-3 mb-6">
        <div className="flex justify-between items-center">
          <Label>Quality (CRF)</Label>
          <span className="text-sm font-medium">{crf}</span>
        </div>
        <Slider
          value={[crf]}
          onValueChange={(value) => setCrf(value[0])}
          min={18}
          max={32}
          step={1}
          disabled={isProcessing}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Higher Quality</span>
          <span>Smaller File</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Estimated: {getEstimatedReduction()}
        </p>
      </div>

      {/* Encoding Preset */}
      <div className="space-y-2 mb-6">
        <Label>Encoding Speed</Label>
        <Select
          value={preset}
          onValueChange={(value) => setPreset(value as Preset)}
          disabled={isProcessing}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {presetOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {presetOptions.find(p => p.value === preset)?.description}
        </p>
      </div>

      {/* Audio Options */}
      <div className="space-y-3 mb-6">
        <Label>Audio</Label>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="remove-audio"
            checked={removeAudio}
            onCheckedChange={(checked) => setRemoveAudio(checked === true)}
            disabled={isProcessing}
          />
          <label
            htmlFor="remove-audio"
            className="text-sm cursor-pointer"
          >
            Remove audio (export video only)
          </label>
        </div>
        {!removeAudio && (
          <div className="mt-3">
            <Label className="text-xs text-muted-foreground">Audio Bitrate</Label>
            <Select
              value={audioBitrate.toString()}
              onValueChange={(value) => setAudioBitrate(parseInt(value))}
              disabled={isProcessing}
            >
              <SelectTrigger className="w-48 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="96">96 kbps</SelectItem>
                <SelectItem value="128">128 kbps</SelectItem>
                <SelectItem value="192">192 kbps</SelectItem>
                <SelectItem value="256">256 kbps</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Compress Button */}
      <div className="flex gap-2 mb-6">
        {isProcessing ? (
          <Button variant="destructive" onClick={handleCancel}>
            <Square className="w-4 h-4 mr-2" />
            Stop
          </Button>
        ) : (
          <Button onClick={handleCompress} disabled={!canCompress}>
            Compress
          </Button>
        )}
      </div>

      {/* Progress */}
      {progress && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>
              {progress.status === 'compressing' && 'Compressing...'}
              {progress.status === 'completed' && 'Completed'}
              {progress.status === 'error' && 'Error'}
              {progress.status === 'cancelled' && 'Cancelled'}
            </span>
            <span>{progress.progress}%</span>
          </div>
          <Progress value={progress.progress} />
          {progress.status === 'compressing' && progress.estimatedSize > 0 && (
            <p className="text-xs text-muted-foreground">
              Current: {formatFileSize(progress.currentSize)} / Estimated: {formatFileSize(progress.estimatedSize)}
            </p>
          )}
          {progress.status === 'completed' && progress.outputPath && (
            <div className="text-sm text-green-600 space-y-1">
              <p>Compression complete!</p>
              <p className="text-xs">
                Final size: {formatFileSize(progress.currentSize)}
                {metadata && ` (${Math.round((1 - progress.currentSize / metadata.size) * 100)}% reduction)`}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                Saved to: {progress.outputPath}
              </p>
            </div>
          )}
          {progress.status === 'error' && progress.error && (
            <p className="text-sm text-destructive">{progress.error}</p>
          )}
        </div>
      )}
    </div>
  );
};

export default Compress;
