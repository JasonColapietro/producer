"use server";

import { db, enqueueJob, schema } from "@tubeforge/core/web";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { ensureOwnerChannel } from "@/lib/data";

const { jobs } = schema;

export async function createVideo(formData: FormData) {
  const topic = String(formData.get("topic") ?? "").trim();
  if (!topic) return;
  const raw = formData.get("mode");
  const mode = raw === "avatar" ? "avatar" : raw === "voiceover" ? "voiceover" : "faceless";
  const target = formData.get("target") === "youtube" ? "youtube" : "download";
  const privacy = (String(formData.get("privacy") ?? "private") || "private") as
    | "private"
    | "unlisted"
    | "public";

  const channel = await ensureOwnerChannel();
  await enqueueJob({ channelId: channel.id, topic, mode, target, options: { privacy } });
  revalidatePath("/");
}

export async function approveJob(formData: FormData) {
  const id = String(formData.get("id"));
  await db().update(jobs).set({ status: "ready", updatedAt: new Date() }).where(eq(jobs.id, id));
  revalidatePath("/");
}

export async function retryJob(formData: FormData) {
  const id = String(formData.get("id"));
  await db().update(jobs).set({ status: "queued", error: null, updatedAt: new Date() }).where(eq(jobs.id, id));
  revalidatePath("/");
}
