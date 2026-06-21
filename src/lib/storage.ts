// File Upload utilities using Supabase Storage

import { supabase } from './supabase';

export type BucketName = 'course-files' | 'product-files' | 'avatar-images' | 'tutorial-files' | 'podcast-audio' | 'ticket-attachments' | 'general-uploads';

interface UploadResult {
  success: boolean;
  path?: string;
  url?: string;
  error?: string;
}

interface FileListResult {
  success: boolean;
  files?: FileInfo[];
  error?: string;
}

interface FileInfo {
  name: string;
  path: string;
  url: string;
  size?: number;
  type?: string;
  created_at?: string;
}

// Bucket mapping for reference
// courses: 'course-files', products: 'product-files', avatars: 'avatar-images'
// tutorials: 'tutorial-files', podcasts: 'podcast-audio', tickets: 'ticket-attachments'

/**
 * Upload a file to Supabase Storage via Edge Function
 */
export async function uploadFile(
  file: File,
  bucket: BucketName,
  folder?: string
): Promise<UploadResult> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('bucket', bucket);
    if (folder) {
      formData.append('folder', folder);
    }

    const { data, error } = await supabase.functions.invoke('upload-file', {
      body: formData
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      path: data.path,
      url: data.url
    };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Upload failed' 
    };
  }
}

/**
 * Upload multiple files
 */
export async function uploadFiles(
  files: File[],
  bucket: BucketName,
  folder?: string,
  onProgress?: (progress: number) => void
): Promise<UploadResult[]> {
  const results: UploadResult[] = [];
  
  for (let i = 0; i < files.length; i++) {
    const result = await uploadFile(files[i], bucket, folder);
    results.push(result);
    if (onProgress) {
      onProgress(Math.round(((i + 1) / files.length) * 100));
    }
  }
  
  return results;
}

/**
 * Delete a file from storage
 */
export async function deleteFile(
  bucket: BucketName,
  path: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.functions.invoke('delete-file', {
      body: { bucket, path }
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Delete failed' 
    };
  }
}

/**
 * List files in a bucket/folder
 */
export async function listFiles(
  bucket: BucketName,
  folder?: string,
  limit?: number
): Promise<FileListResult> {
  try {
    const params = new URLSearchParams();
    params.set('bucket', bucket);
    if (folder) params.set('folder', folder);
    if (limit) params.set('limit', String(limit));

    const { data, error } = await supabase.functions.invoke(`list-files?${params.toString()}`);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, files: data.files };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to list files' 
    };
  }
}

/**
 * Get public URL for a file
 */
export function getFileUrl(bucket: BucketName, path: string): string {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Format file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get file extension
 */
export function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || '';
}

/**
 * Check if file type is allowed
 */
export function isAllowedFileType(file: File, allowedTypes: string[]): boolean {
  const ext = getFileExtension(file.name);
  return allowedTypes.includes(ext) || allowedTypes.includes(file.type);
}

/**
 * Common allowed file types
 */
export const ALLOWED_FILE_TYPES = {
  images: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  documents: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt'],
  videos: ['.mp4', '.webm', '.mov', '.avi', '.mkv'],
  audio: ['.mp3', '.wav', '.ogg', '.m4a'],
  archives: ['.zip', '.rar', '.7z', '.tar', '.gz']
};
