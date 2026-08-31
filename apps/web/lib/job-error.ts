/**
 * The producer homepage and job pages are publicly reachable — there is no auth
 * gate in front of them — and both used to render `job.error` verbatim. That is
 * the raw string the pipeline throws, so an anonymous visitor was shown the
 * names of unset environment variables (GOOGLE_CLIENT_ID, PEXELS_API_KEY,
 * STOCK_VOICE_REF_URL), an internal config path (channel.defaults.voiceRefUrl),
 * and the failure text of every queued job.
 *
 * Public surfaces get a category, never the underlying string. The job's status
 * pill already communicates that it failed; this only decides what the reason
 * says.
 */

type Rule = { match: RegExp; message: string };

/**
 * Ordered: the first match wins. Every message here is written to be true
 * without naming an internal identifier, a variable, a provider or a path.
 */
const RULES: Rule[] = [
  { match: /missing credential|not authori[sz]ed|invalid[_ ]grant|token expired/i,
    message: "A connected account needs to be reconnected." },
  { match: /no voice reference|voice ref/i,
    message: "No voice reference is set for this channel." },
  { match: /returned no text|empty or refused|refused response/i,
    message: "The script step returned nothing. Try again." },
  { match: /unexpected end of json|json parse|malformed/i,
    message: "A processing step returned unreadable data. Try again." },
  { match: /rate limit|429|quota/i,
    message: "A provider rate limit was hit. Try again shortly." },
  { match: /timed? ?out|etimedout|deadline/i,
    message: "This step timed out. Try again." },
];

/** Never returns any part of `raw`. */
export function publicJobError(raw: string | null | undefined): string {
  if (!raw) return "This render failed.";
  for (const rule of RULES) {
    if (rule.match.test(raw)) return rule.message;
  }
  return "This render failed.";
}
