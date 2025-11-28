import * as fs from 'fs';
import * as path from 'path';
import { bunnyConfigStore } from './store';

// Bunny Storage API base URL
// Note: This may need to be adjusted based on storage zone region
const STORAGE_BASE_URL = 'https://storage.bunnycdn.com';

export interface BunnyFile {
  Guid: string;
  StorageZoneName: string;
  Path: string;
  ObjectName: string;
  Length: number;
  LastChanged: string;
  ServerId: number;
  ArrayNumber: number;
  IsDirectory: boolean;
  UserId: string;
  ContentType: string;
  DateCreated: string;
  StorageZoneId: number;
  Checksum: string | null;
  ReplicatedZones: string | null;
}

export interface UploadProgress {
  totalFiles: number;
  uploadedFiles: number;
  currentFile: string;
  status: 'uploading' | 'completed' | 'error';
  error?: string;
}

export interface DownloadProgress {
  totalFiles: number;
  downloadedFiles: number;
  currentFile: string;
  totalBytes: number;
  downloadedBytes: number;
  status: 'listing' | 'downloading' | 'completed' | 'error';
  error?: string;
}

/**
 * Get all files in a local folder recursively
 */
function getFilesRecursively(dir: string, baseDir: string = dir): { localPath: string; relativePath: string }[] {
  const files: { localPath: string; relativePath: string }[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);

    if (entry.isDirectory()) {
      files.push(...getFilesRecursively(fullPath, baseDir));
    } else {
      files.push({ localPath: fullPath, relativePath });
    }
  }

  return files;
}

/**
 * Upload a single file to Bunny Storage
 */
