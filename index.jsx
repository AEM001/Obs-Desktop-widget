import { React, run } from "uebersicht";

// === Configuration ===
const API_BASE = "http://127.0.0.1:8787";
const AUTH_TOKEN = "random string"; // Must match server
const DATE_OFFSET_DAYS = 0; // 0=Today, -1=Yesterday

// === Main Component: Styles ===
export const className = `
  right: 20px;
  top: 20px;
  width: 480px;
  max-height: 75vh;
  background: linear-gradient(145deg, rgba(240, 248, 255, 0.95), rgba(230, 245, 255, 0.98));
  -webkit-backdrop-filter: blur(20px);
  backdrop-filter: blur(20px);
  border-radius: 18px;
  border: 1px solid rgba(59, 130, 246, 0.2);
  color: #1e293b;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif;
  font-size: 13px;
  line-height: 1.5;
  box-shadow: 
    0 20px 40px rgba(59, 130, 246, 0.15),
    0 8px 16px rgba(59, 130, 246, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.8);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: all 0.3s ease;
`;
export const refreshFrequency = false; // Use manual refresh

// === API & Helpers ===
const fmtDate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const todayWithOffset = () => {
  const d = new Date();
  if (DATE_OFFSET_DAYS) d.setDate(d.getDate() + DATE_OFFSET_DAYS);
  return fmtDate(d);
};

const fetchPlan = async (date) => {
  const cmd = `curl -sS -H "X-Auth: ${AUTH_TOKEN}" "${API_BASE}/planning?date=${encodeURIComponent(date)}"`;
  const out = await run(cmd);
  try {
    return JSON.parse(out);
  } catch (e) {
    throw new Error(out || String(e));
  }
};

const savePlan = async (date, content) => {
  const payload = JSON.stringify({ date, content });
  const cmd = `curl -sS -X POST -H "X-Auth: ${AUTH_TOKEN}" -H "Content-Type: application/json" --data-binary @- "${API_BASE}/planning"`;
  const out = await run(`cat <<'EOF' | ${cmd}\n${payload}\nEOF`);
  try {
    return JSON.parse(out);
  } catch (e) {
    throw new Error(out || String(e));
  }
};

