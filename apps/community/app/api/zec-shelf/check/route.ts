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
    const input = await request.json().catch(() => ({})) as { id?: string };
    const requestedResource = input.id
      ? await communityZecShelfRepository.getResource(input.id)
      : null;
    const resources = input.id
      ? requestedResource ? [requestedResource] : []
      : await communityZecShelfRepository.getResources();
    if (!resources.length) return Response.json({ error: "No matching resources were found." }, { status: 404 });
    const results = await communityZecShelfChecker.checkMany(resources);
    return Response.json({ results });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Update check failed" }, { status: 500 });
  }
}