async function uploadFile(
  storageApiKey: string,
  storageZoneName: string,
  storagePath: string,
  localFilePath: string
): Promise<void> {
  const fileContent = fs.readFileSync(localFilePath);

  const response = await fetch(`${STORAGE_BASE_URL}/${storageZoneName}/${storagePath}`, {
    method: 'PUT',
    headers: {
      'AccessKey': storageApiKey,
      'Content-Type': 'application/octet-stream',
    },
    body: fileContent,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Upload failed: ${response.status} ${errorText}`);
  }
}

/**
 * Upload folders to Bunny Storage
 */
export async function uploadFolders(
  folderPaths: string[],
  onProgress: (progress: UploadProgress) => void
): Promise<void> {
  const config = bunnyConfigStore.getConfig();
  if (!config) {
    throw new Error('Bunny CDN not configured');
  }

  // Collect all files from all folders
  const allFiles: { localPath: string; remotePath: string; folderName: string }[] = [];

  for (const folderPath of folderPaths) {
    const folderName = path.basename(folderPath);
    const files = getFilesRecursively(folderPath);

    for (const file of files) {
      allFiles.push({
        localPath: file.localPath,
        remotePath: `${config.defaultRemotePath}/${folderName}/${file.relativePath}`,
        folderName,
      });
    }
  }

  const totalFiles = allFiles.length;
  let uploadedFiles = 0;

  onProgress({
    totalFiles,
    uploadedFiles,
    currentFile: '',
    status: 'uploading',
  });

  for (const file of allFiles) {
    try {
      onProgress({
        totalFiles,
        uploadedFiles,
        currentFile: file.localPath,
        status: 'uploading',
      });

      await uploadFile(config.storageApiKey, config.storageZoneName, file.remotePath, file.localPath);
      uploadedFiles++;

      onProgress({
        totalFiles,
        uploadedFiles,
        currentFile: file.localPath,
        status: 'uploading',
      });
    } catch (error) {
      onProgress({
        totalFiles,
        uploadedFiles,
        currentFile: file.localPath,
        status: 'error',
        error: `Failed to upload ${file.localPath}: ${error}`,
      });
      throw error;
    }
  }

  onProgress({
    totalFiles,
    uploadedFiles,
    currentFile: '',
    status: 'completed',
  });
}

/**
 * List files in a Bunny Storage directory
 */
async function listFiles(
  storageApiKey: string,
  storageZoneName: string,
  storagePath: string
): Promise<BunnyFile[]> {
  const url = `${STORAGE_BASE_URL}/${storageZoneName}/${storagePath}/`;

  console.log('Listing files at:', url);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'AccessKey': storageApiKey,
        'accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`List failed: ${response.status} ${errorText}`);
    }

    return response.json();
  } catch (error) {
    console.error('Failed to list files at', url, ':', error);
    throw error;
  }
}

/**
 * List all files recursively in Bunny Storage
 */
async function listFilesRecursively(
  storageApiKey: string,
  storageZoneName: string,
  basePath: string,
  currentPath: string = ''
): Promise<BunnyFile[]> {
  const fullPath = currentPath ? `${basePath}/${currentPath}` : basePath;
  const files = await listFiles(storageApiKey, storageZoneName, fullPath);
  const allFiles: BunnyFile[] = [];

  for (const file of files) {
    if (file.IsDirectory) {
      const subPath = currentPath ? `${currentPath}/${file.ObjectName}` : file.ObjectName;
      const subFiles = await listFilesRecursively(storageApiKey, storageZoneName, basePath, subPath);
      allFiles.push(...subFiles);
    } else {
      allFiles.push(file);
    }
  }

  return allFiles;
}

/**
 * Download a single file from Bunny Storage
 */
async function downloadFile(
  storageApiKey: string,
  storageZoneName: string,
  storagePath: string,
  localFilePath: string
): Promise<void> {
  const url = `${STORAGE_BASE_URL}/${storageZoneName}/${storagePath}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'AccessKey': storageApiKey,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Download failed: ${response.status} ${errorText}`);
  }

  const buffer = await response.arrayBuffer();

  // Ensure directory exists
  const dir = path.dirname(localFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(localFilePath, Buffer.from(buffer));
}

/**
 * Scan files in Bunny Storage and return count and total size
 */
export async function scanStorageContent(): Promise<{ totalFiles: number; totalBytes: number }> {
  const config = bunnyConfigStore.getConfig();
  if (!config) {
    throw new Error('Bunny CDN not configured');
  }

  console.log('Scanning storage content for:', config.storageZoneName, '/', config.defaultRemotePath);

  try {
    const files = await listFilesRecursively(config.storageApiKey, config.storageZoneName, config.defaultRemotePath);
    const totalFiles = files.filter(f => !f.IsDirectory).length;
    const totalBytes = files.reduce((sum, f) => sum + (f.IsDirectory ? 0 : f.Length), 0);

    console.log('Scan complete:', totalFiles, 'files,', totalBytes, 'bytes');
    return { totalFiles, totalBytes };
  } catch (error) {
    console.error('Scan storage content failed:', error);
    // If path doesn't exist (404), return empty result
    if (error instanceof Error && error.message.includes('404')) {
      return { totalFiles: 0, totalBytes: 0 };
    }
    throw error;
  }
}

/**
 * Download all content from Bunny Storage to a local folder
 */
export async function downloadAllContent(
  destinationFolder: string,
  onProgress: (progress: DownloadProgress) => void
): Promise<void> {
  const config = bunnyConfigStore.getConfig();
  if (!config) {
    throw new Error('Bunny CDN not configured');
  }

  onProgress({
    totalFiles: 0,
    downloadedFiles: 0,
    currentFile: '',
    totalBytes: 0,
    downloadedBytes: 0,
    status: 'listing',
  });

  // List all files in the storage path
  const files = await listFilesRecursively(config.storageApiKey, config.storageZoneName, config.defaultRemotePath);
  const totalFiles = files.length;
  const totalBytes = files.reduce((sum, f) => sum + (f.IsDirectory ? 0 : f.Length), 0);
  let downloadedFiles = 0;
  let downloadedBytes = 0;

  onProgress({
    totalFiles,
    downloadedFiles,
    currentFile: '',
    totalBytes,
    downloadedBytes,
    status: 'downloading',
  });

  for (const file of files) {
    if (file.IsDirectory) continue;

    // file.Path format: /{storageZoneName}/{defaultRemotePath}/{subfolders}/
    // We need to extract the path after defaultRemotePath for local storage
    // and construct the correct storage path
    const pathAfterZone = file.Path.replace(`/${config.storageZoneName}/`, '');
    const relativePath = pathAfterZone.replace(`${config.defaultRemotePath}/`, '');
    const localPath = path.join(destinationFolder, relativePath, file.ObjectName);

    try {
      onProgress({
        totalFiles,
        downloadedFiles,
        currentFile: file.ObjectName,
        totalBytes,
        downloadedBytes,
        status: 'downloading',
      });

      // Storage path is everything after the storage zone name
      const storagePath = `${pathAfterZone}${file.ObjectName}`;
      await downloadFile(config.storageApiKey, config.storageZoneName, storagePath, localPath);
      downloadedFiles++;
      downloadedBytes += file.Length;

      onProgress({
        totalFiles,
        downloadedFiles,
        currentFile: file.ObjectName,
        totalBytes,
        downloadedBytes,
        status: 'downloading',
      });
    } catch (error) {
      onProgress({
        totalFiles,
        downloadedFiles,
        currentFile: file.ObjectName,
        totalBytes,
        downloadedBytes,
        status: 'error',
        error: `Failed to download ${file.ObjectName}: ${error}`,
      });
      throw error;
    }
  }

  onProgress({
    totalFiles,
    downloadedFiles,
    currentFile: '',
    totalBytes,
    downloadedBytes,
    status: 'completed',
  });
}
