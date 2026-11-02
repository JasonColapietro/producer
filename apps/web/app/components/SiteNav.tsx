interface SiteNavProps {
  active: "studio" | "autopilot" | "none";
  channelName?: string;
}

/** Sticky institutional topbar shared by every page. */
export default function SiteNav({ active, channelName }: SiteNavProps) {
  return (
    <header className="topbar">
      <a className="wordmark" href="/">
        <span className="mark" aria-hidden />
        Suede <em>Cinema</em>
      </a>
      {channelName && <span className="mode-tag">{channelName}</span>}
      <nav className="topnav" aria-label="Primary">
        <a href="/" className={active === "studio" ? "active" : undefined}>
          Studio
        </a>
        <a href="/plans" className={active === "autopilot" ? "active" : undefined}>
          Autopilot
        </a>
      </nav>
      <p className="founder-credit">
        A product from <a href="https://suedeai.app">SuedeAI.app</a>
        {" · Founded by "}<a href="https://suedeai.ai/founder">Jason Colapietro</a>
      </p>
    </header>
  );
}
