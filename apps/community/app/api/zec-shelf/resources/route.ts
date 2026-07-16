import { resolveAppSession } from "@/lib/app-session";
import { canManageZecShelf, canViewZecShelf } from "@/lib/zec-shelf-access";
import {
  createZecShelfResource,
  deleteZecShelfResource,
  getZecShelfResources,
  reorderZecShelfResources,
  updateZecShelfResource,
  type ZecShelfResourceDraft,
} from "@/lib/zec-shelf";

type ResourceInput = Partial<ZecShelfResourceDraft> & {
  id?: string;
  order?: string[];
};

async function accessFor(request: Request) {
  const session = await resolveAppSession(request.headers);
  return {
    authenticated: !!session?.user?.id,
    canView: canViewZecShelf(session?.user),
    canManage: canManageZecShelf(session?.user),
  };
}

function accessError(authenticated: boolean, message: string) {
  return Response.json({ error: message }, { status: authenticated ? 403 : 401 });
}

function errorResponse(error: unknown, status = 400) {
  return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status });
}

export async function GET(request: Request) {
  const access = await accessFor(request);
  if (!access.canView) return accessError(access.authenticated, "Active membership is required.");

  try {
    return Response.json({ resources: await getZecShelfResources() });
  } catch (error) {
    return errorResponse(error, 500);
  }
}

export async function POST(request: Request) {
  const access = await accessFor(request);
  if (!access.canManage) return accessError(access.authenticated, "Administrator access is required.");

  try {
    const input = await request.json() as ResourceInput;
    const resource = await createZecShelfResource(input);
    return Response.json({ resource }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const access = await accessFor(request);
  if (!access.canManage) return accessError(access.authenticated, "Administrator access is required.");

  try {
    const input = await request.json() as ResourceInput;
    if (Array.isArray(input.order)) {
      await reorderZecShelfResources(input.order);
      return Response.json({ ok: true });
    }
    if (!input.id) return Response.json({ error: "A resource id is required." }, { status: 400 });
    return Response.json({ resource: await updateZecShelfResource(input.id, input) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const access = await accessFor(request);
  if (!access.canManage) return accessError(access.authenticated, "Administrator access is required.");

  try {
    const id = new URL(request.url).searchParams.get("id") || "";
    if (!id) return Response.json({ error: "A resource id is required." }, { status: 400 });
    await deleteZecShelfResource(id);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
