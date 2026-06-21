import React, { useState, useRef } from 'react';
import { Button } from './index';
import { Upload, X, File, Image, Video, Music, FileText, Loader2 } from 'lucide-react';

interface FileUploadProps {
  onUpload: (files: { name: string; url: string; size: number; type: string }[]) => void;
  accept?: string;
  multiple?: boolean;
  maxSize?: number; // in MB
  bucket?: string;
  folder?: string;
  maxFiles?: number;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  onUpload,
  accept = '*',
  multiple = false,
  maxSize = 50,
  bucket = 'general-uploads',
  folder = '',
  maxFiles = 5
}) => {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    setError('');
    
    // Check max files
    if (selectedFiles.length + files.length > maxFiles) {
      setError(`Maximum ${maxFiles} files allowed`);
      return;
    }
    
    // Check file sizes
    const oversized = selectedFiles.filter(f => f.size > maxSize * 1024 * 1024);
    if (oversized.length > 0) {
      setError(`Some files exceed ${maxSize}MB limit`);
      return;
    }
    
    setFiles(prev => [...prev, ...selectedFiles]);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    
    setUploading(true);
    setProgress(0);
    setError('');

    try {
      const formData = new FormData();
      files.forEach((file, index) => {
        formData.append(`file${index}`, file);
      });
      formData.append('bucket', bucket);
      formData.append('folder', folder);

      // Simulate upload with progress
      const interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(interval);
            return prev;
          }
          return prev + 10;
        });
      }, 200);

      // In production, this would call the upload function
      const uploadedFiles = files.map(f => ({
        name: f.name,
        url: URL.createObjectURL(f), // Temporary URL
        size: f.size,
        type: f.type
      }));

      setProgress(100);
      clearInterval(interval);
      
      onUpload(uploadedFiles);
      setFiles([]);
      setProgress(0);
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return <Image className="w-5 h-5" />;
    if (file.type.startsWith('video/')) return <Video className="w-5 h-5" />;
    if (file.type.startsWith('audio/')) return <Music className="w-5 h-5" />;
    if (file.type.includes('pdf') || file.type.includes('document')) return <FileText className="w-5 h-5" />;
    return <File className="w-5 h-5" />;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-[#2a2a3d] rounded-xl p-8 text-center cursor-pointer hover:border-indigo-500/50 transition-colors"
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleFileSelect}
          className="hidden"
        />
        <Upload className="w-10 h-10 text-gray-500 mx-auto mb-3" />
        <p className="text-gray-400 text-sm mb-1">Click to upload or drag and drop</p>
        <p className="text-gray-500 text-xs">Max file size: {maxSize}MB</p>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Selected files */}
      {files.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-gray-400">Selected files ({files.length})</p>
          {files.map((file, index) => (
            <div
              key={index}
              className="flex items-center justify-between bg-[#1e1e2d] rounded-xl px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="text-indigo-400">{getFileIcon(file)}</div>
                <div>
                  <p className="text-white text-sm truncate max-w-[200px]">{file.name}</p>
                  <p className="text-gray-500 text-xs">{formatSize(file.size)}</p>
                </div>
              </div>
              <button
                onClick={() => removeFile(index)}
                className="p-1 hover:bg-red-500/20 rounded-lg transition-colors"
              >
                <X className="w-4 h-4 text-red-400" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Progress */}
      {uploading && (
        <div className="space-y-2">
          <div className="h-2 bg-[#1e1e2d] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-600 to-purple-600 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-center text-gray-400 text-sm">
            {uploading ? <><Loader2 className="w-4 h-4 inline animate-spin mr-2" />Uploading...</> : 'Complete'}
          </p>
        </div>
      )}

      {/* Upload button */}
      {files.length > 0 && !uploading && (
        <Button onClick={handleUpload} className="w-full">
          Upload {files.length} file{files.length > 1 ? 's' : ''}
        </Button>
      )}
    </div>
  );
};
