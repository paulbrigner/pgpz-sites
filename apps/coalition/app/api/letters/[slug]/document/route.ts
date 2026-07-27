import { NextRequest, NextResponse } from "next/server";
import {
  canAccessAdminFeatures,
  canAccessMemberFeatures,
} from "@pgpz/core";
import { isFeatureEnabled } from "@/config/features";
import { resolveAppSession } from "@/lib/app-session";
import {
  getLetterCampaignBySlug,
  getLetterDocumentBytes,
} from "@/lib/letter-signons";

export const dynamic = "force-dynamic";

const attachmentName = (value: string) =>
  value.replace(/[^\w.\- ()]+/g, "-").replace(/"/g, "").slice(0, 180) ||
  "letter.pdf";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  if (!isFeatureEnabled("letterSignons")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const session = await resolveAppSession();
  const member = canAccessMemberFeatures(session?.user);
  const admin = canAccessAdminFeatures(session?.user);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!member && !admin) {
    return NextResponse.json(
      { error: "Active Coalition membership required" },
      { status: 403 },
    );
  }
  const { slug } = await context.params;
  const campaign = await getLetterCampaignBySlug(slug);
  if (
    !campaign ||
    ((!admin || request.nextUrl.searchParams.get("admin") !== "1") &&
      (campaign.status === "draft" || campaign.status === "archived"))
  ) {
    return NextResponse.json(
      { error: "Letter campaign not found" },
      { status: 404 },
    );
  }
  try {
    const bytes = await getLetterDocumentBytes(campaign.currentDocument);
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${attachmentName(campaign.currentDocument.fileName)}"`,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "X-Letter-Document-Version": String(
          campaign.currentDocument.version,
        ),
        "X-Letter-Document-SHA256": campaign.currentDocument.sha256,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "The letter document is unavailable." },
      { status: 503 },
    );
  }
}
