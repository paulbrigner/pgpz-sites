import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  isLetterRevisionChangeType,
  type LetterRevisionChangeType,
} from "@pgpz/letter-signons";
import { isFeatureEnabled } from "@/config/features";
import { requireAdminSession } from "@/lib/admin/auth";
import {
  addLetterRevision,
  claimLetterCampaignNotice,
  createLetterCampaign,
  getLetterCampaignById,
  listLetterCampaigns,
  listLetterSignOns,
  recordLetterCampaignNotice,
  updateLetterCampaign,
} from "@/lib/letter-signons";
import { sendLetterSignerNotice } from "@/lib/letter-signons-email";

export const dynamic = "force-dynamic";

const jsonError = (error: unknown, status = 400) =>
  NextResponse.json(
    {
      error:
        error instanceof Error && error.message
          ? error.message
          : "The letter campaign request failed.",
    },
    { status },
  );

async function adminOrForbidden() {
  try {
    return {
      session: await requireAdminSession(),
      response: null,
    };
  } catch {
    return {
      session: null,
      response: NextResponse.json(
        { error: "Admin access required" },
        { status: 403 },
      ),
    };
  }
}

async function campaignSummary(campaign: Awaited<ReturnType<typeof getLetterCampaignById>>) {
  if (!campaign) return null;
  const signOns = await listLetterSignOns(campaign);
  return {
    ...campaign,
    signerCount: signOns.filter((signOn) => !signOn.withdrawnAt).length,
    currentSignerCount: signOns.filter((signOn) => signOn.current).length,
    reconfirmationCount: signOns.filter(
      (signOn) => !signOn.withdrawnAt && !signOn.current,
    ).length,
  };
}

const csvCell = (value: unknown) =>
  `"${String(value ?? "").replace(/"/g, '""')}"`;

