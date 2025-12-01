import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { FileVideo, Film } from 'lucide-react';

type TargetSize = '10mb' | '5mb' | '2mb' | '1mb';
type Scale = 'original' | '720p' | '480p' | '360p' | '240p';
type FPS = 10 | 15 | 20 | 25 | 30;

interface GifProgress {
  currentExport: number;
  totalExports: number;
  scale: string;
  targetSize: string;
  progress: number;
  status: 'generating' | 'completed' | 'error';
  error?: string;
}

// Map slider value (MB) to target size category for backend
function getTargetSizeCategory(mb: number): TargetSize {
  if (mb <= 1) return '1mb';
  if (mb <= 2) return '2mb';
  if (mb <= 5) return '5mb';
  return '10mb';
}

const scaleOptions: { value: Scale; label: string }[] = [
  { value: 'original', label: 'Original' },
  { value: '720p', label: '720p' },
  { value: '480p', label: '480p' },
  { value: '360p', label: '360p' },
  { value: '240p', label: '240p' },
];

const fpsOptions: FPS[] = [10, 15, 20, 25, 30];

const MakeGif: React.FC = () => {
  const [videoFilePath, setVideoFilePath] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('0');
  const [endTime, setEndTime] = useState<string>('');
  const [targetSizeMB, setTargetSizeMB] = useState<number>(5);
  const [selectedScales, setSelectedScales] = useState<Scale[]>(['480p']);
  const [fps, setFps] = useState<FPS>(15);
  const [dithering, setDithering] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<GifProgress | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);

  useEffect(() => {
    // Listen for progress updates
    window.electronAPI.onGifProgress((update: GifProgress) => {
      setProgress(update);
      if (update.status === 'completed' && update.currentExport === update.totalExports) {
        setIsProcessing(false);
      } else if (update.status === 'error') {
        setIsProcessing(false);
      }
    });

    return () => {
      window.electronAPI.removeGifListeners();
    };
  }, []);

  const handleSelectVideo = async () => {
    const result = await window.electronAPI.selectVideoFiles();
    if (result.filePaths && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      setVideoFilePath(filePath);

      // Get video duration
      try {
        const duration = await window.electronAPI.getVideoDuration(filePath);
        setVideoDuration(duration);
        setEndTime(duration.toFixed(1));
      } catch (error) {
        console.error('Failed to get video duration:', error);
      }
    }
  };

  const handleScaleToggle = (scale: Scale) => {
    setSelectedScales(prev =>
      prev.includes(scale)
        ? prev.filter(s => s !== scale)
        : [...prev, scale]
    );
  };

  const handleGenerate = async () => {
    if (!videoFilePath || selectedScales.length === 0) {
      return;
    }

    setIsProcessing(true);
    setProgress(null);

    // Convert slider value to target size category
    const targetSize = getTargetSizeCategory(targetSizeMB);

    try {
      await window.electronAPI.generateGif({
        inputPath: videoFilePath,
        startTime: parseFloat(startTime) || 0,
        endTime: parseFloat(endTime) || videoDuration || 0,
        targetSizes: [targetSize],
        scales: selectedScales,
        fps,
        dithering,
      });
    } catch (error) {
      console.error('GIF generation failed:', error);
      setIsProcessing(false);
    }
  };

  const handleCancel = async () => {
    await window.electronAPI.cancelGif();
    setIsProcessing(false);
    setProgress(null);
  };

  const totalExports = selectedScales.length;
  const canGenerate = videoFilePath && selectedScales.length > 0;

  return (
    <div className="h-full flex flex-col p-6 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-6">Make GIF</h1>

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
        {videoDuration !== null && (
          <p className="text-xs text-muted-foreground">
            Duration: {videoDuration.toFixed(1)} seconds
          </p>
        )}
      </div>

      {/* Trim Controls */}
      <div className="space-y-2 mb-6">
        <Label>Trim (optional)</Label>
        <div className="flex gap-4 items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Start:</span>
            <Input
              type="number"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-24"
              min="0"
              step="0.1"
              disabled={isProcessing}
            />
            <span className="text-sm text-muted-foreground">sec</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">End:</span>
            <Input
              type="number"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-24"
              min="0"
              step="0.1"
              disabled={isProcessing}
            />
            <span className="text-sm text-muted-foreground">sec</span>
          </div>
        </div>
      </div>

      {/* Target Size Slider */}
      <div className="space-y-3 mb-6">
        <div className="flex justify-between items-center">
          <Label>Target Size</Label>
          <span className="text-sm font-medium">&lt; {targetSizeMB} MB</span>
        </div>
        <Slider
          value={[targetSizeMB]}
          onValueChange={(value) => setTargetSizeMB(value[0])}
          min={1}
          max={15}
          step={1}
          disabled={isProcessing}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>1 MB</span>
          <span>15 MB</span>
        </div>
      </div>

      {/* Scale Options */}
      <div className="space-y-2 mb-6">
        <Label>Scale (select multiple)</Label>
        <div className="flex flex-wrap gap-4">
          {scaleOptions.map((option) => (
            <div key={option.value} className="flex items-center space-x-2">
              <Checkbox
                id={`scale-${option.value}`}
                checked={selectedScales.includes(option.value)}
                onCheckedChange={() => handleScaleToggle(option.value)}
                disabled={isProcessing}
              />
              <label
                htmlFor={`scale-${option.value}`}
                className="text-sm cursor-pointer"
              >
                {option.label}
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* FPS and Dithering */}
      <div className="flex gap-8 mb-6">
        <div className="space-y-2">
          <Label>FPS</Label>
          <Select
            value={fps.toString()}
            onValueChange={(value) => setFps(parseInt(value) as FPS)}
            disabled={isProcessing}
          >
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fpsOptions.map((option) => (
                <SelectItem key={option} value={option.toString()}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Dithering</Label>
          <div className="flex gap-4 pt-2">
            <div className="flex items-center space-x-2">
              <input
                type="radio"
                id="dither-none"
                name="dithering"
                checked={!dithering}
                onChange={() => setDithering(false)}
                disabled={isProcessing}
                className="w-4 h-4"
              />
              <label htmlFor="dither-none" className="text-sm cursor-pointer">
                None
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="radio"
                id="dither-on"
                name="dithering"
                checked={dithering}
                onChange={() => setDithering(true)}
                disabled={isProcessing}
                className="w-4 h-4"
              />
              <label htmlFor="dither-on" className="text-sm cursor-pointer">
                Dithering
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Export Summary */}
      {canGenerate && (
        <p className="text-sm text-muted-foreground mb-4">
          Will generate {totalExports} GIF{totalExports !== 1 ? 's' : ''} ({selectedScales.length} scale{selectedScales.length !== 1 ? 's' : ''}, target &lt; {targetSizeMB} MB)
        </p>
      )}

      {/* Generate Button */}
      <div className="flex gap-2">
        {isProcessing ? (
          <Button variant="destructive" onClick={handleCancel}>
            Cancel
          </Button>
        ) : (
          <Button onClick={handleGenerate} disabled={!canGenerate}>
            <Film className="w-4 h-4 mr-2" />
            Generate GIF{totalExports > 1 ? 's' : ''}
          </Button>
        )}
      </div>

      {/* Progress */}
      {progress && (
        <div className="mt-6 space-y-2">
          <div className="flex justify-between text-sm">
            <span>
              Generating {progress.scale} {progress.targetSize}...
            </span>
            <span>
              {progress.currentExport} / {progress.totalExports}
            </span>
          </div>
          <Progress value={progress.progress} />
          {progress.status === 'error' && progress.error && (
            <p className="text-sm text-destructive">{progress.error}</p>
          )}
          {progress.status === 'completed' && progress.currentExport === progress.totalExports && (
            <p className="text-sm text-green-600">All GIFs generated successfully!</p>
          )}
        </div>
      )}
    </div>
  );
};

export default MakeGif;
