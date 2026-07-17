import { referenceZecShelfResources } from "@/content/zec-shelf";

export const dynamic = "force-static";

export function GET() {
  return Response.json(
    { resources: referenceZecShelfResources },
    {
      headers: {
        Allow: "GET, HEAD, OPTIONS",
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      },
    },
  );
}

export function HEAD() {
  return new Response(null, {
    status: 200,
    headers: {
      Allow: "GET, HEAD, OPTIONS",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
    },
  });
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { Allow: "GET, HEAD, OPTIONS" },
  });
}

function methodNotAllowed() {
  return Response.json(
    { error: "PGPZ Reference exposes a read-only catalog." },
    { status: 405, headers: { Allow: "GET, HEAD, OPTIONS" } },
  );
}

export const POST = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
