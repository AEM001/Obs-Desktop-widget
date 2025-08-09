import { React, run } from "uebersicht";

// === Configuration ===
const API_BASE = "http://127.0.0.1:8787";
const AUTH_TOKEN = "random string"; // Must match server
const DATE_OFFSET_DAYS = 0; // 0=Today, -1=Yesterday

// === Main Component: Styles ===
export const className = `
  right: 20px;
  top: 20px;
  width: 460px;
  max-height: 70vh;
  background: rgba(28, 28, 30, 0.75);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 14px;
  color: #fefefe;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif;
  font-size: 13px;
  line-height: 1.5;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  overflow: hidden;
  display: flex;
  flex-direction: column;
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

  const load = React.useCallback(async () => {
    try {
      if (!saving) setState((s) => ({ ...s, loading: true, error: "" }));
      const data = await fetchPlan(date);
      setState({ loading: false, error: "", ...data });
      setDraft(data.content || "");
      setEditing(false);
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: String(e), file: "", content: "", exists: false, empty: true }));
    }
  }, [date, saving]);

  React.useEffect(() => {
    load();
    const timer = setInterval(load, 60000); // Auto-refresh every 60s
    return () => clearInterval(timer);
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
  };

  // --- Render ---

  const Btn = (props) => (
    <button {...props} className={`btn ${props.className || ''}`} />
  );

  const header = (
    <div className="header">
      <strong># Plan · {date}</strong>
      <div className="controls">
        {!editing ? (
          <Btn onClick={() => setEditing(true)}>Edit</Btn>
        ) : (
          <>
            <Btn onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Btn>
            <Btn onClick={() => { setEditing(false); setDraft(state.content || ""); }} className="btn-secondary">Cancel</Btn>
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
          padding: 12px 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          flex-shrink: 0;
        }
        .controls { display: flex; gap: 8px; }
        .btn {
          cursor: pointer;
          background: rgba(255, 255, 255, 0.15);
          border: none;
          color: #fefefe;
          border-radius: 7px;
          padding: 4px 10px;
          font-size: 12px;
          font-weight: 500;
          transition: background 0.2s ease;
        }
        .btn:hover { background: rgba(255, 255, 255, 0.25); }
        .btn:active { background: rgba(255, 255, 255, 0.1); }
        .btn.btn-secondary { background: rgba(255, 255, 255, 0.08); }
        .content-area {
          padding: 12px 16px;
          overflow-y: auto;
          flex-grow: 1;
        }
        .info-bar {
          padding: 0 16px 8px;
          font-size: 11px;
          opacity: 0.6;
        }
        .info-error { color: #ffb4b4; }
        .loading, .empty-state { padding: 20px; text-align: center; opacity: 0.7; }
        
        .task-item {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          margin-bottom: 2px;
          padding: 4px 6px;
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.2s ease;
        }
        .task-item:hover { background: rgba(255, 255, 255, 0.08); }
        .task-item.is-checked .task-text {
          opacity: 0.5;
          text-decoration: line-through;
        }
        .task-item input[type="checkbox"] {
          margin-top: 3px;
          pointer-events: none; /* Clicks are handled by the parent div */
        }
        .task-text, .bullet-item, .text-line { white-space: pre-wrap; }
        
        textarea.editor {
          width: 100%;
          min-height: 240px;
          background: rgba(0,0,0,0.2);
          color: #fefefe;
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 8px;
          padding: 10px;
          outline: none;
          font-family: "SF Mono", "Monaco", monospace;
          font-size: 12px;
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