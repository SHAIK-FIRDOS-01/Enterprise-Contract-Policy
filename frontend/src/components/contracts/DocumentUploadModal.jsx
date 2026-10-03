import React, { useState, useRef } from 'react';
import { UploadCloud, X, FileText, AlertCircle, Loader2, Plus, Trash2 } from 'lucide-react';
import api from '../../services/api';

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export default function DocumentUploadModal({ isOpen, onClose, onUploadSuccess }) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [title, setTitle] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const validateAndAddFiles = (incomingFiles) => {
    setErrorMessage('');
    if (!incomingFiles || incomingFiles.length === 0) return;

    const filesList = Array.from(incomingFiles);

    // 1. MIME and extension check
    for (const file of filesList) {
      const isPdf =
        file.type === 'application/pdf' ||
        file.name.toLowerCase().endsWith('.pdf');

      if (!isPdf) {
        setErrorMessage('Only PDF documents (.pdf) are permitted.');
        setSelectedFiles([]);
        return;
      }
    }

    // 2. Size limit check
    for (const file of filesList) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setErrorMessage('File exceeds 25MB maximum limit.');
        setSelectedFiles([]);
        return;
      }
    }

    // 3. Add to files list, deduplicating by filename and size
    setSelectedFiles((prev) => {
      const existingKeys = new Set(prev.map((f) => `${f.name}-${f.size}`));
      const newFiles = filesList.filter(
        (f) => !existingKeys.has(`${f.name}-${f.size}`)
      );
      const combined = [...prev, ...newFiles];
      if (combined.length === 1 && !title) {
        const cleanName = combined[0].name
          .replace(/\.[^/.]+$/, '')
          .replace(/[_-]/g, ' ');
        setTitle(cleanName);
      }
      return combined;
    });
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

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndAddFiles(e.dataTransfer.files);
    }
  };

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndAddFiles(e.target.files);
    }
    if (e.target) {
      e.target.value = '';
    }
  };

  const handleRemoveFile = (indexToRemove) => {
    setSelectedFiles((prev) => {
      const next = prev.filter((_, idx) => idx !== indexToRemove);
      if (next.length === 0) {
        setTitle('');
      } else if (next.length === 1 && !title) {
        const cleanName = next[0].name
          .replace(/\.[^/.]+$/, '')
          .replace(/[_-]/g, ' ');
        setTitle(cleanName);
      }
      return next;
    });
  };

  const handleClearAll = () => {
    setSelectedFiles([]);
    setTitle('');
    setErrorMessage('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    if (isUploading) return;
    setSelectedFiles([]);
    setTitle('');
    setErrorMessage('');
    setUploadProgress(0);
    onClose();
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (selectedFiles.length === 0) {
      setErrorMessage('Please select a valid PDF file.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(5);
    setErrorMessage('');

    try {
      const fileProgress = new Array(selectedFiles.length).fill(0);
      const totalBytes =
        selectedFiles.reduce((acc, f) => acc + f.size, 0) || selectedFiles.length * 1024;

      const uploadPromises = selectedFiles.map((file, idx) => {
        const formData = new FormData();
        formData.append('file', file);
        const docTitle =
          selectedFiles.length === 1 && title.trim()
            ? title.trim()
            : file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
        formData.append('title', docTitle);

        return api.post('/api/documents/upload/', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              fileProgress[idx] = progressEvent.loaded;
              const loadedSum = fileProgress.reduce((a, b) => a + b, 0);
              const percent = Math.min(99, Math.round((loadedSum * 100) / totalBytes));
              setUploadProgress(percent);
            }
          },
        });
      });

      const responses = await Promise.all(uploadPromises);
      setUploadProgress(100);
      setIsUploading(false);

      if (onUploadSuccess) {
        onUploadSuccess(
          responses.length === 1 ? responses[0].data : responses.map((r) => r.data)
        );
      }
      handleClose();
    } catch (err) {
      setIsUploading(false);
      const detail =
        err.response?.data?.detail ||
        err.response?.data?.file?.[0] ||
        'Upload failed. Ingestion pipeline error.';
      setErrorMessage(detail);
    }
  };

  const totalSizeBytes = selectedFiles.reduce((acc, f) => acc + f.size, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 select-none">
      <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl overflow-hidden font-sans">
        {/* Header */}
        <div className="h-11 px-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
          <div className="flex items-center gap-2">
            <UploadCloud className="w-4 h-4 text-emerald-400" />
            <h2 className="text-xs font-mono font-semibold text-zinc-100 uppercase tracking-wider">
              Ingest Contract PDFs (Batch Enabled)
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isUploading}
            className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-30"
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
            className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors ${
              dragActive
                ? 'border-emerald-500 bg-emerald-950/20'
                : 'border-zinc-800 hover:border-zinc-700 bg-zinc-950/40'
            }`}
          >
            <input
              ref={fileInputRef}
              data-testid="file-drop-input"
              type="file"
              multiple
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
                  {selectedFiles.length > 0
                    ? `${selectedFiles.length} PDF${selectedFiles.length > 1 ? 's' : ''} queued (Click to add more)`
                    : 'Click to select or drop multiple contract PDFs'}
                </p>
                <p className="text-[10px] font-mono text-zinc-500 mt-1">
                  Select up to multiple PDFs at once (e.g. 8+ contracts) • Max 25MB per document
                </p>
              </div>
            </div>
          </div>

          {/* Files Selected Queue Indicator */}
          {selectedFiles.length > 0 && (
            <div className="space-y-2 font-mono">
              <div className="flex items-center justify-between text-xs px-0.5">
                <div className="flex items-center gap-1.5 text-zinc-300">
                  <span data-testid="queued-counter">
                    <strong className="font-semibold text-emerald-400">{selectedFiles.length}</strong>{' '}
                    {selectedFiles.length === 1 ? 'CONTRACT QUEUED' : 'CONTRACTS QUEUED'}
                  </span>
                  <span className="text-zinc-500 text-[10px]">
                    ({(totalSizeBytes / (1024 * 1024)).toFixed(2)} MB total)
                  </span>
                </div>
                {!isUploading && (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current && fileInputRef.current.click()}
                      className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors uppercase tracking-wider"
                    >
                      <Plus className="w-3 h-3" />
                      Add More
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAll}
                      className="text-[10px] text-zinc-500 hover:text-rose-400 flex items-center gap-1 transition-colors uppercase tracking-wider"
                    >
                      <Trash2 className="w-3 h-3" />
                      Clear All
                    </button>
                  </div>
                )}
              </div>

              {/* Scrollable List of Queued Files */}
              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 border border-zinc-800/80 rounded p-1.5 bg-zinc-950/60">
                {selectedFiles.map((file, idx) => (
                  <div
                    key={`${file.name}-${idx}`}
                    className="p-2 rounded bg-zinc-900/80 border border-zinc-800 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2 truncate max-w-[70%]">
                      <FileText className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                      <span className="text-zinc-300 truncate text-[11px]" title={file.name}>
                        {file.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[10px] text-zinc-500 tabular-nums">
                        {(file.size / (1024 * 1024)).toFixed(2)} MB
                      </span>
                      {!isUploading && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveFile(idx);
                          }}
                          className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 transition-colors"
                          aria-label={`Remove ${file.name}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Title Input or Batch Info */}
          {selectedFiles.length <= 1 ? (
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
                disabled={isUploading}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-400 font-mono transition-colors disabled:opacity-50"
              />
            </div>
          ) : (
            <div className="p-2.5 rounded bg-zinc-950/80 border border-zinc-800 text-[11px] font-mono text-zinc-400 flex items-center justify-between">
              <span>BATCH ASYNC INGESTION</span>
              <span className="text-emerald-400 font-semibold">
                {selectedFiles.length} CONCURRENT PIPELINES
              </span>
            </div>
          )}

          {/* Upload Progress */}
          {isUploading && (
            <div className="space-y-1.5 font-mono">
              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span>
                  {selectedFiles.length > 1
                    ? `BATCH INGESTION STREAM (${selectedFiles.length} FILES)`
                    : 'INGESTION STREAM UPLOAD'}
                </span>
                <span className="tabular-nums text-emerald-400 font-semibold">
                  {uploadProgress}%
                </span>
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
              onClick={handleClose}
              disabled={isUploading}
              className="px-3 py-1.5 rounded bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-50 transition-colors"
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={selectedFiles.length === 0 || isUploading}
              className="px-4 py-1.5 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-900 font-semibold text-xs disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors shadow"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>
                    INGESTING {selectedFiles.length > 1 ? `(${selectedFiles.length})` : ''}...
                  </span>
                </>
              ) : (
                <span>
                  {selectedFiles.length > 1
                    ? `INGEST ${selectedFiles.length} CONTRACTS`
                    : 'START INGESTION'}
                </span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
