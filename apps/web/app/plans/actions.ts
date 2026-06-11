"use server";

import {
  addTopics,
  createPlan,
  deletePlan,
  setPlanEnabled,
} from "@tubeforge/core/web";
import { revalidatePath } from "next/cache";
import { ensureOwnerChannel } from "@/lib/data";

export async function createPlanAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const niche = String(formData.get("niche") ?? "").trim();
  if (!name || !niche) return;

  const perDay = Math.max(1, parseInt(String(formData.get("perDay") ?? "1"), 10) || 1);
  const mode = formData.get("mode") === "avatar" ? "avatar" : "faceless";
  const target = formData.get("target") === "youtube" ? "youtube" : "download";

  const channel = await ensureOwnerChannel();
  await createPlan({ channelId: channel.id, name, niche, perDay, mode, target });
  revalidatePath("/plans");
}

export async function togglePlanAction(formData: FormData) {
  const id = String(formData.get("id"));
  const enabled = formData.get("enabled") === "true";
  await setPlanEnabled(id, enabled);
  revalidatePath("/plans");
}

export async function deletePlanAction(formData: FormData) {
  const id = String(formData.get("id"));
  await deletePlan(id);
  revalidatePath("/plans");
}

export async function addTopicsAction(formData: FormData) {
  const planId = String(formData.get("planId"));
  const raw = String(formData.get("topics") ?? "");
  const topics: string[] = raw
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);
  if (topics.length === 0) return;
  await addTopics(planId, topics);
  revalidatePath("/plans");
}
