import React, { useState, useRef } from 'react';
import { 
  validateMultipleFiles, 
  processMultipleFiles, 
  SUPPORTED_FILE_TYPES,
  MAX_FILES 
} from '../utils/fileHandler.js';

/**
 * Enhanced file upload component with support for multiple files and various formats
 */
const EnhancedFileUpload = ({ 
  onFilesProcessed, 
  onError, 
  disabled = false,
  maxFiles = MAX_FILES,
  acceptedTypes = Object.keys(SUPPORTED_FILE_TYPES)
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(null);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    
    if (disabled) return;
    
    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  };

  const handleFileInput = (e) => {
    const files = Array.from(e.target.files);
    handleFiles(files);
  };

  const handleFiles = async (files) => {
    if (files.length === 0) return;

    setIsProcessing(true);
    setProcessingProgress(null);
    setUploadedFiles([]);

    try {
      const results = await processMultipleFiles(files, (progress) => {
        setProcessingProgress(progress);
      });

      const successfulResults = results.filter(result => result.success);
      const failedResults = results.filter(result => !result.success);

      if (failedResults.length > 0) {
        const errorMessages = failedResults.map(result => 
          `${result.fileName}: ${result.error}`
        );
        onError(`Some files failed to process: ${errorMessages.join(', ')}`);
      }

      if (successfulResults.length > 0) {
        setUploadedFiles(successfulResults);
        onFilesProcessed(successfulResults);
      }

    } catch (error) {
      onError(error.message);
    } finally {
      setIsProcessing(false);
      setProcessingProgress(null);
    }
  };

  const removeFile = (index) => {
    const newFiles = uploadedFiles.filter((_, i) => i !== index);
    setUploadedFiles(newFiles);
    onFilesProcessed(newFiles);
  };

  const clearAllFiles = () => {
    setUploadedFiles([]);
    onFilesProcessed([]);
  };

  const getFileIcon = (fileType) => {
    if (fileType.includes('pdf')) {
      return (
        <svg className="w-6 h-6 text-red-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
        </svg>
      );
    } else if (fileType.includes('word') || fileType.includes('document')) {
      return (
        <svg className="w-6 h-6 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
        </svg>
      );
    } else if (fileType.includes('image')) {
      return (
        <svg className="w-6 h-6 text-green-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
        </svg>
      );
    } else {
      return (
        <svg className="w-6 h-6 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
        </svg>
      );
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="w-full">
      {/* Upload Area */}
      <div
        className={`upload-area ${isDragOver ? 'border-indigo-500 bg-indigo-50' : ''} ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={acceptedTypes.join(',')}
          onChange={handleFileInput}
          className="hidden"
          disabled={disabled}
        />

        {isProcessing ? (
          <div className="text-center">
            <div className="w-16 h-16 bg-gradient-to-r from-indigo-100 to-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="animate-spin w-8 h-8 text-indigo-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
            {processingProgress && (
              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-2">
                  Processing {processingProgress.currentFile} of {processingProgress.totalFiles}: {processingProgress.fileName}
                </p>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-gradient-to-r from-indigo-500 to-purple-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${processingProgress.progress}%` }}
                  ></div>
                </div>
                <p className="text-xs text-gray-500 mt-1">{processingProgress.progress}% complete</p>
              </div>
            )}
            <p className="text-gray-600">Processing your files...</p>
          </div>
        ) : uploadedFiles.length > 0 ? (
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="font-semibold text-gray-800 mb-2">
              {uploadedFiles.length} file{uploadedFiles.length !== 1 ? 's' : ''} uploaded successfully
            </p>
            <p className="text-sm text-green-600 mb-4">✓ Ready for analysis</p>
            <p className="text-xs text-gray-500">Click to upload more files</p>
          </div>
        ) : (
          <div className="text-center">
            <svg className="w-12 h-12 mb-4 text-gray-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="mb-2 text-lg font-semibold text-gray-700">
              Upload your documents
            </p>
            <p className="text-sm text-gray-500 mb-2">
              Drag & drop files here or click to browse
            </p>
            <p className="text-xs text-gray-400 mb-2">
              Supports: PDF, DOCX, DOC, TXT, PNG, JPG (Max {maxFiles} files, 10MB each)
            </p>
            <div className="flex flex-wrap justify-center gap-2 text-xs text-gray-400">
              <span className="px-2 py-1 bg-gray-100 rounded">Resume</span>
              <span className="px-2 py-1 bg-gray-100 rounded">Cover Letter</span>
              <span className="px-2 py-1 bg-gray-100 rounded">Portfolio</span>
            </div>
          </div>
        )}
      </div>

      {/* File List */}
      {uploadedFiles.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800">Uploaded Files</h3>
            <button
              onClick={clearAllFiles}
              className="text-sm text-red-600 hover:text-red-700 font-medium"
            >
              Clear All
            </button>
          </div>
          
          <div className="space-y-3">
            {uploadedFiles.map((file, index) => (
              <div key={index} className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
                <div className="flex items-center space-x-3">
                  {getFileIcon(file.fileType)}
                  <div>
                    <p className="font-medium text-gray-800">{file.fileName}</p>
                    <div className="flex items-center space-x-4 text-sm text-gray-500">
                      <span>{formatFileSize(file.fileSize)}</span>
                      <span>•</span>
                      <span>{file.method}</span>
                      <span>•</span>
                      <span className="text-green-600">✓ Processed</span>
                    </div>
                  </div>
                </div>
                
                <button
                  onClick={() => removeFile(index)}
                  className="text-red-500 hover:text-red-700 p-1"
                  title="Remove file"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default EnhancedFileUpload;
