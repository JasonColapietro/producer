interface SiteNavProps {
  active: "studio" | "autopilot" | "none";
  channelName?: string;
}

/** Floating glass top bar shared by every page. */
export default function SiteNav({ active, channelName }: SiteNavProps) {
  return (
    <header className="topbar">
      <a className="wordmark" href="/">
        <span className="mark" aria-hidden />
        Producer <span className="by">by Suede Labs</span>
      </a>
      {channelName && <span className="mode-tag">{channelName}</span>}
      <nav className="topnav" aria-label="Primary">
        <a href="/" className={active === "studio" ? "active" : undefined}>
          Studio
        </a>
        <a href="/plans" className={active === "autopilot" ? "active" : undefined}>
          ⚡ Autopilot
        </a>
      </nav>
    </header>
  );
}
