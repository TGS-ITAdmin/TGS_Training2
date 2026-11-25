import React, { useEffect, useState } from 'react';
import { api } from '../../api';

function TraineeModal({ trainee, onSave, onClose }) {
  const [name, setName] = useState(trainee?.name || '');
  const [email, setEmail] = useState(trainee?.email || '');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!name.trim() || !email.trim()) return;
    if (!trainee && !password) { setError('Password is required'); return; }
    setSaving(true);
    setError('');
    try {
      if (trainee) {
        await api.updateTrainee(trainee.id, { name, email, password: password || undefined });
      } else {
        await api.createTrainee({ name, email, password });
      }
      onSave();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">{trainee ? 'Edit Trainee' : 'Add Trainee'}</div>
        <div className="fg">
          <label className="lbl">Full Name *</label>
          <input className="inp" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Juan dela Cruz" autoFocus />
        </div>
        <div className="fg">
          <label className="lbl">Email Address *</label>
          <input className="inp" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="trainee@email.com" />
        </div>
        <div className="fg">
          <label className="lbl">{trainee ? 'New Password (leave blank to keep current)' : 'Password *'}</label>
          <input className="inp" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={trainee ? 'Leave blank to keep current…' : 'Min. 6 characters'} />
        </div>
        {error && (
          <div style={{ background: '#fee2e2', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#dc2626' }}>{error}</div>
        )}
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-pri" onClick={handleSave} disabled={saving || !name.trim() || !email.trim()}>
            {saving ? 'Saving…' : trainee ? 'Save Changes' : 'Create Trainee'}
          </button>
        </div>
      </div>
    </div>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function BulkImportModal({ onDone, onClose }) {
  const [rows, setRows] = useState([]);        // parsed + validated
  const [fileName, setFileName] = useState('');
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState('');
  const [parseError, setParseError] = useState('');
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState(null);

  useEffect(() => { api.getClasses().then(setClasses).catch(() => {}); }, []);

  const downloadTemplate = async () => {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([
      ['Name', 'Email', 'Password'],
      ['Juan dela Cruz', 'juan@example.com', 'Welcome123'],
      ['Maria Santos', 'maria@example.com', 'Welcome123'],
    ]);
    ws['!cols'] = [{ wch: 28 }, { wch: 32 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Trainees');
    XLSX.writeFile(wb, 'trainee_accounts_template.xlsx');
  };

  const handleFile = async (file) => {
    if (!file) return;
    setParseError(''); setSummary(null); setRows([]); setFileName(file.name);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false });
      if (data.length < 2) { setParseError('The file has no data rows.'); return; }

      // Find columns by header name (any order); fall back to first three columns
      const head = data[0].map(h => String(h).toLowerCase().trim());
      const find = (...keys) => head.findIndex(h => keys.some(k => h.includes(k)));
      let iN = find('name'), iE = find('email', 'e-mail'), iP = find('pass', 'pwd');
      if (iN < 0 || iE < 0 || iP < 0) { iN = 0; iE = 1; iP = 2; }

      const seen = new Set();
      const parsed = [];
      data.slice(1).forEach((r, i) => {
        const name = String(r[iN] ?? '').trim();
        const email = String(r[iE] ?? '').toLowerCase().trim();
        const password = String(r[iP] ?? '').trim();
        if (!name && !email && !password) return; // skip blank lines
        let error = '';
        if (!name) error = 'Missing name';
        else if (!EMAIL_RE.test(email)) error = 'Invalid email';
        else if (password.length < 6) error = 'Password under 6 characters';
        else if (seen.has(email)) error = 'Duplicate email in file';
        if (!error) seen.add(email);
        parsed.push({ row: i + 2, name, email, password, error });
      });
      if (!parsed.length) { setParseError('No data rows found.'); return; }
      setRows(parsed);
    } catch (e) {
      setParseError('Could not read that file. Please use an .xlsx, .xls or .csv file.');
    }
  };

  const good = rows.filter(r => !r.error);
  const bad = rows.filter(r => r.error);

  const runImport = async () => {
    setImporting(true); setProgress(0);
    const all = [];
    let created = 0, enrolled = 0;
    try {
      const CHUNK = 100;
      for (let i = 0; i < good.length; i += CHUNK) {
        const chunk = good.slice(i, i + CHUNK).map(({ row, name, email, password }) => ({ row, name, email, password }));
        const r = await api.bulkCreateTrainees(chunk, classId || undefined);
        created += r.created; enrolled += r.enrolled; all.push(...r.results);
        setProgress(Math.min(i + CHUNK, good.length));
      }
    } catch (e) {
      setParseError('Import stopped: ' + e.message + '. Accounts already created are kept; re-uploading the same file will skip them.');
    }
    const failed = [
      ...bad.map(b => ({ row: b.row, name: b.name, email: b.email, reason: b.error })),
      ...all.filter(r => r.status === 'failed'),
    ].sort((a, b) => a.row - b.row);
    setSummary({ created, enrolled, failed });
    setImporting(false);
  };

  const downloadFailures = async (failed) => {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([['Row', 'Name', 'Email', 'Reason'], ...failed.map(f => [f.row, f.name, f.email, f.reason])]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Failed');
    XLSX.writeFile(wb, 'failed_accounts.xlsx');
  };

  return (
    <div className="modal-backdrop" onClick={importing ? undefined : onClose}>
      <div className="modal" style={{ maxWidth: 640, width: '95%' }} onClick={e => e.stopPropagation()}>
        <div className="modal-title">Import Trainees from Excel</div>

        {!summary && (
          <>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
              Upload an Excel (.xlsx) or CSV file with columns <b>Name</b>, <b>Email</b> and <b>Password</b>.{' '}
              <a href="#" onClick={e => { e.preventDefault(); downloadTemplate(); }}>Download template</a>
            </div>
            <div className="fg">
              <input type="file" accept=".xlsx,.xls,.csv" disabled={importing} onChange={e => handleFile(e.target.files[0])} />
            </div>
            <div className="fg">
              <label className="lbl">Also enroll in a class (optional)</label>
              <select className="inp" value={classId} onChange={e => setClassId(e.target.value)} disabled={importing}>
                <option value="">— Don't enroll —</option>
                {classes.map(c => <option key={c.id || c._id} value={c.id || c._id}>{c.name}</option>)}
              </select>
            </div>
          </>
        )}

        {parseError && (
          <div style={{ background: '#fee2e2', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#dc2626' }}>{parseError}</div>
        )}

        {!summary && rows.length > 0 && (
          <>
            <div style={{ fontSize: 13, marginBottom: 8 }}>
              <b>{fileName}</b>: <span style={{ color: '#16a34a', fontWeight: 600 }}>{good.length} ready</span>
              {bad.length > 0 && <span style={{ color: '#dc2626', fontWeight: 600 }}> · {bad.length} with problems (will be skipped)</span>}
            </div>
            <div style={{ maxHeight: 240, overflow: 'auto', border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, marginBottom: 14 }}>
              <table className="tbl" style={{ fontSize: 12 }}>
                <thead><tr><th>Row</th><th>Name</th><th>Email</th><th>Status</th></tr></thead>
                <tbody>
                  {rows.slice(0, 200).map(r => (
                    <tr key={r.row}>
                      <td>{r.row}</td><td>{r.name}</td><td>{r.email}</td>
                      <td style={{ color: r.error ? '#dc2626' : '#16a34a' }}>{r.error || 'OK'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 200 && <div style={{ padding: 8, fontSize: 12, color: 'var(--muted)' }}>Showing first 200 of {rows.length} rows…</div>}
            </div>
          </>
        )}

        {importing && <div style={{ fontSize: 13, marginBottom: 14 }}>Creating accounts… {progress} / {good.length}</div>}

        {summary && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ background: '#dcfce7', borderRadius: 8, padding: '12px 14px', fontSize: 14, color: '#166534', marginBottom: 10 }}>
              ✅ {summary.created} account{summary.created === 1 ? '' : 's'} created
              {classId && summary.enrolled > 0 && ` and enrolled in the class`}.
            </div>
            {summary.failed.length > 0 && (
              <>
                <div style={{ background: '#fee2e2', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: '#991b1b', marginBottom: 8 }}>
                  {summary.failed.length} row{summary.failed.length === 1 ? '' : 's'} skipped:
                  <ul style={{ margin: '6px 0 0 18px', maxHeight: 140, overflow: 'auto' }}>
                    {summary.failed.slice(0, 50).map((f, i) => <li key={i}>Row {f.row} ({f.email || f.name || 'blank'}): {f.reason}</li>)}
                  </ul>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => downloadFailures(summary.failed)}>Download skipped rows</button>
              </>
            )}
          </div>
        )}

        <div className="modal-footer">
          {summary ? (
            <button className="btn btn-pri" onClick={onDone}>Done</button>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={onClose} disabled={importing}>Cancel</button>
              <button className="btn btn-pri" onClick={runImport} disabled={importing || good.length === 0}>
                {importing ? 'Importing…' : `Create ${good.length} Account${good.length === 1 ? '' : 's'}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminTrainees() {
  const [trainees, setTrainees] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [editTrainee, setEditTrainee] = useState(null);
  const [search, setSearch] = useState('');

  const load = () => api.getTrainees().then(setTrainees);
  useEffect(() => { load(); }, []);

  const handleDelete = async (t) => {
    if (!confirm(`Delete trainee "${t.name}"? This will remove all their progress data.`)) return;
    await api.deleteTrainee(t.id);
    load();
  };

  const filtered = trainees.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className="topbar">
        <div className="topbar-title">Trainees</div>
        <div className="topbar-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => setShowBulk(true)}>
            📥 Import from Excel
          </button>
          <button className="btn btn-pri btn-sm" onClick={() => { setEditTrainee(null); setShowModal(true); }}>
            + Add Trainee
          </button>
        </div>
      </div>

      <div className="page-content">
        <div style={{ marginBottom: 16 }}>
          <input className="inp" style={{ maxWidth: 320 }} placeholder="Search by name or email…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">👥</div>
            <div className="empty-text">{search ? 'No trainees match your search' : 'No trainees yet'}</div>
            <div className="empty-sub">{!search && 'Add trainees so you can assign them to classes'}</div>
            {!search && (
              <button className="btn btn-pri" style={{ marginTop: 16 }} onClick={() => setShowModal(true)}>Add First Trainee</button>
            )}
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Member Since</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--blue)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                          {t.name[0]?.toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 600 }}>{t.name}</span>
                      </div>
                    </td>
                    <td style={{ color: 'var(--muted)' }}>{t.email}</td>
                    <td style={{ color: 'var(--muted)', fontSize: 12 }}>{new Date(t.created_at).toLocaleDateString()}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setEditTrainee(t); setShowModal(true); }}>Edit</button>
                        <button className="btn btn-bad btn-sm" onClick={() => handleDelete(t)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showBulk && (
        <BulkImportModal
          onDone={() => { setShowBulk(false); load(); }}
          onClose={() => { setShowBulk(false); load(); }}
        />
      )}

      {showModal && (
        <TraineeModal
          trainee={editTrainee}
          onSave={() => { setShowModal(false); load(); }}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