// === Main Functional Component ===
function PlanInner() {
  const [state, setState] = React.useState({ loading: true, error: "", file: "", content: "", exists: true, empty: false });
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [date, setDate] = React.useState(todayWithOffset());
  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      if (!saving) setState((s) => ({ ...s, loading: true, error: "" }));
      const data = await fetchPlan(date);
      setState({ loading: false, error: "", ...data });
      // 只在非编辑状态下更新草稿，避免覆盖用户正在编辑的内容
      if (!editing) {
        setDraft(data.content || "");
        setHasUnsavedChanges(false);
      }
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: String(e), file: "", content: "", exists: false, empty: true }));
    }
  }, [date, saving, editing]);

  React.useEffect(() => {
    load();
    // 取消自动刷新功能
  }, [load]);

  const onSave = async () => {
    try {
      setSaving(true);
      await savePlan(date, draft);
      setSavedAt(new Date().toLocaleTimeString());
    } catch (e) {
      setState((s) => ({ ...s, error: String(e) }));
    } finally {
      setSaving(false);
      setEditing(false);
      setHasUnsavedChanges(false);
      await load();
    }
  };

  const onToggleTask = async (lineIndex) => {
    const lines = (state.content || "").split(/\r?\n/);
    if (lines.length <= lineIndex) return;

    const line = lines[lineIndex];
    const mTask = line.match(/^(\s*-\s*\[)( )(\]\s*.*)$/); // Incomplete
    const mTaskDone = line.match(/^(\s*-\s*\[)(x)(\]\s*.*)$/i); // Complete

    if (mTask) {
      lines[lineIndex] = `${mTask[1]}x${mTask[3]}`;
    } else if (mTaskDone) {
      lines[lineIndex] = `${mTaskDone[1]} ${mTaskDone[3]}`;
    } else {
      return; // Not a toggleable line
    }

    const newContent = lines.join("\n");
    setState(s => ({ ...s, content: newContent })); // Optimistic update
    try {
      setSaving(true);
      await savePlan(date, newContent);
      setSavedAt(new Date().toLocaleTimeString());
    } catch (e) {
      setState((s) => ({ ...s, error: String(e) }));
      await load(); // Revert on error
    } finally {
      setSaving(false);
    }
  };

  const formatAsTasks = () => {
    const lines = (draft || "").split(/\r?\n/);
    const out = lines.map((ln) => {
      if (/^\s*$/.test(ln)) return "";
      if (/^\s*-\s*\[[ xX]\]/.test(ln)) return ln;
      if (/^\s*-\s+/.test(ln)) return ln.replace(/^\s*-\s+/, "- [ ] ");
      return `- [ ] ${ln}`;
    }).join("\n");
    setDraft(out);
    setHasUnsavedChanges(true);
  };

  const openInObsidian = async () => {
    if (!state.file) return;
    
    // 从完整路径提取vault名称和相对路径
    // 例如: /Users/Mac/Documents/Albert-obs/DailyNotes/24/2024-01-15.md
    // 提取: vault=Albert-obs, file=DailyNotes/24/2024-01-15.md
    const vaultMatch = state.file.match(/\/([^\/]+)\/DailyNotes\//);
    const vaultName = vaultMatch ? vaultMatch[1] : "Albert-obs";
    
    const relativePathMatch = state.file.match(/DailyNotes\/.*\.md$/);
    const relativePath = relativePathMatch ? relativePathMatch[0] : "";
    
    if (relativePath) {
      const obsidianUri = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(relativePath)}`;
      const cmd = `open "${obsidianUri}"`;
      try {
        await run(cmd);
      } catch (e) {
        console.error("Failed to open in Obsidian:", e);
      }
    }
  };

  // 检测草稿变化
  React.useEffect(() => {
    if (editing) {
      setHasUnsavedChanges(draft !== (state.content || ""));
    }
  }, [draft, state.content, editing]);

  // --- Render ---

  const Btn = (props) => (
    <button {...props} className={`btn ${props.className || ''}`} />
  );

  const header = (
    <div className="header">
      <div className="header-title">
        <strong># Plan · {date}</strong>
        {editing && hasUnsavedChanges && (
          <span className="unsaved-indicator">● Unsaved changes</span>
        )}
      </div>
      <div className="controls">
        {!editing ? (
          <>
            <Btn onClick={load} className="btn-refresh" title="Refresh" disabled={state.loading}>
              ↻
            </Btn>
            <Btn onClick={() => setEditing(true)}>Edit</Btn>
            {state.file && (
              <Btn onClick={openInObsidian} className="btn-obsidian" title="Open in Obsidian">
                📝 Obsidian
              </Btn>
            )}
          </>
        ) : (
          <>
            <Btn onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Btn>
            <Btn onClick={() => { 
              if (hasUnsavedChanges && !confirm("You have unsaved changes. Are you sure you want to cancel?")) {
                return;
              }
              setEditing(false); 
              setDraft(state.content || ""); 
              setHasUnsavedChanges(false);
            }} className="btn-secondary">Cancel</Btn>
            <Btn onClick={formatAsTasks} className="btn-secondary">Format as Tasks</Btn>
          </>
        )}
      </div>
    </div>
  );

  const infoBar = (
    <div className="info-bar">
      {state.file && <div className="info-file"><code>{state.file}</code></div>}
      {state.error && <div className="info-error">Error: {state.error}</div>}
      {savedAt && <div className="info-saved">Last saved: {savedAt}</div>}
      {!state.exists && <div className="info-tip">Tip: File does not exist. It will be created on save.</div>}
    </div>
  );

  const renderMarkdown = (md) => {
    const lines = (md || "").split(/\r?\n/);
    if (!lines.length || (lines.length === 1 && lines[0] === '')) return <div className="empty-state">(Empty)</div>;

    return lines.map((raw, idx) => {
      const line = raw.replace(/\t/g, "    ");
      const mTask = line.match(/^(\s*-\s*\[)([xX ])(\]\s*(.*))$/);
      if (mTask) {
        const checked = mTask[2].toLowerCase() === "x";
        const text = mTask[4] || "";
        return (
          <div key={idx} className={`task-item ${checked ? 'is-checked' : ''}`} onClick={() => onToggleTask(idx)}>
            <input type="checkbox" readOnly checked={checked} />
            <div className="task-text">{text}</div>
          </div>
        );
      }
      const mBullet = line.match(/^\s*-\s+(.*)$/);
      if (mBullet) {
        return <div key={idx} className="bullet-item">• {mBullet[1]}</div>;
      }
      if (/^\s*$/.test(line)) return <div key={idx} style={{ height: 4 }} />;
      return <div key={idx} className="text-line">{line}</div>;
    });
  };

  if (state.loading && !saving) return <div className="loading">Loading...</div>;

  return (
    <>
      <style>{`
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(147, 197, 253, 0.08));
          border-bottom: 1px solid rgba(59, 130, 246, 0.15);
          backdrop-filter: blur(10px);
          flex-shrink: 0;
        }
        .header-title {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .header strong {
          font-size: 14px;
          font-weight: 600;
          background: linear-gradient(135deg, #1e40af, #3b82f6);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .unsaved-indicator {
          font-size: 11px;
          color: #f59e0b;
          font-weight: 500;
          opacity: 0.9;
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.9; }
          50% { opacity: 0.6; }
        }
        .controls { 
          display: flex; 
          gap: 10px; 
        }
        .btn {
          cursor: pointer;
          background: linear-gradient(135deg, #3b82f6, #2563eb);
          border: 1px solid rgba(59, 130, 246, 0.3);
          color: #ffffff;
          border-radius: 8px;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 500;
          transition: all 0.2s ease;
          backdrop-filter: blur(10px);
          box-shadow: 0 2px 8px rgba(59, 130, 246, 0.25);
        }
        .btn:hover { 
          background: linear-gradient(135deg, #2563eb, #1d4ed8);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.35);
        }
        .btn:active { 
          background: linear-gradient(135deg, #1d4ed8, #1e40af);
          transform: translateY(0px);
        }
        .btn.btn-secondary { 
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(147, 197, 253, 0.08));
          border: 1px solid rgba(59, 130, 246, 0.2);
          color: #3b82f6;
        }
        .btn.btn-secondary:hover {
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(147, 197, 253, 0.12));
          color: #2563eb;
        }
        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none !important;
        }
        .btn.btn-obsidian {
          background: linear-gradient(135deg, #7c3aed, #6d28d9);
          border: 1px solid rgba(124, 58, 237, 0.3);
          color: #ffffff;
        }
        .btn.btn-obsidian:hover {
          background: linear-gradient(135deg, #6d28d9, #5b21b6);
          box-shadow: 0 4px 12px rgba(124, 58, 237, 0.35);
        }
        .btn.btn-refresh {
          background: linear-gradient(135deg, #3b82f6, #2563eb);
          border: 1px solid rgba(59, 130, 246, 0.3);
          color: #ffffff;
          font-size: 14px;
          font-weight: bold;
          min-width: 32px;
          padding: 6px 8px;
        }
        .btn.btn-refresh:hover {
          background: linear-gradient(135deg, #2563eb, #1d4ed8);
          transform: translateY(-1px) rotate(180deg);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.35);
          transition: all 0.3s ease;
        }
        .btn.btn-refresh:active {
          transform: translateY(0px) rotate(360deg);
        }
        .content-area {
          padding: 16px 20px;
          overflow-y: auto;
          flex-grow: 1;
          background: rgba(255, 255, 255, 0.3);
        }
        .info-bar {
          padding: 0 0 12px;
          font-size: 11px;
          opacity: 0.8;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .info-file {
          background: rgba(59, 130, 246, 0.1);
          color: #1e40af;
          padding: 4px 8px;
          border-radius: 6px;
          font-family: "SF Mono", "Monaco", monospace;
        }
        .info-error { 
          color: #dc2626; 
          background: rgba(220, 38, 38, 0.1);
          padding: 6px 10px;
          border-radius: 6px;
          border-left: 3px solid #dc2626;
        }
        .info-saved {
          color: #059669;
          background: rgba(5, 150, 105, 0.1);
          padding: 4px 8px;
          border-radius: 6px;
        }
        .info-tip {
          color: #3b82f6;
          background: rgba(59, 130, 246, 0.1);
          padding: 6px 10px;
          border-radius: 6px;
          border-left: 3px solid #3b82f6;
        }
        .loading, .empty-state { 
          padding: 30px; 
          text-align: center; 
          opacity: 0.7;
          font-style: italic;
          color: #64748b;
        }
        
        .task-item {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 4px;
          padding: 8px 10px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
          background: rgba(255, 255, 255, 0.5);
          border: 1px solid rgba(59, 130, 246, 0.1);
        }
        .task-item:hover { 
          background: rgba(59, 130, 246, 0.1);
          border: 1px solid rgba(59, 130, 246, 0.2);
          transform: translateX(2px);
        }
        .task-item.is-checked {
          opacity: 0.6;
          background: rgba(148, 163, 184, 0.1);
        }
        .task-item.is-checked .task-text {
          text-decoration: line-through;
          color: #64748b;
        }
        .task-item input[type="checkbox"] {
          margin-top: 2px;
          pointer-events: none;
          width: 16px;
          height: 16px;
          accent-color: #3b82f6;
        }
        .task-text { 
          white-space: pre-wrap; 
          flex-grow: 1;
          line-height: 1.4;
          color: #1e293b;
        }
        .bullet-item { 
          white-space: pre-wrap;
          padding: 4px 0;
          margin-left: 8px;
          color: #475569;
        }
        .text-line { 
          white-space: pre-wrap;
          padding: 2px 0;
          line-height: 1.4;
          color: #334155;
        }
        
        textarea.editor {
          width: 100%;
          min-height: 280px;
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.8), rgba(248, 250, 252, 0.9));
          color: #1e293b;
          border: 1px solid rgba(59, 130, 246, 0.3);
          border-radius: 12px;
          padding: 16px;
          outline: none;
          font-family: "SF Mono", "Monaco", "Consolas", monospace;
          font-size: 13px;
          line-height: 1.5;
          resize: vertical;
          transition: all 0.2s ease;
          backdrop-filter: blur(10px);
          box-shadow: inset 0 2px 4px rgba(59, 130, 246, 0.05);
        }
        textarea.editor:focus {
          border-color: #3b82f6;
          box-shadow: 
            0 0 0 3px rgba(59, 130, 246, 0.1),
            inset 0 2px 4px rgba(59, 130, 246, 0.05);
        }
        textarea.editor::placeholder {
          color: #94a3b8;
          font-style: italic;
        }
      `}</style>
      {header}
      <div className="content-area">
        {infoBar}
        {!editing ? (
          <div>{renderMarkdown(state.content)}</div>
        ) : (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="- [ ] Task A\n- [ ] Task B"
            className="editor"
          />
        )}
      </div>
    </>
  );
}

export const render = (props) => <PlanInner {...props} />;