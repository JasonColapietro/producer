import { notFound } from "next/navigation";
import { db, schema } from "@producer/core/web";
import { eq } from "drizzle-orm";
import CopyButton from "./CopyButton";
import SiteNav from "../../components/SiteNav";

export const dynamic = "force-dynamic";

// Shape produced by the script worker
interface ScriptScene {
  narration: string;
  brollKeywords?: string[];
  visualPrompt?: string;
}
interface ScriptDoc {
  title?: string;
  description?: string;
  tags?: string[];
  scenes?: ScriptScene[];
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Load job
  const [job] = await db()
    .select()
    .from(schema.jobs)
    .where(eq(schema.jobs.id, id))
    .limit(1);

  if (!job) notFound();

  // Load channel
  const [channel] = await db()
    .select()
    .from(schema.channels)
    .where(eq(schema.channels.id, job.channelId))
    .limit(1);

  // Load all assets for this job
  const assets = await db()
    .select()
    .from(schema.assets)
    .where(eq(schema.assets.jobId, id));

  // Helper: pick the most recent asset of a given kind
  function latestAsset(kind: schema.AssetKind) {
    return assets
      .filter((a) => a.kind === kind)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .at(0);
  }

  const finalAsset = latestAsset("final");
  const thumbnailAsset = latestAsset("thumbnail");
  const scriptAsset = latestAsset("script");

  // Derive tags: prefer final asset meta, fall back to script asset meta
  function extractTags(asset?: schema.Asset): string[] {
    if (!asset) return [];
    const raw = asset.meta as Record<string, unknown>;
    const tags = raw?.tags;
    if (Array.isArray(tags)) return tags as string[];
    return [];
  }

  const tags =
    extractTags(finalAsset).length > 0
      ? extractTags(finalAsset)
      : extractTags(scriptAsset);

  // Fetch and parse the script JSON from Blob storage (server-side)
  let scriptDoc: ScriptDoc | null = null;
  if (scriptAsset?.url) {
    try {
      scriptDoc = (await fetch(scriptAsset.url).then((r) => r.json())) as ScriptDoc;
    } catch {
      // silently degrade — script preview unavailable
    }
  }

  const displayTitle = job.title ?? job.topic;
  const tagsText = tags.join(", ");

  return (
    <main className="wrap">
      <SiteNav active="none" channelName={channel?.name} />
      {/* Back link */}
      <a
        href="/"
        className="btn-ghost btn-sm"
        style={{ display: "inline-flex", marginBottom: 20 }}
      >
        ← Back
      </a>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 8,
          }}
        >
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
            {displayTitle}
          </h1>
          <span className={`pill ${job.status}`}>
            {job.status.replace("_", " ")}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span className="mode-tag">{job.mode}</span>
          <span className="mode-tag">{job.target}</span>
          {channel && <span className="mode-tag">{channel.name}</span>}
        </div>
      </div>

      {/* Failed error */}
      {job.status === "failed" && job.error && (
        <div
          className="card"
          style={{
            marginBottom: 20,
            border: "1px solid rgba(255,93,108,0.3)",
            background: "rgba(255,93,108,0.06)",
          }}
        >
          <p
            style={{
              margin: 0,
              color: "var(--red)",
              fontSize: 13,
              fontFamily: "monospace",
            }}
          >
            {job.error}
          </p>
        </div>
      )}

      {/* Final video */}
      {finalAsset && (
        <section className="card" style={{ marginBottom: 20 }}>
          <h2>Video</h2>
          <video
            controls
            src={finalAsset.url}
            style={{
              width: "100%",
              borderRadius: 8,
              background: "#000",
              display: "block",
              marginBottom: 12,
            }}
          />
          <a className="btn btn-sm" href={finalAsset.url} download>
            Download MP4
          </a>
        </section>
      )}

      {/* Thumbnail */}
      {thumbnailAsset && (
        <section className="card" style={{ marginBottom: 20 }}>
          <h2>Thumbnail</h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="thumb"
            src={thumbnailAsset.url}
            alt="Video thumbnail"
            style={{ width: "100%", height: "auto", maxWidth: 480 }}
          />
        </section>
      )}

      {/* Copy for upload */}
      <section className="card" style={{ marginBottom: 20 }}>
        <h2>Copy for upload</h2>

        {/* Title */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ marginBottom: 6 }}>Title</label>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
            }}
          >
            <div
              style={{
                flex: 1,
                background: "#0e1015",
                border: "1px solid var(--border)",
                borderRadius: 9,
                padding: "10px 12px",
                fontSize: 14,
                lineHeight: 1.5,
                wordBreak: "break-word",
              }}
            >
              {displayTitle}
            </div>
            <CopyButton text={displayTitle} />
          </div>
        </div>

        {/* Description */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ marginBottom: 6 }}>Description</label>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
            }}
          >
            <div
              style={{
                flex: 1,
                background: "#0e1015",
                border: "1px solid var(--border)",
                borderRadius: 9,
                padding: "10px 12px",
                fontSize: 14,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                maxHeight: 180,
                overflowY: "auto",
              }}
            >
              {job.description ?? (
                <span style={{ color: "var(--muted)" }}>No description yet.</span>
              )}
            </div>
            {job.description && <CopyButton text={job.description} />}
          </div>
        </div>

        {/* Tags */}
        <div>
          <label style={{ marginBottom: 6 }}>Tags</label>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
            }}
          >
            <div
              style={{
                flex: 1,
                background: "#0e1015",
                border: "1px solid var(--border)",
                borderRadius: 9,
                padding: "10px 12px",
                fontSize: 14,
                lineHeight: 1.5,
                wordBreak: "break-word",
              }}
            >
              {tags.length > 0 ? (
                tagsText
              ) : (
                <span style={{ color: "var(--muted)" }}>No tags yet.</span>
              )}
            </div>
            {tags.length > 0 && <CopyButton text={tagsText} />}
          </div>
        </div>
      </section>

      {/* Script transcript */}
      {scriptDoc && (
        <section className="card" style={{ marginBottom: 20 }}>
          <h2>Script transcript</h2>
          {scriptDoc.scenes && scriptDoc.scenes.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {scriptDoc.scenes.map((scene, i) => (
                <div
                  key={i}
                  style={{
                    borderLeft: "2px solid var(--border)",
                    paddingLeft: 14,
                  }}
                >
                  <p
                    style={{
                      margin: "0 0 6px",
                      fontSize: 13,
                      color: "var(--muted)",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Scene {i + 1}
                  </p>
                  <p style={{ margin: "0 0 6px", lineHeight: 1.6 }}>
                    {scene.narration}
                  </p>
                  {scene.visualPrompt && (
                    <p
                      style={{
                        margin: "0 0 4px",
                        fontSize: 12,
                        color: "var(--muted)",
                      }}
                    >
                      AI shot: {scene.visualPrompt}
                    </p>
                  )}
                  {scene.brollKeywords && scene.brollKeywords.length > 0 && (
                    <p
                      style={{
                        margin: 0,
                        fontSize: 12,
                        color: "var(--muted)",
                      }}
                    >
                      B-roll: {scene.brollKeywords.join(", ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: "var(--muted)", margin: 0 }}>
              No scenes found in script.
            </p>
          )}
        </section>
      )}

      {/* Script asset present but failed to parse */}
      {scriptAsset && !scriptDoc && (
        <section className="card" style={{ marginBottom: 20 }}>
          <h2>Script transcript</h2>
          <p style={{ color: "var(--muted)", margin: 0 }}>
            Script preview unavailable.
          </p>
        </section>
      )}
    </main>
  );
}
