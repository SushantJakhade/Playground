import { useCallback, useEffect, useRef, useState } from 'react';

interface FileRecord {
  id: number;
  filename: string;
  original_name: string;
  mime_type: string;
  size: number;
  uploaded_by: string;
  role_id: string;
  created_at: string;
}

interface FileManagerProps {
  token: string;
  onAnalyze: (fileId: number) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso + 'Z').toLocaleString();
}

export function FileManager({ token, onAnalyze }: FileManagerProps) {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [toast, setToast] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const loadFiles = useCallback(() => {
    fetch('/api/files', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setFiles(data.files);
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  async function uploadFiles(fileList: FileList | File[]) {
    setUploading(true);
    const formData = new FormData();
    for (const file of fileList) {
      formData.append('file', file);
    }

    try {
      const res = await fetch('/api/files/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (data.ok) {
        showToast(`Uploaded ${data.files.length} file(s)`);
        loadFiles();
      } else {
        showToast(data.error || 'Upload failed');
      }
    } catch {
      showToast('Upload failed — server unreachable');
    }
    setUploading(false);
  }

  async function handleDelete(id: number, name: string) {
    try {
      const res = await fetch(`/api/files/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok) {
        showToast(`Deleted "${name}"`);
        loadFiles();
      }
    } catch {
      showToast('Delete failed');
    }
  }

  function handleDownload(id: number) {
    const a = document.createElement('a');
    a.href = `/api/files/${id}/download`;
    a.click();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files);
    }
  }

  return (
    <div className="file-manager">
      <div
        className={`file-dropzone ${dragOver ? 'file-dropzone--active' : ''} ${uploading ? 'file-dropzone--uploading' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <input
          accept=".csv,.json,.txt,.xlsx,.pdf"
          multiple
          onChange={(e) => e.target.files && uploadFiles(e.target.files)}
          ref={inputRef}
          style={{ display: 'none' }}
          type="file"
        />
        <div className="file-dropzone__content">
          <div className="file-dropzone__icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <p className="file-dropzone__title">
            {uploading ? 'Uploading...' : 'Drop files here or click to browse'}
          </p>
          <p className="file-dropzone__hint">
            Supports CSV, JSON, TXT, XLSX, PDF
          </p>
        </div>
      </div>

      {files.length === 0 ? (
        <div className="file-empty">
          <p>No files uploaded yet. Upload a CSV or JSON file to start analyzing data.</p>
        </div>
      ) : (
        <div className="file-table-wrapper">
          <table className="file-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Size</th>
                <th>Uploaded by</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => {
                const isAnalyzable = file.original_name.endsWith('.csv') || file.original_name.endsWith('.json');
                return (
                  <tr key={file.id}>
                    <td>
                      <div className="file-name-cell">
                        <span className="file-ext">
                          {file.original_name.split('.').pop()?.toUpperCase()}
                        </span>
                        <span>{file.original_name}</span>
                      </div>
                    </td>
                    <td>{formatSize(file.size)}</td>
                    <td>{file.uploaded_by}</td>
                    <td>{formatDate(file.created_at)}</td>
                    <td>
                      <div className="file-actions">
                        {isAnalyzable && (
                          <button
                            className="file-action-btn file-action-btn--analyze"
                            onClick={() => onAnalyze(file.id)}
                            title="Analyze"
                            type="button"
                          >
                            Analyze
                          </button>
                        )}
                        <button
                          className="file-action-btn"
                          onClick={() => handleDownload(file.id)}
                          title="Download"
                          type="button"
                        >
                          Download
                        </button>
                        <button
                          className="file-action-btn file-action-btn--delete"
                          onClick={() => handleDelete(file.id, file.original_name)}
                          title="Delete"
                          type="button"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
