import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Throbber } from '@/components/ui/throbber';
import { FolderOpen, FileVideo, Check, AlertCircle, X, Square } from 'lucide-react';

type Codec = 'h264' | 'hevc' | 'vp9';
type Format = 'card' | 'featured' | 'page';

interface CodecStatus {
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
}

interface FormatStatus {
  thumbnail: CodecStatus;
  h264: CodecStatus;
  hevc: CodecStatus;
  vp9: CodecStatus;
}

interface FileJob {
  id: string;
  filePath: string;
  filename: string;
  thumbnailDataUrl?: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
  formats: {
    card: FormatStatus;
    featured: FormatStatus;
    page: FormatStatus;
  };
}

const initialCodecStatus = (): CodecStatus => ({
  status: 'pending',
  progress: 0,
});

const initialFormatStatus = (): FormatStatus => ({
  thumbnail: initialCodecStatus(),
  h264: initialCodecStatus(),
  hevc: initialCodecStatus(),
  vp9: initialCodecStatus(),
});

const initialFormats = () => ({
  card: initialFormatStatus(),
  featured: initialFormatStatus(),
  page: initialFormatStatus(),
});

const WebAssets: React.FC = () => {
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [destinationFolder, setDestinationFolder] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [jobs, setJobs] = useState<FileJob[]>([]);
  const jobsRef = useRef<FileJob[]>([]);

  const handleSelectFiles = async () => {
    const result = await window.electronAPI.selectVideoFiles();
    if (result.filePaths && result.filePaths.length > 0) {
      setSelectedFiles(result.filePaths);
    }
  };

  const handleSelectDestination = async () => {
    const result = await window.electronAPI.selectDestinationFolder();
    if (result.filePath) {
      setDestinationFolder(result.filePath);
    }
  };

  const handleClearFiles = () => {
    setSelectedFiles([]);
    setJobs([]);
  };

  const handleStop = async () => {
    await window.electronAPI.cancelWebAssets();
    setIsProcessing(false);
  };

  const handleConvert = async () => {
    if (selectedFiles.length === 0 || !destinationFolder) return;

    setIsProcessing(true);

    // Initialize jobs
    const initialJobs: FileJob[] = selectedFiles.map((filePath, index) => ({
      id: `job-${index}`,
      filePath,
      filename: filePath.split('/').pop() || filePath,
      status: 'pending',
      formats: initialFormats(),
    }));

    // Set both state and ref immediately
    jobsRef.current = initialJobs;
    setJobs(initialJobs);

    // Set up progress listener using ref for immediate access
    window.electronAPI.onWebAssetsProgress((update) => {
      const updatedJobs = jobsRef.current.map(job => {
        if (job.filePath !== update.filePath) return job;

        const newJob = { ...job };

        // Update thumbnail data URL if provided
        if (update.thumbnailDataUrl) {
          newJob.thumbnailDataUrl = update.thumbnailDataUrl;
        }

        // Update job status and error
        if (update.jobStatus) {
          newJob.status = update.jobStatus;
        }
        if (update.error) {
          newJob.error = update.error;
        }

        // Update format/codec status
        if (update.format && update.codec) {
          const format = update.format as Format;
          const codec = update.codec as 'thumbnail' | Codec;

          newJob.formats = {
            ...newJob.formats,
            [format]: {
              ...newJob.formats[format],
              [codec]: {
                status: update.status,
                progress: update.progress,
              },
            },
          };
        }

        return newJob;
      });

      jobsRef.current = updatedJobs;
      setJobs(updatedJobs);
    });

    try {
      await window.electronAPI.processWebAssets(selectedFiles, destinationFolder);
    } catch (error) {
      console.error('Processing error:', error);
    } finally {
      setIsProcessing(false);
      window.electronAPI.removeWebAssetsListeners();
    }
  };

  const getOverallProgress = (job: FileJob): number => {
    const formats: Format[] = ['card', 'featured', 'page'];
    const codecs: (keyof FormatStatus)[] = ['thumbnail', 'h264', 'hevc', 'vp9'];
    let completed = 0;
    const total = formats.length * codecs.length;

    for (const format of formats) {
      for (const codec of codecs) {
        if (job.formats[format][codec].status === 'completed') {
          completed++;
        }
      }
    }

    return Math.round((completed / total) * 100);
  };

  const renderCodecStatus = (codecStatus: CodecStatus, label: string) => {
    return (
      <div className="flex items-center gap-1.5" title={label}>
        <span className="text-xs text-muted-foreground w-10">{label}</span>
        {codecStatus.status === 'pending' && (
          <div className="w-4 h-4 rounded-full border border-muted-foreground/30" />
        )}
        {codecStatus.status === 'processing' && (
          <Throbber size="sm" />
        )}
        {codecStatus.status === 'completed' && (
          <Check className="w-4 h-4 text-green-500" />
        )}
        {codecStatus.status === 'error' && (
          <AlertCircle className="w-4 h-4 text-red-500" />
        )}
      </div>
    );
  };

  const renderFormatProgress = (formatStatus: FormatStatus, formatName: string) => {
    return (
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground uppercase">{formatName}</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {renderCodecStatus(formatStatus.thumbnail, 'thumb')}
          {renderCodecStatus(formatStatus.h264, 'h264')}
          {renderCodecStatus(formatStatus.hevc, 'hevc')}
          {renderCodecStatus(formatStatus.vp9, 'vp9')}
        </div>
      </div>
    );
  };

  // Show processing view when jobs exist
  if (jobs.length > 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Processing {jobs.length} file{jobs.length !== 1 ? 's' : ''}</h3>
          <div className="flex gap-2">
            {isProcessing && (
              <Button variant="destructive" size="sm" onClick={handleStop}>
                <Square className="w-3 h-3 mr-2 fill-current" />
                Stop
              </Button>
            )}
            {!isProcessing && (
              <Button variant="outline" size="sm" onClick={handleClearFiles}>
                Clear & Start Over
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="flex gap-4 p-4 rounded-lg border border-border bg-card"
            >
              {/* Thumbnail */}
              <div className="w-20 h-20 bg-muted rounded-md overflow-hidden flex-shrink-0">
                {job.thumbnailDataUrl ? (
                  <img
                    src={job.thumbnailDataUrl}
                    alt={job.filename}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <FileVideo className="w-8 h-8 text-muted-foreground" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium text-sm truncate">{job.filename}</p>
                  {job.status === 'completed' && (
                    <span className="text-xs bg-green-500/20 text-green-600 px-2 py-0.5 rounded">
                      Completed
                    </span>
                  )}
                  {job.status === 'processing' && (
                    <span className="text-xs text-muted-foreground">
                      {getOverallProgress(job)}%
                    </span>
                  )}
                  {job.status === 'error' && (
                    <span className="text-xs bg-red-500/20 text-red-600 px-2 py-0.5 rounded">
                      Error
                    </span>
                  )}
                </div>

                {/* Error message */}
                {job.error && (
                  <div className="mb-2 p-2 rounded bg-red-500/10 border border-red-500/20">
                    <p className="text-xs text-red-600">{job.error}</p>
                  </div>
                )}

                {/* Format progress */}
                {!job.error && (
                  <div className="grid grid-cols-3 gap-4">
                    {renderFormatProgress(job.formats.card, 'Card')}
                    {renderFormatProgress(job.formats.featured, 'Featured')}
                    {renderFormatProgress(job.formats.page, 'Page')}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* File Selection */}
      <div className="space-y-2">
        <Button variant="outline" onClick={handleSelectFiles}>
          <FileVideo className="w-4 h-4 mr-2" />
          Select Video Files
        </Button>
        {selectedFiles.length > 0 && (
          <div className="mt-2 p-3 rounded-md bg-muted/50">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">
                {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2"
                onClick={handleClearFiles}
              >
                <X className="w-3 h-3 mr-1" />
                Clear
              </Button>
            </div>
            <ul className="text-xs text-muted-foreground space-y-1 max-h-32 overflow-y-auto">
              {selectedFiles.map((file, index) => (
                <li key={index} className="truncate">
                  {file.split('/').pop()}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Destination */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Destination Folder</label>
        <div className="flex gap-2">
          <Input
            value={destinationFolder}
            readOnly
            placeholder="Choose output folder..."
            className="flex-1"
          />
          <Button variant="outline" onClick={handleSelectDestination}>
            <FolderOpen className="w-4 h-4 mr-2" />
            Browse
          </Button>
        </div>
      </div>

      {/* Output Info */}
      <div className="p-4 rounded-md bg-muted/30 border border-border">
        <h4 className="text-sm font-medium mb-2">Output Formats</h4>
        <ul className="text-xs text-muted-foreground space-y-1">
          <li><strong>Card:</strong> 640×640px, 5 seconds (h264, hevc, vp9 + thumbnail)</li>
          <li><strong>Featured:</strong> 1500×1500px, original duration (h264, hevc, vp9 + thumbnail)</li>
          <li><strong>Page:</strong> 1000×1000px, original duration (h264, hevc, vp9 + thumbnail)</li>
        </ul>
      </div>

      {/* Convert Button */}
      <Button
        onClick={handleConvert}
        disabled={selectedFiles.length === 0 || !destinationFolder || isProcessing}
        className="w-full"
      >
        {isProcessing ? (
          <>
            <Throbber size="sm" className="mr-2" />
            Processing...
          </>
        ) : (
          `Convert ${selectedFiles.length} File${selectedFiles.length !== 1 ? 's' : ''}`
        )}
      </Button>
    </div>
  );
};

export default WebAssets;
