import { ensureOwnerChannel, jobFinals, jobScripts, jobThumbnails, listJobs } from "@/lib/data";
import SiteNav from "./components/SiteNav";
import { approveJob, createVideo, retryJob } from "./actions";

export const dynamic = "force-dynamic";

// Rough position of each stage in the build, for the processing progress bar.
const STAGE_PCT: Record<string, number> = {
  ideate: 4,
  script: 12,
  voice: 28,
  visuals: 48,
  avatar: 48,
  captions: 68,
  assemble: 80,
  thumbnail: 88,
  publish: 95,
  done: 100,
};

export default async function Dashboard() {
  const channel = await ensureOwnerChannel();
  const jobs = await listJobs(channel.id);
  const ids = jobs.map((j) => j.id);
  const thumbs = await jobThumbnails(ids);
  const finals = await jobFinals(ids);
  const scripts = await jobScripts(ids);
  const connected = Boolean(channel.youtubeRefreshToken);
  const kieEnabled = Boolean(process.env.KIE_API_KEY);

  return (
    <main className="wrap">
      <SiteNav active="studio" channelName={channel.name} />

      <section className="hero">
        <h1>
          Type a topic. <em>Get a finished video.</em>
        </h1>
        <p className="sub">
          Claude writes the script, Kie&nbsp;AI shoots the cinematic footage, your cloned voice narrates,
          captions burn in, and the MP4 lands ready to publish — for pennies per render.
        </p>
        <div className="engines" aria-label="Engines">
          <span className="chip new"><span className="dot-ico" />Kie AI video{kieEnabled ? "" : " · add KIE_API_KEY"}</span>
          <span className="chip"><b>Claude</b>&nbsp;scripts</span>
          <span className="chip"><b>XTTS-v2</b>&nbsp;voice clone</span>
          <span className="chip"><b>Whisper</b>&nbsp;captions</span>
          <span className="chip"><b>FFmpeg</b>&nbsp;assembly</span>
        </div>
      </section>

      <nav className="ecosystem" aria-label="Suede ecosystem">
        <a href="https://social.suedeai.ai">
          <strong>Suede Social</strong>
          <span>get feedback before the clip ships</span>
        </a>
        <a href="https://ip.suedeai.ai">
          <strong>Suede IP</strong>
          <span>protect original work first</span>
        </a>
        <a href="https://strumly.suedeai.ai">
          <strong>Strumly</strong>
          <span>practice tools for guitar people</span>
        </a>
        <a href="https://muse.suedeai.ai">
          <strong>Suede Studio Muse</strong>
          <span>gear, tone, and song companion</span>
        </a>
      </nav>

      {!connected && (
        <div className="banner">
          <span>Videos are built ready to <strong>download</strong> by default. Connect YouTube only if you want auto-publishing.</span>
          <a className="btn btn-sm" href="/api/youtube/connect">
            Connect YouTube
          </a>
        </div>
      )}

      <div className="grid split">
        <section className="card spotlight">
          <h2>New video</h2>
          <form action={createVideo}>
            <label htmlFor="topic">Topic</label>
            <textarea id="topic" name="topic" placeholder="e.g. Why the Roman concrete recipe still beats modern cement" required />

            <label htmlFor="visuals">Visuals</label>
            <select id="visuals" name="visuals" defaultValue={kieEnabled ? "ai" : "stock"}>
              <option value="ai">Cinematic AI video (Kie)</option>
              <option value="stock">Stock B-roll (free)</option>
            </select>
            <p className="hint">
              AI visuals generate a bespoke shot per scene — cents per scene, falls back to stock automatically if it can&apos;t.
            </p>

            <div className="row">
              <div>
                <label htmlFor="mode">Format</label>
                <select id="mode" name="mode" defaultValue="faceless">
                  <option value="faceless">Faceless</option>
                  <option value="avatar">Avatar (AI face)</option>
                  <option value="voiceover">Voiceover (your voice)</option>
                </select>
              </div>
              <div>
                <label htmlFor="target">Destination</label>
                <select id="target" name="target" defaultValue="download">
                  <option value="download">Download (I&apos;ll upload)</option>
                  <option value="youtube">Auto-publish to YouTube</option>
                </select>
              </div>
            </div>

            <button className="full" type="submit">
              Render it
            </button>
          </form>
        </section>

        <section className="card">
          <h2>Pipeline · {jobs.length}</h2>
          {jobs.length === 0 ? (
            <p className="empty">No videos yet. Queue your first one →</p>
          ) : (
            <div className="jobs">
              {jobs.map((j) => (
                <div className="job" key={j.id}>
                  {thumbs.get(j.id) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="thumb" src={thumbs.get(j.id)} alt="" />
                  ) : (
                    <div className="thumb" />
                  )}
                  <div className="meta">
                    <div className="title">{j.title ?? j.topic}</div>
                    <div className="topic">
                      <span className="mode-tag">{j.mode}</span>{" "}
                      {j.options?.visuals === "ai" && <span className="mode-tag">AI video</span>}{" "}
                      {j.status === "failed" ? <span className="err">{j.error}</span> : <span className="stage">stage: {j.stage}</span>}
                    </div>
                    {(j.status === "processing" || j.status === "publishing") && (
                      <div className="progress" aria-hidden>
                        <i style={{ width: `${STAGE_PCT[j.stage] ?? 10}%` }} />
                      </div>
                    )}
                  </div>
                  <span className={`pill ${j.status}`}>{j.status.replace(/_/g, " ")}</span>
                  <div className="actions">
                    {finals.get(j.id) && (j.status === "completed" || j.status === "published") && (
                      <a className="btn btn-sm" href={finals.get(j.id)} download>
                        Download
                      </a>
                    )}
                    {j.status === "needs_voiceover" && (
                      <>
                        {scripts.get(j.id) && (
                          <a className="btn-ghost btn-sm" href={scripts.get(j.id)} target="_blank" rel="noreferrer">
                            Read script
                          </a>
                        )}
                        <form action="/api/voiceover" method="POST" encType="multipart/form-data">
                          <input type="hidden" name="id" value={j.id} />
                          <input type="file" name="audio" accept="audio/*" required style={{ fontSize: "0.75rem" }} />
                          <button className="btn btn-sm" type="submit">Upload voiceover</button>
                        </form>
                      </>
                    )}
                    {j.status === "needs_review" && (
                      <form action={approveJob}>
                        <input type="hidden" name="id" value={j.id} />
                        <button className="btn-sm" type="submit">
                          Approve
                        </button>
                      </form>
                    )}
                    {j.status === "failed" && (
                      <form action={retryJob}>
                        <input type="hidden" name="id" value={j.id} />
                        <button className="btn-ghost btn-sm" type="submit">
                          Retry
                        </button>
                      </form>
                    )}
                    {j.status === "published" && j.publishedVideoId && (
                      <a className="btn-ghost btn-sm" href={`https://youtu.be/${j.publishedVideoId}`} target="_blank" rel="noreferrer">
                        View
                      </a>
                    )}
                    <a className="btn-ghost btn-sm" href={`/job/${j.id}`}>
                      Details
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <footer className="footer">
        <span>Producer — the AI video studio by Suede Labs.</span>
        <span>
          <a href="https://suedeai.ai">suedeai.ai</a>
        </span>
      </footer>
    </main>
  );
}
