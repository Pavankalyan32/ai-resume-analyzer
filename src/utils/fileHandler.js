import mammoth from 'mammoth';
import Tesseract from 'tesseract.js';
import { fileTypeFromBuffer } from 'file-type';

/**
 * Enhanced file handling utilities for the AI Resume Analyzer
 * Supports PDF, TXT, DOCX, DOC files and OCR for scanned documents
 */

// File type validation
export const SUPPORTED_FILE_TYPES = {
  'application/pdf': { extension: '.pdf', name: 'PDF' },
  'text/plain': { extension: '.txt', name: 'Text' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { extension: '.docx', name: 'Word Document' },
  'application/msword': { extension: '.doc', name: 'Word Document' },
  'image/png': { extension: '.png', name: 'PNG Image' },
  'image/jpeg': { extension: '.jpg', name: 'JPEG Image' },
  'image/jpg': { extension: '.jpg', name: 'JPEG Image' }
};

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_FILES = 5; // Maximum number of files

/**
 * Validates file type and size
 * @param {File} file - The file to validate
 * @returns {Object} - Validation result with success boolean and message
 */
export const validateFile = (file) => {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      success: false,
      message: `File size exceeds 10MB limit. Current size: ${(file.size / 1024 / 1024).toFixed(2)}MB`
    };
  }

  // Check file type
  const fileType = SUPPORTED_FILE_TYPES[file.type];
  if (!fileType) {
    return {
      success: false,
      message: `Unsupported file type: ${file.type}. Supported types: PDF, TXT, DOCX, DOC, PNG, JPG`
    };
  }

  return { success: true, message: 'File is valid' };
};

/**
 * Validates multiple files
 * @param {FileList} files - The files to validate
 * @returns {Object} - Validation result with success boolean, valid files, and errors
 */
export const validateMultipleFiles = (files) => {
  const validFiles = [];
  const errors = [];

  if (files.length > MAX_FILES) {
    errors.push(`Maximum ${MAX_FILES} files allowed. You selected ${files.length} files.`);
    return { success: false, validFiles: [], errors };
  }

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const validation = validateFile(file);
    
    if (validation.success) {
      validFiles.push(file);
    } else {
      errors.push(`${file.name}: ${validation.message}`);
    }
  }

  return {
    success: errors.length === 0,
    validFiles,
    errors
  };
};

/**
 * Detects if a PDF is scanned (image-based) by checking for text content
 * @param {ArrayBuffer} pdfBuffer - The PDF file buffer
 * @returns {Promise<boolean>} - True if PDF appears to be scanned
 */
export const isScannedPDF = async (pdfBuffer) => {
  try {
    // Load PDF.js dynamically
    const pdfjsLib = await loadPdfJs();
    const pdf = await pdfjsLib.getDocument({ data: pdfBuffer }).promise;
    
    let totalTextLength = 0;
    const maxPagesToCheck = Math.min(pdf.numPages, 3); // Check first 3 pages
    
    for (let i = 1; i <= maxPagesToCheck; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      totalTextLength += pageText.length;
    }
    
    // If very little text found, likely scanned
    return totalTextLength < 50;
  } catch (error) {
    console.warn('Error checking if PDF is scanned:', error);
    return false; // Default to false if we can't determine
  }
};

/**
 * Extracts text from PDF using PDF.js
 * @param {ArrayBuffer} pdfBuffer - The PDF file buffer
 * @returns {Promise<string>} - Extracted text
 */
export const extractTextFromPDF = async (pdfBuffer) => {
  try {
    const pdfjsLib = await loadPdfJs();
    const pdf = await pdfjsLib.getDocument({ data: pdfBuffer }).promise;
    
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      fullText += textContent.items.map(item => item.str).join(' ') + '\n';
    }
    
    return fullText.trim();
  } catch (error) {
    throw new Error(`Failed to extract text from PDF: ${error.message}`);
  }
};

/**
 * Extracts text from DOCX/DOC files using mammoth
 * @param {ArrayBuffer} docBuffer - The document file buffer
 * @returns {Promise<string>} - Extracted text
 */
export const extractTextFromDocx = async (docBuffer) => {
  try {
    const result = await mammoth.extractRawText({ buffer: docBuffer });
    return result.value.trim();
  } catch (error) {
    throw new Error(`Failed to extract text from Word document: ${error.message}`);
  }
};

/**
 * Extracts text from images using OCR (Tesseract.js)
 * @param {ArrayBuffer} imageBuffer - The image file buffer
 * @param {string} fileName - The file name for progress tracking
 * @param {Function} onProgress - Progress callback function
 * @returns {Promise<string>} - Extracted text
 */
