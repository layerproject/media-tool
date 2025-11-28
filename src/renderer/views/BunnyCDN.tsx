import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Settings, Save, Loader2, Upload, Download, FolderOpen, X } from 'lucide-react';

interface BunnyConfig {
  storageApiKey: string;
  storageZoneName: string;
  apiKey: string;
  pullZoneId: string;
  defaultRemotePath: string;
}

interface BunnyUploadProgress {
  totalFiles: number;
  uploadedFiles: number;
  currentFile: string;
  status: 'uploading' | 'completed' | 'error';
  error?: string;
}

interface BunnyDownloadProgress {
  totalFiles: number;
  downloadedFiles: number;
  currentFile: string;
  totalBytes: number;
  downloadedBytes: number;
  status: 'listing' | 'downloading' | 'completed' | 'error';
  error?: string;
}

// Format bytes to human readable string
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

type ViewMode = 'loading' | 'config' | 'main';

const BunnyCDN: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('loading');
  const [config, setConfig] = useState<BunnyConfig>({
    storageApiKey: '',
    storageZoneName: '',
    apiKey: '',
    pullZoneId: '',
    defaultRemotePath: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Upload state - declare before any conditionals
  const [uploadFolders, setUploadFolders] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<BunnyUploadProgress | null>(null);

  // Download state - declare before any conditionals
  const [downloadFolder, setDownloadFolder] = useState<string>('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<BunnyDownloadProgress | null>(null);

  // Download confirmation dialog state
  const [showDownloadConfirm, setShowDownloadConfirm] = useState(false);
  const [scanInfo, setScanInfo] = useState<{ totalFiles: number; totalBytes: number } | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  // Check if config exists on mount
  useEffect(() => {
    const checkConfig = async () => {
      try {
        const existingConfig = await window.electronAPI.getBunnyConfig();
        if (existingConfig) {
          setConfig(existingConfig);
          setViewMode('main');
        } else {
          setViewMode('config');
        }
      } catch (err) {
        console.error('Failed to check Bunny config:', err);
        setViewMode('config');
      }
    };
    checkConfig();
  }, []);

  // Set up progress listeners
  useEffect(() => {
    window.electronAPI.onBunnyUploadProgress((progress) => {
      setUploadProgress(progress);
      if (progress.status === 'uploading') {
        setUploadStatus(`Uploading ${progress.uploadedFiles}/${progress.totalFiles}: ${progress.currentFile.split('/').pop()}`);
      } else if (progress.status === 'completed') {
        setUploadStatus(`Uploaded ${progress.totalFiles} files successfully`);
        setIsUploading(false);
        setUploadFolders([]);
        setUploadProgress(null);
      } else if (progress.status === 'error') {
        setUploadStatus(`Error: ${progress.error}`);
        setIsUploading(false);
        setUploadProgress(null);
      }
    });

    window.electronAPI.onBunnyDownloadProgress((progress) => {
      setDownloadProgress(progress);
      if (progress.status === 'listing') {
        setDownloadStatus('Scanning files...');
      } else if (progress.status === 'downloading') {
        const sizeInfo = progress.totalBytes > 0
          ? ` (${formatBytes(progress.downloadedBytes)} / ${formatBytes(progress.totalBytes)})`
          : '';
        setDownloadStatus(`Downloading ${progress.downloadedFiles}/${progress.totalFiles}${sizeInfo}: ${progress.currentFile}`);
      } else if (progress.status === 'completed') {
        const sizeInfo = progress.totalBytes > 0 ? ` (${formatBytes(progress.totalBytes)})` : '';
        setDownloadStatus(`Downloaded ${progress.totalFiles} files${sizeInfo} successfully`);
        setIsDownloading(false);
        setDownloadProgress(null);
      } else if (progress.status === 'error') {
        setDownloadStatus(`Error: ${progress.error}`);
        setIsDownloading(false);
        setDownloadProgress(null);
      }
    });

    return () => {
      window.electronAPI.removeBunnyListeners();
    };
  }, []);

  const handleInputChange = (field: keyof BunnyConfig, value: string) => {
    setConfig(prev => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleSaveConfig = async () => {
    // Validate all fields are filled
    if (!config.storageApiKey || !config.storageZoneName || !config.apiKey || !config.pullZoneId || !config.defaultRemotePath) {
      setError('All fields are required');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await window.electronAPI.setBunnyConfig(config);
      setViewMode('main');
    } catch (err) {
      console.error('Failed to save Bunny config:', err);
      setError('Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditConfig = () => {
    setViewMode('config');
  };

  const handleSelectUploadFolders = async () => {
    const result = await window.electronAPI.selectMultipleFolders();
    if (result.filePaths.length > 0) {
      setUploadFolders(prev => {
        const newFolders = result.filePaths.filter(fp => !prev.includes(fp));
        return [...prev, ...newFolders];
      });
    }
  };

  const handleRemoveUploadFolder = (folderPath: string) => {
    setUploadFolders(prev => prev.filter(f => f !== folderPath));
  };

  const handleSelectDownloadFolder = async () => {
    const result = await window.electronAPI.selectDestinationFolder();
    if (result.filePath) {
      setDownloadFolder(result.filePath);
    }
  };

  const handleUpload = async () => {
    if (uploadFolders.length === 0) {
      setUploadStatus('Please select folders to upload');
      return;
    }
    setIsUploading(true);
    setUploadStatus('Starting upload...');
    setUploadProgress(null);

    try {
      await window.electronAPI.uploadFoldersToBunny(uploadFolders);
    } catch (err) {
      console.error('Upload error:', err);
      setUploadStatus(`Upload failed: ${err}`);
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  const handleDownloadClick = async () => {
    if (!downloadFolder) {
      setDownloadStatus('Please select a destination folder');
      return;
    }

    // Scan storage to get file count and size
    setIsScanning(true);
    setDownloadStatus('Scanning files...');

    try {
      const info = await window.electronAPI.scanBunnyContent();
      setScanInfo(info);
      setIsScanning(false);
      setDownloadStatus(null);
      setShowDownloadConfirm(true);
    } catch (err) {
      console.error('Scan error:', err);
      setDownloadStatus(`Failed to scan files: ${err}`);
      setIsScanning(false);
    }
  };

  const handleDownloadConfirm = async () => {
    setShowDownloadConfirm(false);
    setIsDownloading(true);
    setDownloadStatus('Starting download...');
    setDownloadProgress(null);

    try {
      await window.electronAPI.downloadFromBunny(downloadFolder);
    } catch (err) {
      console.error('Download error:', err);
      setDownloadStatus(`Download failed: ${err}`);
      setIsDownloading(false);
      setDownloadProgress(null);
    }
  };

  // Loading state
  if (viewMode === 'loading') {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Config form view
  if (viewMode === 'config') {
    return (
      <div className="h-full flex flex-col max-w-md">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
          <span className="font-medium">Bunny CDN Configuration</span>
        </div>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Enter your Bunny CDN credentials to enable file uploads and cache management.
          </p>

          <div className="space-y-2">
            <Label htmlFor="storageApiKey">Storage API Key</Label>
            <Input
              id="storageApiKey"
              type="password"
              value={config.storageApiKey}
              onChange={(e) => handleInputChange('storageApiKey', e.target.value)}
              placeholder="Your storage zone API key"
              disabled={isSaving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="storageZoneName">Storage Zone Name</Label>
            <Input
              id="storageZoneName"
              type="text"
              value={config.storageZoneName}
              onChange={(e) => handleInputChange('storageZoneName', e.target.value)}
              placeholder="e.g. layer-artworks"
              disabled={isSaving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key</Label>
            <Input
              id="apiKey"
              type="password"
              value={config.apiKey}
              onChange={(e) => handleInputChange('apiKey', e.target.value)}
              placeholder="Your Bunny.net API key"
              disabled={isSaving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pullZoneId">Pull Zone ID</Label>
            <Input
              id="pullZoneId"
              type="text"
              value={config.pullZoneId}
              onChange={(e) => handleInputChange('pullZoneId', e.target.value)}
              placeholder="e.g. 969140"
              disabled={isSaving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="defaultRemotePath">Default Remote Path</Label>
            <Input
              id="defaultRemotePath"
              type="text"
              value={config.defaultRemotePath}
              onChange={(e) => handleInputChange('defaultRemotePath', e.target.value)}
              placeholder="e.g. artworks-website"
              disabled={isSaving}
            />
            <p className="text-xs text-muted-foreground">
              The base path in your storage zone where files will be uploaded
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button
            onClick={handleSaveConfig}
            disabled={isSaving}
            className="w-full"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Configuration
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // Calculate progress percentages
  const uploadPercent = uploadProgress && uploadProgress.totalFiles > 0
    ? (uploadProgress.uploadedFiles / uploadProgress.totalFiles) * 100
    : 0;
  // Use bytes for download progress (more accurate)
  const downloadPercent = downloadProgress && downloadProgress.totalBytes > 0
    ? (downloadProgress.downloadedBytes / downloadProgress.totalBytes) * 100
    : downloadProgress && downloadProgress.totalFiles > 0
    ? (downloadProgress.downloadedFiles / downloadProgress.totalFiles) * 100
    : 0;

  // Main view (after config is saved)
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
        <span className="font-medium">Bunny CDN</span>
        <Button variant="outline" size="sm" onClick={handleEditConfig}>
          <Settings className="w-4 h-4 mr-2" />
          Settings
        </Button>
      </div>

      <div className="flex-1 space-y-6">
        {/* Bunny Settings Info */}
        <div className="p-4 rounded-md bg-muted/30 border border-border">
          <p className="text-sm font-medium">Bunny Settings</p>
          <p className="text-xs text-muted-foreground mt-1">
            Storage: {config.storageZoneName} &bull; Path: /{config.defaultRemotePath}/
          </p>
        </div>

        <Separator />

        {/* Upload Section */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Upload Folders to Bunny</Label>
          <p className="text-xs text-muted-foreground">
            Select folders to upload to /{config.defaultRemotePath}/
          </p>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleSelectUploadFolders}
              disabled={isUploading}
              className="flex-shrink-0"
            >
              <FolderOpen className="w-4 h-4 mr-2" />
              Add Folders
            </Button>
          </div>

          {uploadFolders.length > 0 && (
            <div className="space-y-2">
              {uploadFolders.map((folder) => (
                <div
                  key={folder}
                  className="flex items-center justify-between p-2 rounded-md bg-muted/50 text-sm"
                >
                  <span className="truncate flex-1 mr-2">{folder.split('/').pop()}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveUploadFolder(folder)}
                    disabled={isUploading}
                    className="h-6 w-6 p-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Button
            onClick={handleUpload}
            disabled={isUploading || uploadFolders.length === 0}
            className="w-full"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Upload {uploadFolders.length > 0 ? `${uploadFolders.length} Folder${uploadFolders.length > 1 ? 's' : ''}` : 'Folders'}
              </>
            )}
          </Button>

          {isUploading && uploadProgress && (
            <Progress value={uploadPercent} className="h-2" />
          )}

          {uploadStatus && (
            <p className="text-xs text-muted-foreground">{uploadStatus}</p>
          )}
        </div>

        <Separator />

        {/* Download Section */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Download from Bunny</Label>
          <p className="text-xs text-muted-foreground">
            Download all content from /{config.defaultRemotePath}/ to your computer
          </p>

          <div className="flex gap-2">
            <Input
              value={downloadFolder ? downloadFolder.split('/').pop() || downloadFolder : ''}
              readOnly
              placeholder="Select destination folder"
              className="flex-1"
            />
            <Button
              variant="outline"
              onClick={handleSelectDownloadFolder}
              disabled={isDownloading}
            >
              <FolderOpen className="w-4 h-4 mr-2" />
              Browse
            </Button>
          </div>

          <Button
            onClick={handleDownloadClick}
            disabled={isDownloading || isScanning || !downloadFolder}
            variant="secondary"
            className="w-full"
          >
            {isDownloading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Downloading...
              </>
            ) : isScanning ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Download All Content
              </>
            )}
          </Button>

          {isDownloading && downloadProgress && downloadProgress.status !== 'listing' && (
            <Progress value={downloadPercent} className="h-2" />
          )}

          {downloadStatus && (
            <p className="text-xs text-muted-foreground">{downloadStatus}</p>
          )}
        </div>
      </div>

      {/* Download Confirmation Dialog */}
      <AlertDialog open={showDownloadConfirm} onOpenChange={setShowDownloadConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Download</AlertDialogTitle>
            <AlertDialogDescription>
              {scanInfo && (
                <>
                  You are about to download <strong>{scanInfo.totalFiles} files</strong> ({formatBytes(scanInfo.totalBytes)}) from Bunny CDN.
                  <br /><br />
                  Destination: <span className="font-mono text-xs">{downloadFolder}</span>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDownloadConfirm}>
              Download
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default BunnyCDN;
