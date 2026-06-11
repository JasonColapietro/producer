import { ensureOwnerChannel, jobFinals, jobThumbnails, listJobs } from "@/lib/data";
import { approveJob, createVideo, retryJob } from "./actions";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const channel = await ensureOwnerChannel();
  const jobs = await listJobs(channel.id);
  const ids = jobs.map((j) => j.id);
  const thumbs = await jobThumbnails(ids);
  const finals = await jobFinals(ids);
  const connected = Boolean(channel.youtubeRefreshToken);

  return (
    <main className="wrap">
      <div className="brand">
        <h1>
          Tube<span className="dot">●</span>Forge
        </h1>
        <span className="mode-tag">{channel.name}</span>
      </div>
      <p className="sub">Faceless &amp; avatar videos on autopilot — your keys, your channel, pennies per render.</p>

      {!connected && (
        <div className="banner">
          <span>Videos are built ready to <strong>download</strong> by default. Connect YouTube only if you want auto-publishing.</span>
          <a className="btn btn-sm" href="/api/youtube/connect">
            Connect YouTube
          </a>
        </div>
      )}

      <div className="grid split">
        <section className="card">
          <h2>New video</h2>
          <form action={createVideo}>
            <label htmlFor="topic">Topic</label>
            <textarea id="topic" name="topic" placeholder="e.g. Why the Roman concrete recipe still beats modern cement" required />

            <div className="row">
              <div>
                <label htmlFor="mode">Format</label>
                <select id="mode" name="mode" defaultValue="faceless">
                  <option value="faceless">Faceless (B-roll)</option>
                  <option value="avatar">Avatar (you)</option>
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
              Queue it
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
                      {j.status === "failed" ? <span className="err">{j.error}</span> : <span className="stage">stage: {j.stage}</span>}
                    </div>
                  </div>
                  <span className={`pill ${j.status}`}>{j.status.replace("_", " ")}</span>
                  <div className="actions">
                    {finals.get(j.id) && (j.status === "completed" || j.status === "published") && (
                      <a className="btn btn-sm" href={finals.get(j.id)} download>
                        Download
                      </a>
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
    </main>
  );
}
