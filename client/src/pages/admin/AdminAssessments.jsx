import React, { useEffect, useState, useRef } from 'react';
import { api } from '../../api';

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function AdminAssessments() {
  const [assessments, setAssessments] = useState([]);
  const [queue, setQueue] = useState([]); // { file, status: 'pending'|'uploading'|'done'|'error', error }
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const load = () => api.getAssessments().then(setAssessments);
  useEffect(() => { load(); }, []);

  const handleSelectFiles = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setError('');
    setQueue(prev => [...prev, ...files.map(file => ({ file, status: 'pending', error: null }))]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeQueued = (idx) => {
    setQueue(prev => prev.filter((_, i) => i !== idx));
  };

  const allDone = queue.length > 0 && queue.every(q => q.status === 'done' || q.status === 'error');

  const handleUploadAll = async () => {
    setUploading(true);
    setError('');
    for (let i = 0; i < queue.length; i++) {
      if (queue[i].status === 'done') continue; // don't re-upload successes on retry
      setQueue(prev => prev.map((q, idx) => (idx === i ? { ...q, status: 'uploading' } : q)));
      try {
        const fd = new FormData();
        fd.append('file', queue[i].file);
        await api.uploadAssessment(fd);
        setQueue(prev => prev.map((q, idx) => (idx === i ? { ...q, status: 'done' } : q)));
      } catch (err) {
        setQueue(prev => prev.map((q, idx) => (idx === i ? { ...q, status: 'error', error: err.message || 'Upload failed' } : q)));
      }
    }
    setUploading(false);
    load();
  };

  const clearQueue = () => setQueue([]);

  const handleDelete = async (filename) => {
    if (!confirm(`Delete "${filename}"?\n\nAny modules using this assessment will break.`)) return;
    try {
      await api.deleteAssessment(filename);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <div className="topbar">
        <div className="topbar-title">Assessment Library</div>
        <div className="topbar-actions">
          <label className={`btn btn-pri btn-sm${uploading ? ' btn-disabled' : ''}`} style={{ cursor: uploading ? 'not-allowed' : 'pointer' }}>
            + Upload Assessments
            <input ref={fileRef} type="file" accept=".html,.htm" multiple style={{ display: 'none' }} onChange={handleSelectFiles} disabled={uploading} />
          </label>
        </div>
      </div>

      <div className="page-content">
        <div className="info-box">
          Upload HTML assessment files here. Once uploaded, you can select them when adding an Assessment module to any class.
          Files must be <strong>.html</strong>. Max 10 MB each. You can select multiple files at once.
        </div>

        {error && (
          <div className="warn-box" style={{ marginBottom: 16 }}>{error}</div>
        )}

        {queue.length > 0 && (
          <div className="card" style={{ marginBottom: 20, padding: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>
              {queue.length} file{queue.length !== 1 ? 's' : ''} queued
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {queue.map((q, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--bdr)', background: 'rgba(13,33,55,.4)' }}>
                  <span style={{ fontSize: 18 }}>📋</span>
                  <span style={{ flex: 1, fontSize: 13 }}>{q.file.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 70, textAlign: 'right' }}>
                    {q.status === 'pending' && 'Queued'}
                    {q.status === 'uploading' && 'Uploading…'}
                    {q.status === 'done' && '✅ Done'}
                    {q.status === 'error' && '❌ Failed'}
                  </span>
                  {q.status === 'pending' && !uploading && (
                    <button className="btn btn-ghost btn-sm" onClick={() => removeQueued(idx)}>✕</button>
                  )}
                </div>
              ))}
            </div>
            {queue.some(q => q.status === 'error') && (
              <div className="warn-box" style={{ marginBottom: 12 }}>
                Some files failed. Click "Upload All" again to retry just the failed ones — successful ones won't be re-uploaded.
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              {!allDone && (
                <button className="btn btn-pri btn-sm" disabled={uploading} onClick={handleUploadAll}>
                  {uploading ? 'Uploading…' : `Upload All (${queue.filter(q => q.status !== 'done').length})`}
                </button>
              )}
              <button className="btn btn-ghost btn-sm" disabled={uploading} onClick={clearQueue}>
                {allDone ? 'Clear' : 'Cancel'}
              </button>
            </div>
          </div>
        )}

        {assessments.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">📋</div>
            <div className="empty-text">No assessments uploaded yet</div>
            <div className="empty-sub">Upload one or more HTML assessment files to get started</div>
            <label className="btn btn-pri" style={{ marginTop: 16, cursor: 'pointer' }}>
              Upload Assessments
              <input type="file" accept=".html,.htm" multiple style={{ display: 'none' }} onChange={handleSelectFiles} />
            </label>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>File Name</th>
                  <th>Size</th>
                  <th>Uploaded</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {assessments.map(a => (
                  <tr key={a.filename}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 20 }}>📋</span>
                        <div>
                          <div style={{ fontWeight: 600 }}>{a.filename}</div>
                          <a
                            href={`/assessment/assessments/${encodeURIComponent(a.filename)}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ fontSize: 11, color: 'var(--blue)' }}
                          >
                            Preview ↗
                          </a>
                        </div>
                      </div>
                    </td>
                    <td style={{ color: 'var(--muted)' }}>{formatSize(a.size)}</td>
                    <td style={{ color: 'var(--muted)', fontSize: 12 }}>
                      {new Date(a.uploadedAt).toLocaleDateString()}
                    </td>
                    <td>
                      <button className="btn btn-bad btn-sm" onClick={() => handleDelete(a.filename)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
