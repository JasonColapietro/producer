import { checkDashboardAuth, isSameOriginMutation, LOCKED_RESPONSE_HEADERS } from "@/lib/dashboard-auth";
import { readVoiceoverForm, voiceoverExtension, UploadError } from "@/lib/voiceover-upload";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@producer/core/web";
import { eq } from "drizzle-orm";
import { put } from "@vercel/blob";

const { jobs, assets } = schema;

export async function POST(req: NextRequest) {
  const auth = checkDashboardAuth(req.headers.get("authorization"), process.env.DASHBOARD_SECRET);
  if (auth !== "ok") {
    return NextResponse.json({ error: "Authentication required" }, {
      status: auth === "missing-secret" ? 503 : 401,
      headers: auth === "missing-secret" ? LOCKED_RESPONSE_HEADERS : { "Cache-Control": "no-store" },
    });
  }
  if (!isSameOriginMutation(req)) {
    return NextResponse.json({ error: "Cross-site request rejected" }, { status: 403 });
  }
  let form: FormData;
  try {
    form = await readVoiceoverForm(req);
  } catch (error) {
    return NextResponse.json({ error: error instanceof UploadError ? error.message : "Invalid upload" },
      { status: error instanceof UploadError ? error.status : 400 });
  }
  const id = String(form.get("id") ?? "").trim();
  const file = form.get("audio");

  if (!id || !(file instanceof File)) {
    return NextResponse.json({ error: "id and audio file required" }, { status: 400 });
  }

  let extension: string;
  try { extension = voiceoverExtension(file); }
  catch (error) {
    return NextResponse.json({ error: error instanceof UploadError ? error.message : "Invalid audio" },
      { status: error instanceof UploadError ? error.status : 400 });
  }

  const job = (await db().select().from(jobs).where(eq(jobs.id, id)).limit(1))[0];
  if (!job || job.status !== "needs_voiceover") {
    return NextResponse.json({ error: "job not found or not awaiting voiceover" }, { status: 404 });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return NextResponse.json({ error: "Voiceover storage is not configured" }, { status: 500 });

  const blob = await put(`${id}/voiceover.${extension}`, file, {
    access: "public",
    token,
  });

  await db().insert(assets).values({ jobId: id, kind: "audio", url: blob.url });
  await db().update(jobs).set({ status: "queued", updatedAt: new Date() }).where(eq(jobs.id, id));

  return NextResponse.json({ ok: true, url: blob.url });
}
