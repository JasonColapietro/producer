import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@tubeforge/core/web";
import { eq } from "drizzle-orm";
import { put } from "@vercel/blob";

const { jobs, assets } = schema;

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const id = String(form.get("id") ?? "").trim();
  const file = form.get("audio");

  if (!id || !(file instanceof File)) {
    return NextResponse.json({ error: "id and audio file required" }, { status: 400 });
  }

  const job = (await db().select().from(jobs).where(eq(jobs.id, id)).limit(1))[0];
  if (!job || job.status !== "needs_voiceover") {
    return NextResponse.json({ error: "job not found or not awaiting voiceover" }, { status: 404 });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return NextResponse.json({ error: "BLOB_READ_WRITE_TOKEN not set" }, { status: 500 });

  const blob = await put(`${id}/voiceover.${file.name.split(".").pop() ?? "wav"}`, file, {
    access: "public",
    token,
  });

  await db().insert(assets).values({ jobId: id, kind: "audio", url: blob.url });
  await db().update(jobs).set({ status: "queued", updatedAt: new Date() }).where(eq(jobs.id, id));

  return NextResponse.json({ ok: true, url: blob.url });
}
