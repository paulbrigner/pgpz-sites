import { NextRequest, NextResponse } from "next/server";
import {
  defaultLetterAcceptanceText,
  normalizeSignerIdentity,
} from "@pgpz/letter-signons";
import { canAccessMemberFeatures } from "@pgpz/core";
import { isFeatureEnabled } from "@/config/features";
import { resolveAppSession } from "@/lib/app-session";
import {
  getLetterCampaignBySlug,
  getLetterSignOn,
  saveLetterSignOn,
  withdrawLetterSignOn,
} from "@/lib/letter-signons";
import { sendLetterSignOnReceipt } from "@/lib/letter-signons-email";

export const dynamic = "force-dynamic";

async function memberContext(slug: string) {
  const session = await resolveAppSession();
  if (!session?.user?.id || !session.user.email) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      session: null,
      campaign: null,
    };
  }
  if (!canAccessMemberFeatures(session.user)) {
    return {
      response: NextResponse.json(
        { error: "Active Coalition membership required" },
        { status: 403 },
      ),
      session: null,
      campaign: null,
    };
  }
  const campaign = await getLetterCampaignBySlug(slug);
  if (!campaign || campaign.status === "draft" || campaign.status === "archived") {
    return {
      response: NextResponse.json(
        { error: "Letter campaign not found" },
        { status: 404 },
      ),
      session: null,
      campaign: null,
    };
  }
  return { response: null, session, campaign };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  if (!isFeatureEnabled("letterSignons")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { slug } = await context.params;
  const resolved = await memberContext(slug);
  if (resolved.response || !resolved.session || !resolved.campaign) {
    return resolved.response;
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (body.action === "resendConfirmation") {
      const signOn = await getLetterSignOn(
        resolved.campaign,
        resolved.session.user.id!,
      );
      if (!signOn || signOn.withdrawnAt) {
        return NextResponse.json(
          { error: "No active sign-on was found." },
          { status: 404 },
        );
      }
      const confirmation = await sendLetterSignOnReceipt(
        resolved.campaign,
        signOn,
      );
      return NextResponse.json(
        {
          ok: confirmation.sent,
          confirmation,
          error: confirmation.sent
            ? null
            : "The confirmation email could not be delivered.",
        },
        { status: confirmation.sent ? 200 : 502 },
      );
    }
    if (body.action === "withdraw") {
      const signOn = await withdrawLetterSignOn({
        campaign: resolved.campaign,
        userId: resolved.session.user.id!,
      });
      return NextResponse.json({ ok: true, signOn });
    }
    if (body.consent !== true) {
      return NextResponse.json(
        { error: "Confirm that you reviewed and support this exact draft." },
        { status: 400 },
      );
    }
    if (
      body.signerKind === "organization" &&
      body.authorizedForOrganization !== true
    ) {
      return NextResponse.json(
        {
          error:
            "Confirm that you are authorized to sign on for the organization or project.",
        },
        { status: 400 },
      );
    }
    const signer = normalizeSignerIdentity({
      signerKind: body.signerKind,
      displayName: body.displayName || resolved.session.user.name,
      organizationName: body.organizationName,
      title: body.title || resolved.session.user.jobTitle,
      affiliation:
        body.affiliation || resolved.session.user.company || undefined,
    });
    const acceptanceText = defaultLetterAcceptanceText({
      title: resolved.campaign.title,
      documentVersion: resolved.campaign.currentDocument.version,
    });
    const result = await saveLetterSignOn({
      campaign: resolved.campaign,
      userId: resolved.session.user.id!,
      email: resolved.session.user.email!,
      signer,
      acceptanceText,
    });
    const confirmation =
      result.duplicate && result.signOn.confirmationStatus === "sent"
        ? { sent: true, duplicate: true }
        : await sendLetterSignOnReceipt(
            resolved.campaign,
            result.signOn,
          );
    return NextResponse.json(
      {
        ok: true,
        duplicate: result.duplicate,
        signOn: result.signOn,
        confirmation,
        warning: confirmation.sent
          ? null
          : "Your sign-on was recorded, but the confirmation email could not be delivered. Use Resend confirmation to try again.",
      },
      { status: result.duplicate ? 200 : 201 },
    );
  } catch (error: any) {
    const conflict =
      error?.name === "ConditionalCheckFailedException" ||
      error?.name === "TransactionCanceledException";
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message
            ? error.message
            : "The sign-on could not be recorded.",
      },
      { status: conflict ? 409 : 400 },
    );
  }
}