export async function GET(request: NextRequest) {
  if (!isFeatureEnabled("letterSignons")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const access = await adminOrForbidden();
  if (access.response) return access.response;
  const campaignId = request.nextUrl.searchParams.get("campaignId");
  if (
    campaignId &&
    request.nextUrl.searchParams.get("format") === "csv"
  ) {
    const campaign = await getLetterCampaignById(campaignId);
    if (!campaign) {
      return NextResponse.json(
        { error: "Letter campaign not found." },
        { status: 404 },
      );
    }
    const signOns = await listLetterSignOns(campaign);
    const rows = [
      [
        "Current",
        "Signer type",
        "Published name",
        "Authorized signatory",
        "Title",
        "Affiliation",
        "Email",
        "Accepted at",
        "Document version",
        "Document SHA-256",
        "Withdrawn at",
      ],
      ...signOns.map((signOn) => [
        signOn.current ? "yes" : "no",
        signOn.signerKind,
        signOn.signerKind === "organization"
          ? signOn.organizationName
          : signOn.displayName,
        signOn.signerKind === "organization" ? signOn.displayName : "",
        signOn.title,
        signOn.affiliation,
        signOn.email,
        signOn.acceptedAt,
        signOn.documentVersion,
        signOn.documentSha256,
        signOn.withdrawnAt,
      ]),
    ];
    const csv = `${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${campaign.slug}-signers.csv"`,
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  }
  const campaigns = await listLetterCampaigns({ includeArchived: true });
  return NextResponse.json({
    campaigns: await Promise.all(campaigns.map(campaignSummary)),
  });
}

async function handleMultipart(
  request: NextRequest,
  adminUserId: string,
) {
  const form = await request.formData();
  const action = String(form.get("action") || "");
  const file = form.get("file");
  if (!file || typeof (file as File).arrayBuffer !== "function") {
    throw new Error("Select the PDF letter.");
  }
  const bytes = new Uint8Array(await (file as File).arrayBuffer());
  const fileName = (file as File).name || "letter.pdf";

  if (action === "create") {
    const deadlineValue = String(form.get("deadlineAt") || "");
    const deadline = new Date(deadlineValue);
    if (!Number.isFinite(deadline.getTime())) {
      throw new Error("Enter a valid sign-on deadline.");
    }
    const campaign = await createLetterCampaign({
      slug: form.get("slug"),
      title: form.get("title"),
      summary: form.get("summary"),
      recipient: form.get("recipient"),
      deadlineAt: deadline.toISOString(),
      status: form.get("status"),
      fileName,
      bytes,
      adminUserId,
    });
    return NextResponse.json(
      { ok: true, campaign: await campaignSummary(campaign) },
      { status: 201 },
    );
  }

  if (action === "revision") {
    const campaignId = String(form.get("campaignId") || "");
    const campaign = await addLetterRevision({
      campaignId,
      fileName,
      bytes,
      changeType: form.get("changeType"),
      changeSummary: form.get("changeSummary"),
      adminUserId,
    });
    return NextResponse.json({
      ok: true,
      campaign: await campaignSummary(campaign),
    });
  }

  throw new Error("Unsupported letter campaign upload action.");
}

async function sendNotice({
  body,
  adminUserId,
}: {
  body: Record<string, unknown>;
  adminUserId: string;
}) {
  const campaignId = String(body.campaignId || "");
  let campaign = await getLetterCampaignById(campaignId);
  if (!campaign) {
    return NextResponse.json(
      { error: "Letter campaign not found." },
      { status: 404 },
    );
  }
  const subject = String(body.subject || "").trim().slice(0, 220);
  const message = String(body.message || "").trim().slice(0, 4_000);
  const rawChangeType = body.changeType;
  const changeType: LetterRevisionChangeType | "status" | "delivered" =
    rawChangeType === "status" || rawChangeType === "delivered"
      ? rawChangeType
      : isLetterRevisionChangeType(rawChangeType) && rawChangeType !== "initial"
        ? rawChangeType
        : "status";
  if (!subject || !message) {
    throw new Error("A notice subject and message are required.");
  }
  if (changeType === "delivered" && campaign.status !== "delivered") {
    campaign =
      (await updateLetterCampaign({
        campaignId: campaign.id,
        status: "delivered",
        adminUserId,
      })) || campaign;
  }
  const noticeId = String(body.noticeId || randomUUID());
  await claimLetterCampaignNotice({
    campaign,
    noticeId,
    subject,
    message,
    changeType,
    adminUserId,
  });
  const signOns = (await listLetterSignOns(campaign)).filter(
    (signOn) => !signOn.withdrawnAt,
  );
  const attachLatestDocument =
    body.attachLatestDocument === true ||
    changeType === "minor" ||
    changeType === "material";
  const results: Awaited<ReturnType<typeof sendLetterSignerNotice>>[] = [];
  for (let index = 0; index < signOns.length; index += 5) {
    const batch = signOns.slice(index, index + 5);
    results.push(
      ...(await Promise.all(
        batch.map((signOn) =>
          sendLetterSignerNotice({
            campaign,
            signOn,
            noticeId,
            subject,
            message,
            changeType,
            attachLatestDocument,
          }),
        ),
      )),
    );
  }
  const sentAt = new Date().toISOString();
  const sentCount = results.filter((result) => result.sent).length;
  const failed = results.filter((result) => !result.sent);
  await recordLetterCampaignNotice(campaign, {
    id: noticeId,
    subject,
    message,
    changeType,
    documentVersion: campaign.currentDocument.version,
    sentAt,
    sentBy: adminUserId,
    recipientCount: signOns.length,
    sentCount,
    failedCount: failed.length,
  });
  return NextResponse.json({
    ok: true,
    noticeId,
    recipientCount: signOns.length,
    sentCount,
    failedCount: failed.length,
    failures: failed.slice(0, 10),
  });
}

export async function POST(request: NextRequest) {
  if (!isFeatureEnabled("letterSignons")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const access = await adminOrForbidden();
  if (access.response) return access.response;
  if (!access.session?.user?.id) {
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 },
    );
  }

  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      return await handleMultipart(request, access.session.user.id);
    }
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action || "");
    if (action === "update") {
      const campaign = await updateLetterCampaign({
        campaignId: String(body.campaignId || ""),
        title: body.title,
        summary: body.summary,
        recipient: body.recipient,
        deadlineAt: body.deadlineAt,
        status: body.status,
        adminUserId: access.session.user.id,
      });
      return NextResponse.json({
        ok: true,
        campaign: await campaignSummary(campaign),
      });
    }
    if (action === "sendNotice") {
      return await sendNotice({
        body,
        adminUserId: access.session.user.id,
      });
    }
    return jsonError(new Error("Unsupported letter campaign action."));
  } catch (error: any) {
    const conflict =
      error?.name === "ConditionalCheckFailedException" ||
      error?.name === "TransactionCanceledException";
    return jsonError(error, conflict ? 409 : 400);
  }
}
