import { requireAppOwner } from "@/lib/supabase/auth";
import { readGithubQuota } from "@/lib/github-quota";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const owner = await requireAppOwner().catch(() => null);
  if (!owner || owner.id !== request.headers.get("X-Repo-Grades-Account")) {
    return Response.json({ status: "unavailable" }, { status: 403, headers });
  }
  return Response.json(await readGithubQuota(owner.id), { headers });
}
