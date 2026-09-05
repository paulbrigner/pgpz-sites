import { resolveAppSession } from "@/lib/app-session";
import { canManageZecShelf } from "@/lib/zec-shelf-access";
import { communityZecShelfChecker, communityZecShelfRepository } from "@/lib/zec-shelf-server";

export async function POST(request: Request) {
  const session = await resolveAppSession(request.headers);
  if (!canManageZecShelf(session?.user)) {
    return Response.json(
      { error: "Administrator access is required." },
      { status: session?.user?.id ? 403 : 401 },
    );
  }

  try {
    const input = await request.json().catch(() => null) as { id?: unknown } | null;
    if (typeof input?.id !== "string" || !input.id.trim()) {
      return Response.json({ error: "Choose one resource to check. Refresh the page to check the full catalog." }, { status: 400 });
    }
    const resource = await communityZecShelfRepository.getResource(input.id);
    if (!resource) return Response.json({ error: "No matching resources were found." }, { status: 404 });
    const result = await communityZecShelfChecker.checkOne(resource);
    return Response.json({ results: [result] });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Update check failed" }, { status: 500 });
  }
}
