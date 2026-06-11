import { countPendingTopics, listPlans } from "@tubeforge/core/web";
import { ensureOwnerChannel } from "@/lib/data";
import {
  addTopicsAction,
  createPlanAction,
  deletePlanAction,
  togglePlanAction,
} from "./actions";
import type { ContentPlan } from "@tubeforge/core/web";

export const dynamic = "force-dynamic";

export default async function PlansPage() {
  const channel = await ensureOwnerChannel();
  const plans = await listPlans(channel.id);

  // Fetch pending-topic counts for all plans in parallel
  const backlogCounts = await Promise.all(
    plans.map((p) => countPendingTopics(p.id)),
  );
  const planWithBacklog: Array<{ plan: ContentPlan; backlog: number }> =
    plans.map((plan, i) => ({ plan, backlog: backlogCounts[i]! }));

  return (
    <main className="wrap">
      <div className="brand">
        <h1>
          Tube<span className="dot">●</span>Forge
        </h1>
        <span className="mode-tag">{channel.name}</span>
      </div>
      <p className="sub">
        <a href="/" style={{ color: "var(--muted)", textDecoration: "none" }}>
          ← Dashboard
        </a>
        {" · "}
        Autopilot — content plans that generate videos while you sleep.
      </p>

      <div className="grid split">
        {/* ── New plan form ── */}
        <section className="card">
          <h2>New plan</h2>
          <form action={createPlanAction}>
            <label htmlFor="plan-name">Plan name</label>
            <input
              id="plan-name"
              name="name"
              placeholder="e.g. Daily history facts"
              required
            />

            <label htmlFor="plan-niche">Niche / topic seed</label>
            <input
              id="plan-niche"
              name="niche"
              placeholder="e.g. Ancient Rome"
              required
            />

            <label htmlFor="plan-perDay">Videos per day</label>
            <input
              id="plan-perDay"
              name="perDay"
              type="number"
              min={1}
              max={10}
              defaultValue={1}
            />

            <div className="row">
              <div>
                <label htmlFor="plan-mode">Format</label>
                <select id="plan-mode" name="mode" defaultValue="faceless">
                  <option value="faceless">Faceless (B-roll)</option>
                  <option value="avatar">Avatar (you)</option>
                </select>
              </div>
              <div>
                <label htmlFor="plan-target">Destination</label>
                <select id="plan-target" name="target" defaultValue="download">
                  <option value="download">Download</option>
                  <option value="youtube">Auto-publish</option>
                </select>
              </div>
            </div>

            <button className="full" type="submit">
              Create plan
            </button>
          </form>
        </section>

        {/* ── Plan list ── */}
        <section className="card">
          <h2>Plans · {plans.length}</h2>

          {plans.length === 0 ? (
            <p className="empty">No plans yet. Create your first one →</p>
          ) : (
            <div className="jobs">
              {planWithBacklog.map(({ plan, backlog }) => (
                <div
                  className="job"
                  key={plan.id}
                  style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}
                >
                  {/* Top row: name + status pill + actions */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div className="meta" style={{ flex: 1 }}>
                      <div className="title">{plan.name}</div>
                      <div className="topic">
                        <span className="mode-tag">{plan.niche}</span>{" "}
                        <span className="mode-tag">{plan.mode}</span>{" "}
                        <span className="mode-tag">{plan.target}</span>{" "}
                        <span className="stage">{plan.perDay}/day</span>
                      </div>
                    </div>

                    <span
                      className={`pill ${plan.enabled ? "completed" : "failed"}`}
                      style={{ flexShrink: 0 }}
                    >
                      {plan.enabled ? "active" : "paused"}
                    </span>

                    <div className="actions">
                      {/* Toggle enabled */}
                      <form action={togglePlanAction}>
                        <input type="hidden" name="id" value={plan.id} />
                        <input
                          type="hidden"
                          name="enabled"
                          value={plan.enabled ? "false" : "true"}
                        />
                        <button className="btn-ghost btn-sm" type="submit">
                          {plan.enabled ? "Pause" : "Resume"}
                        </button>
                      </form>

                      {/* Delete */}
                      <form action={deletePlanAction}>
                        <input type="hidden" name="id" value={plan.id} />
                        <button
                          className="btn-ghost btn-sm"
                          type="submit"
                          style={{ color: "var(--red)", borderColor: "var(--red)" }}
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  </div>

                  {/* Backlog count + add-topics form */}
                  <div
                    style={{
                      borderTop: "1px solid var(--border)",
                      paddingTop: 10,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      Backlog:{" "}
                      <strong style={{ color: backlog === 0 ? "var(--amber)" : "var(--green)" }}>
                        {backlog} topic{backlog !== 1 ? "s" : ""}
                      </strong>
                      {backlog === 0 && (
                        <span style={{ marginLeft: 6 }}>
                          — will auto-generate from niche
                        </span>
                      )}
                    </div>

                    <form action={addTopicsAction}>
                      <input type="hidden" name="planId" value={plan.id} />
                      <textarea
                        name="topics"
                        placeholder={"Paste topics — one per line\ne.g. Why Rome fell\nSecret of the Colosseum"}
                        style={{ minHeight: 64, fontSize: 13 }}
                      />
                      <div style={{ marginTop: 6 }}>
                        <button className="btn btn-sm" type="submit">
                          + Add topics
                        </button>
                      </div>
                    </form>
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
