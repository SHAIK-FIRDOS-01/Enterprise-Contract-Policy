import React, { useState, useRef } from 'react';
import { UploadCloud, X, FileText, AlertCircle, Loader2 } from 'lucide-react';
import api from '../../services/api';

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export default function DocumentUploadModal({ isOpen, onClose, onUploadSuccess }) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [title, setTitle] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const validateAndSetFile = (file) => {
    setErrorMessage('');

    if (!file) return;

    // MIME and extension check
    const isPdf =
      file.type === 'application/pdf' ||
      file.name.toLowerCase().endsWith('.pdf');

    if (!isPdf) {
      setErrorMessage('Only PDF documents (.pdf) are permitted.');
      setSelectedFile(null);
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setErrorMessage('File exceeds 25MB maximum limit.');
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    // Autofill title if empty
    if (!title) {
      const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
      setTitle(cleanName);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMessage('Please select a valid PDF file.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(10);
    setErrorMessage('');

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('title', title.trim() || selectedFile.name);

      const response = await api.post('/api/documents/upload/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percent = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            setUploadProgress(percent);
          }
        },
      });

      setIsUploading(false);
      if (onUploadSuccess) {
        onUploadSuccess(response.data);
      }
      onClose();
    } catch (err) {
      setIsUploading(false);
      const detail =
        err.response?.data?.detail ||
        err.response?.data?.file?.[0] ||
        'Upload failed. Ingestion pipeline error.';
      setErrorMessage(detail);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 select-none">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl overflow-hidden font-sans">
        {/* Header */}
        <div className="h-11 px-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
          <div className="flex items-center gap-2">
            <UploadCloud className="w-4 h-4 text-emerald-400" />
            <h2 className="text-xs font-mono font-semibold text-zinc-100 uppercase tracking-wider">
              Ingest Contract PDF
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleUploadSubmit} className="p-5 space-y-4">
          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3 rounded bg-rose-950/40 border border-rose-800/60 flex items-start gap-2 text-rose-300 text-xs font-mono">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Drag & Drop Zone */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              dragActive
                ? 'border-emerald-500 bg-emerald-950/20'
                : 'border-zinc-800 hover:border-zinc-700 bg-zinc-950/40'
            }`}
          >
            <input
              ref={fileInputRef}
              data-testid="file-drop-input"
              type="file"
              accept="application/pdf,.pdf"
              onChange={handleFileInputChange}
              className="hidden"
            />

            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded border border-zinc-800 bg-zinc-900 flex items-center justify-center text-zinc-400">
                <FileText className="w-5 h-5 text-zinc-400" />
              </div>
              <div>
                <p className="text-xs font-mono font-medium text-zinc-200">
                  {selectedFile ? selectedFile.name : 'Click to select or drop contract PDF'}
                </p>
                <p className="text-[10px] font-mono text-zinc-500 mt-1">
                  PDF format strictly required • Maximum size 25MB
                </p>
              </div>
            </div>
          </div>

          {/* File Selected Indicator */}
          {selectedFile && (
            <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800 flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2 truncate">
                <FileText className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                <span className="text-zinc-300 truncate">{selectedFile.name}</span>
              </div>
              <span className="text-[10px] text-zinc-500 tabular-nums">
                {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
              </span>
            </div>
          )}

          {/* Title Input */}
          <div className="space-y-1.5">
            <label
              htmlFor="contract-title"
              className="block text-xs font-mono text-zinc-400 uppercase tracking-wider"
            >
              Contract Title / Identification
            </label>
            <input
              id="contract-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Master Services Agreement 2026"
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-400 font-mono transition-colors"
            />
          </div>

          {/* Upload Progress */}
          {isUploading && (
            <div className="space-y-1.5 font-mono">
              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span>INGESTION STREAM UPLOAD</span>
                <span className="tabular-nums">{uploadProgress}%</span>
              </div>
              <div className="w-full h-1.5 bg-zinc-950 rounded overflow-hidden border border-zinc-800">
                <div
                  className="h-full bg-emerald-500 transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2 font-mono">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="px-3 py-1.5 rounded bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-50 transition-colors"
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={!selectedFile || isUploading}
              className="px-4 py-1.5 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-900 font-semibold text-xs disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors shadow"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>INGESTING...</span>
                </>
              ) : (
                <span>START INGESTION</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
