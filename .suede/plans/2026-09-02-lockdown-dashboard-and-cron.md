# Plan: lock down the producer dashboard and cron tick

Objective:        No anonymous visitor can queue renders, edit plans, drive the autopilot tick, or get job transcripts indexed on producer.suedeai.ai.
Source truth:     /Users/jason/code/suede-seo-run-2026-09-02/reports/audits/producer.suedeai.ai.md findings 1, 2, 5, 6 (audit 2026-09-02); operator instruction "lock down producer and discovery first".
Executing skill:  suede-execute-plan (inline, single builder)
Global constraints:
                  "READ-ONLY on sources/" (the run folder rule; this work happens in worktrees/producer-lockdown, not sources/)
                  "Fixes go in a branch in the matching sources/ clone and out as a PR to the repo named in SURFACES.tsv"
                  "Paid runs ... need all three [credentials]; never print the values or write them to a file" (tooling/CLAUDE.md; applies to any secret here: DASHBOARD_SECRET and CRON_SECRET are set in Vercel, never committed)
                  Audit finding 1: "keep only a static marketing page public" is NOT in scope; the whole dashboard is gated until a static page exists.
Surfaces touched: repo JasonColapietro/producer, app apps/web, host producer.suedeai.ai (Vercel project "producer", git-linked, production builds only via ignoreCommand)
Done signal:      curl -s -o /dev/null -w '%{http_code}' https://producer.suedeai.ai/ returns 401 or 503 (never 200) without credentials; GET /api/cron/tick returns 401 without the bearer; /plans and /job/<uuid> carry noindex; robots.txt disallows /api/, /job/, /plans.
Ship gate owner:  suede-ship-gate, run by the same session before merge; deploy is `git merge` to main (Vercel git-linked, production build on push to main).

Public claim surface:      n/a (no copy changes; robots/noindex only)
Rights or money touchpoints: yes, spend: the dashboard actions spend Anthropic, Replicate and Kie.ai credits. Task 1 and Task 2 are test-first under suede-tdd.
Design contract reference: n/a (no rendered change except a 401 challenge)
Deploy step:               merge fix/lockdown-dashboard-and-cron into main and push; Vercel builds production. Then set DASHBOARD_SECRET and CRON_SECRET in the Vercel project env (operator, dashboard). Until DASHBOARD_SECRET exists the middleware answers 503 for every gated route, which is the locked state.

## Task 1: Gate every dashboard route and server action behind Basic auth, fail closed

Files:      create: apps/web/middleware.ts
            create: apps/web/lib/dashboard-auth.ts
            test:   apps/web/lib/__tests__/dashboard-auth.test.mjs
