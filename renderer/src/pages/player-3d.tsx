export default function Player3DPage() {
  // Wouter's useLocation() strips the query string, so read it directly from
  // the browser URL so that ?src= gets forwarded into the iframe on load.
  const search = typeof window !== "undefined" ? window.location.search : "";

  const autoFullscreen = (() => {
    try {
      const raw = localStorage.getItem("vvm_settings");
      return raw ? !!JSON.parse(raw).autoFullscreen : false;
    } catch { return false; }
  })();

  const src = autoFullscreen
    ? `/player-3d.html${search}${search ? "&" : "?"}fs=1`
    : `/player-3d.html${search}`;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "#0c0c0e" }}>
      <iframe
        src={src}
        style={{ width: "100%", height: "100%", border: "none", display: "block" }}
        allow="fullscreen"
        title="3D Player"
      />
    </div>
  );
}
