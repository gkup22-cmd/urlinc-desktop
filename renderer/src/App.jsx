import { useState, useEffect } from "react";

const API = "http://127.0.0.1:3847/api";

export default function App() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetch(`${API}/videos`)
      .then((r) => r.json())
      .then(setVideos)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function addVideo(e) {
    e.preventDefault();
    if (!title.trim() || !url.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`${API}/videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, url }),
      });
      const video = await res.json();
      setVideos((v) => [video, ...v]);
      setTitle("");
      setUrl("");
    } catch (err) {
      console.error(err);
    } finally {
      setAdding(false);
    }
  }

  async function removeVideo(id) {
    await fetch(`${API}/videos/${id}`, { method: "DELETE" });
    setVideos((v) => v.filter((x) => x.id !== id));
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "32px 16px" }}>
      <header style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.5px" }}>
          URLinc <span style={{ color: "var(--accent)" }}>Desktop</span>
        </h1>
        <p style={{ color: "var(--muted)", marginTop: 4 }}>Your local link library</p>
      </header>

      <form onSubmit={addVideo} style={{ display: "flex", gap: 8, marginBottom: 32 }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          style={inputStyle}
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          style={{ ...inputStyle, flex: 2 }}
        />
        <button type="submit" disabled={adding} style={btnStyle}>
          {adding ? "Adding…" : "Add"}
        </button>
      </form>

      {loading ? (
        <p style={{ color: "var(--muted)" }}>Loading…</p>
      ) : videos.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>No links yet — add one above.</p>
      ) : (
        <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
          {videos.map((v) => (
            <li
              key={v.id}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "12px 16px",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {v.title}
                </div>
                <a
                  href={v.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--muted)", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}
                >
                  {v.url}
                </a>
              </div>
              <button
                onClick={() => removeVideo(v.id)}
                style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 18, lineHeight: 1, padding: "0 4px" }}
                title="Remove"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const inputStyle = {
  flex: 1,
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  color: "var(--text)",
  padding: "8px 12px",
  fontSize: 14,
  outline: "none",
};

const btnStyle = {
  background: "var(--accent)",
  border: "none",
  borderRadius: 6,
  color: "#fff",
  padding: "8px 16px",
  fontWeight: 600,
  fontSize: 14,
};