Interfaces: Consumes process.env.DASHBOARD_SECRET (string | undefined) and the request Authorization header (string | null)
            Produces `export function checkDashboardAuth(authorization: string | null, secret: string | undefined): "ok" | "missing-secret" | "unauthorized"`
            Produces `export function isPublicPath(pathname: string): boolean` true only for: /robots.txt, /sitemap.xml, /llms.txt, /api/cron/tick, /api/youtube/callback, /_next/*, /favicon.ico, /opengraph-image*
            middleware: for non-public paths, "missing-secret" -> 503 text "dashboard locked"; "unauthorized" -> 401 with header `WWW-Authenticate: Basic realm="Suede Cinema"`; "ok" -> NextResponse.next()
Steps:      - [ ] Write dashboard-auth.test.mjs first (same strip-types transpile trick as job-error.test.mjs): cases: secret undefined -> "missing-secret"; header null -> "unauthorized"; header "Basic " + base64("x:" + secret) -> "ok"; wrong password -> "unauthorized"; isPublicPath("/") false, "/robots.txt" true, "/api/cron/tick" true, "/_next/static/a.js" true, "/plans" false, "/job/abc" false
            - [ ] Run it, watch it fail on missing module
            - [ ] Implement apps/web/lib/dashboard-auth.ts (no Node-only imports; must run on the edge runtime; decode base64 with atob)
            - [ ] Implement apps/web/middleware.ts with `export const config = { matcher: ["/((?!_next/static|_next/image).*)"] }` calling the two functions
            - [ ] Run test, typecheck
Verify:     node --test apps/web/lib/__tests__/dashboard-auth.test.mjs  ->  "pass 8" (or the exact case count) "fail 0"; pnpm --filter @producer/web typecheck -> exit 0
Done:       With DASHBOARD_SECRET unset, `next build` succeeds and every non-public route is answered by middleware before any page or action runs.

## Task 2: Make /api/cron/tick fail closed

Files:      modify: apps/web/app/api/cron/tick/route.ts
            create: apps/web/lib/cron-auth.ts
            test:   apps/web/lib/__tests__/cron-auth.test.mjs
Interfaces: Consumes process.env.CRON_SECRET (string | undefined) and Authorization header (string | null)
            Produces `export function isCronAuthorized(authorization: string | null, secret: string | undefined): boolean` — false when secret is undefined or empty, false when header !== "Bearer " + secret, true otherwise
            route.ts: `if (!isCronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET)) return new NextResponse("unauthorized", { status: 401 });` before runAutopilotTick()
Steps:      - [ ] Write cron-auth.test.mjs first: (null, undefined) false; (null, "s") false; ("Bearer s", undefined) false; ("Bearer s", "") false; ("Bearer wrong", "s") false; ("Bearer s", "s") true
            - [ ] Run it, watch it fail
            - [ ] Implement lib/cron-auth.ts; wire into route.ts replacing the `if (secret && ...)` block
            - [ ] Do NOT re-add a `crons` entry to apps/web/vercel.json (re-enabling autopilot spend is an operator decision; recorded in the handoff)
            - [ ] Run test, typecheck
Verify:     node --test apps/web/lib/__tests__/cron-auth.test.mjs  ->  "pass 6" "fail 0"; grep -n "isCronAuthorized" apps/web/app/api/cron/tick/route.ts -> 2 lines (import + call)
Done:       The route cannot execute runAutopilotTick() unless CRON_SECRET is set and matched.

## Task 3: Keep job transcripts and operator pages out of the index; stop the two 500s

Files:      modify: apps/web/app/robots.ts
            modify: apps/web/app/plans/page.tsx (add `export const metadata = { robots: { index: false, follow: false } }`)
            modify: apps/web/app/job/[id]/page.tsx (same metadata export; add `if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();` before the db query)
            modify: apps/web/app/api/voiceover/route.ts (wrap `await req.formData()` in try/catch returning 400 JSON `{ error: "multipart form body required" }`)
Interfaces: Consumes nothing new
            Produces robots(): rules `{ userAgent: "*", allow: "/", disallow: ["/api/", "/job/", "/plans"] }`
Steps:      - [ ] Edit robots.ts
            - [ ] Add metadata export to plans/page.tsx and job/[id]/page.tsx
            - [ ] Add uuid guard in job/[id]/page.tsx
            - [ ] Add try/catch in voiceover/route.ts
            - [ ] typecheck
Verify:     pnpm --filter @producer/web typecheck -> exit 0; grep -c "disallow" apps/web/app/robots.ts -> 1; grep -c "index: false" apps/web/app/plans/page.tsx 'apps/web/app/job/[id]/page.tsx' -> 1 each
Done:       After deploy: curl -s https://producer.suedeai.ai/robots.txt shows the three Disallow lines (robots.txt is public in middleware); /job/does-not-exist answers 404 not 500 once credentials are supplied.

## Handoff notes for the operator
- Set `DASHBOARD_SECRET` (any long random string; the browser prompts for user "any" + this password) and `CRON_SECRET` in Vercel project "producer" env for Production. Until then the site answers 503 on every dashboard route, which is the intended locked state.
- Re-adding the daily cron (`{"crons":[{"path":"/api/cron/tick","schedule":"0 9 * * *"}]}` in apps/web/vercel.json) re-enables autopilot spend. Deferred to you.
- Vercel Deployment Protection "All Deployments" on the project is the zero-code equivalent and can stay on in addition.
