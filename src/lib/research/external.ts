/**
 * External source clients for the research library. These pull live knowledge
 * from free, key-less public APIs:
 *
 * - Wikipedia (search + page summaries) for case studies and background
 *   knowledge on a topic
 * - Stack Exchange (top-voted Stack Overflow questions) for the problems and
 *   questions practitioners actually hit in a topic area
 *
 * Every client is defensive: short timeouts, and any network or shape failure
 * returns an empty list rather than throwing, so callers can always fall back
 * to the curated knowledge base.
 */

export interface ExternalResult {
  source: "wikipedia" | "stackexchange";
  id: string;
  title: string;
  /** Plain-text extract / excerpt from the source. */
  summary: string;
  url: string;
}

const FETCH_TIMEOUT_MS = 5_000;
const USER_AGENT = "teaching-assistant-research/1.0";

/** Strip HTML tags and decode the entities these APIs commonly emit. */
function cleanHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&hellip;/g, "...")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    // Network error, timeout, or invalid JSON — the caller falls back.
    return null;
  }
}

// ── Wikipedia ────────────────────────────────────────────────────────────────

interface WikiSearchResponse {
  query?: { search?: Array<{ title?: string }> };
}

interface WikiSummaryResponse {
  type?: string;
  title?: string;
  extract?: string;
  content_urls?: { desktop?: { page?: string } };
}

/**
 * Search Wikipedia for a topic and return page summaries with canonical URLs.
 * Disambiguation pages and summary-less results are skipped.
 */
export async function searchWikipedia(topic: string, limit: number): Promise<ExternalResult[]> {
  const searchUrl =
    "https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*" +
    `&srlimit=${Math.min(limit + 2, 10)}&srsearch=${encodeURIComponent(topic)}`;
  const search = (await fetchJson(searchUrl)) as WikiSearchResponse | null;
  const titles = (search?.query?.search ?? [])
    .map((item) => item.title)
    .filter((title): title is string => typeof title === "string" && title.length > 0);
  if (titles.length === 0) return [];

  const summaries = await Promise.all(
    titles.map((title) =>
      fetchJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`)
    )
  );

  const results: ExternalResult[] = [];
  for (const raw of summaries) {
    const summary = raw as WikiSummaryResponse | null;
    if (!summary || summary.type === "disambiguation") continue;
    const title = summary.title?.trim();
    const extract = summary.extract?.trim();
    const url = summary.content_urls?.desktop?.page;
    if (!title || !extract || !url) continue;
    results.push({
      source: "wikipedia",
      id: `wikipedia:${title.toLowerCase().replace(/\s+/g, "-")}`,
      title,
      summary: cleanHtml(extract),
      url,
    });
    if (results.length >= limit) break;
  }
  return results;
}

// ── Stack Exchange ───────────────────────────────────────────────────────────

interface StackExcerptsResponse {
  items?: Array<{
    item_type?: string;
    title?: string;
    excerpt?: string;
    question_id?: number;
    score?: number;
  }>;
}

/**
 * Search Stack Overflow for the top-voted questions on a topic. Questions are
 * the useful unit here (real problems practitioners hit); answer excerpts are
 * skipped, and each result links to the full thread.
 */
export async function searchStackExchange(topic: string, limit: number): Promise<ExternalResult[]> {
  const url =
    "https://api.stackexchange.com/2.3/search/excerpts?order=desc&sort=votes&site=stackoverflow" +
    `&pagesize=${Math.min(limit * 3, 30)}&q=${encodeURIComponent(topic)}`;
  const data = (await fetchJson(url)) as StackExcerptsResponse | null;

  const results: ExternalResult[] = [];
  for (const item of data?.items ?? []) {
    if (item.item_type !== "question") continue;
    const title = item.title ? cleanHtml(item.title) : "";
    const questionId = item.question_id;
    if (!title || typeof questionId !== "number") continue;
    results.push({
      source: "stackexchange",
      id: `stackexchange:${questionId}`,
      title,
      summary: item.excerpt ? cleanHtml(item.excerpt) : "",
      url: `https://stackoverflow.com/q/${questionId}`,
    });
    if (results.length >= limit) break;
  }
  return results;
}