export const extractTextFromImage = async (imageBuffer, fileName, onProgress) => {
  try {
    const result = await Tesseract.recognize(
      imageBuffer,
      'eng',
      {
        logger: (m) => {
          if (m.status === 'recognizing text' && onProgress) {
            onProgress(Math.round(m.progress * 100));
          }
        }
      }
    );
    
    return result.data.text.trim();
  } catch (error) {
    throw new Error(`Failed to extract text from image: ${error.message}`);
  }
};

/**
 * Processes a scanned PDF by converting pages to images and using OCR
 * @param {ArrayBuffer} pdfBuffer - The PDF file buffer
 * @param {string} fileName - The file name for progress tracking
 * @param {Function} onProgress - Progress callback function
 * @returns {Promise<string>} - Extracted text
 */
export const processScannedPDF = async (pdfBuffer, fileName, onProgress) => {
  try {
    const pdfjsLib = await loadPdfJs();
    const pdf = await pdfjsLib.getDocument({ data: pdfBuffer }).promise;
    
    let fullText = '';
    const totalPages = pdf.numPages;
    
    for (let i = 1; i <= totalPages; i++) {
      if (onProgress) {
        onProgress(Math.round(((i - 1) / totalPages) * 100));
      }
      
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 });
      
      // Create canvas to render PDF page as image
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      // Render PDF page to canvas
      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;
      
      // Convert canvas to blob and extract text
      const imageData = canvas.toDataURL('image/png');
      const response = await fetch(imageData);
      const imageBuffer = await response.arrayBuffer();
      
      const pageText = await extractTextFromImage(imageBuffer, `${fileName} - Page ${i}`);
      fullText += pageText + '\n\n';
    }
    
    if (onProgress) {
      onProgress(100);
    }
    
    return fullText.trim();
  } catch (error) {
    throw new Error(`Failed to process scanned PDF: ${error.message}`);
  }
};

/**
 * Main function to extract text from any supported file type
 * @param {File} file - The file to process
 * @param {Function} onProgress - Progress callback function
 * @returns {Promise<Object>} - Result with text and metadata
 */
export const extractTextFromFile = async (file, onProgress) => {
  const validation = validateFile(file);
  if (!validation.success) {
    throw new Error(validation.message);
  }

  const fileBuffer = await file.arrayBuffer();
  let extractedText = '';
  let processingMethod = '';

  try {
    switch (file.type) {
      case 'text/plain':
        extractedText = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = () => reject(new Error('Failed to read text file'));
          reader.readAsText(file);
        });
        processingMethod = 'Direct text reading';
        break;

      case 'application/pdf':
        // First try regular PDF text extraction
        extractedText = await extractTextFromPDF(fileBuffer);
        
        // If very little text found, try OCR
        if (extractedText.length < 50) {
          if (onProgress) onProgress(0);
          extractedText = await processScannedPDF(fileBuffer, file.name, onProgress);
          processingMethod = 'OCR (scanned PDF)';
        } else {
          processingMethod = 'PDF text extraction';
        }
        break;

      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      case 'application/msword':
        extractedText = await extractTextFromDocx(fileBuffer);
        processingMethod = 'Word document extraction';
        break;

      case 'image/png':
      case 'image/jpeg':
      case 'image/jpg':
        if (onProgress) onProgress(0);
        extractedText = await extractTextFromImage(fileBuffer, file.name, onProgress);
        processingMethod = 'OCR (image)';
        break;

      default:
        throw new Error(`Unsupported file type: ${file.type}`);
    }

    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error('No text content found in the file');
    }

    return {
      success: true,
      text: extractedText,
      method: processingMethod,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type
    };

  } catch (error) {
    return {
      success: false,
      error: error.message,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type
    };
  }
};

/**
 * Processes multiple files and extracts text from each
 * @param {FileList} files - The files to process
 * @param {Function} onProgress - Progress callback function
 * @returns {Promise<Array>} - Array of processing results
 */
export const processMultipleFiles = async (files, onProgress) => {
  const validation = validateMultipleFiles(files);
  if (!validation.success) {
    throw new Error(`File validation failed: ${validation.errors.join(', ')}`);
  }

  const results = [];
  const totalFiles = validation.validFiles.length;

  for (let i = 0; i < totalFiles; i++) {
    const file = validation.validFiles[i];
    
    if (onProgress) {
      onProgress({
        currentFile: i + 1,
        totalFiles,
        fileName: file.name,
        progress: 0
      });
    }

    const result = await extractTextFromFile(file, (progress) => {
      if (onProgress) {
        onProgress({
          currentFile: i + 1,
          totalFiles,
          fileName: file.name,
          progress
        });
      }
    });

    results.push(result);
  }

  return results;
};

// PDF.js loader (reused from existing code)
let pdfjsLibPromise = null;
const loadPdfJs = () => {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
        resolve(window.pdfjsLib);
      };
      script.onerror = () => {
        reject(new Error('Failed to load PDF.js library from CDN.'));
      };
      document.head.appendChild(script);
    });
  }
  return pdfjsLibPromise;
};
