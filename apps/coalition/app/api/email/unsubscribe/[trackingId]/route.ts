import { NextRequest, NextResponse } from "next/server";
import {
  getNewsletterTrackingRecord,
  recordNewsletterUnsubscribe,
} from "@/lib/admin/email-tracking";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ trackingId: string }>;
};

const htmlPage = (title: string, body: string, confirm = false) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body {
        margin: 0;
        background: #f6faf2;
        color: #102827;
        font-family: Inter, Segoe UI, Arial, sans-serif;
      }
      main {
        max-width: 680px;
        margin: 12vh auto;
        padding: 32px;
        border: 1px solid #cfe0d2;
        border-radius: 18px;
        background: #ffffff;
        box-shadow: 0 22px 48px rgba(30, 30, 30, 0.12);
      }
      .eyebrow {
        color: #2f6f68;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.2em;
        text-transform: uppercase;
      }
      h1 {
        margin: 12px 0;
        font-size: 30px;
        line-height: 1.2;
      }
      p {
        color: #475569;
        font-size: 15px;
        line-height: 1.7;
      }
      a {
        color: #2f6f68;
        font-weight: 700;
      }
      button {
        appearance: none;
        border: 0;
        border-radius: 999px;
        background: #c9a227;
        color: #102827;
        cursor: pointer;
        font: inherit;
        font-weight: 800;
        padding: 12px 18px;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="eyebrow">PGPZ Coalition</div>
      <h1>${title}</h1>
      <p>${body}</p>
      ${
        confirm
          ? '<form method="post"><button type="submit" name="confirm" value="unsubscribe">Confirm unsubscribe</button></form>'
          : ""
      }
      <p><a href="https://coalition.pgpz.org">Return to PGPZ Coalition</a></p>
    </main>
  </body>
</html>`;

const temporarilyUnavailable = () =>
  new NextResponse(
    htmlPage(
      "Please try again",
      "We could not process this unsubscribe request right now. No preference was changed; please try again in a moment.",
    ),
    {
      status: 503,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Retry-After": "30",
      },
    },
  );

export async function GET(_request: NextRequest, { params }: Props) {
  const { trackingId } = await params;
  let tracking;
  try {
    tracking = await getNewsletterTrackingRecord(trackingId);
  } catch (err) {
    console.error("Newsletter unsubscribe lookup failed", err);
    return temporarilyUnavailable();
  }

  if (!tracking) {
    return new NextResponse(
      htmlPage(
        "Unsubscribe link not found",
        "We could not find this unsubscribe link. Please contact admin@pgpz.org and we will help.",
      ),
      {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      },
    );
  }

  const alreadyUnsubscribed = !!tracking.unsubscribedAt;
  const categoryLabel = tracking.messageType === "policy_update" ? "policy updates" : "newsletters";
  return new NextResponse(
    htmlPage(
      alreadyUnsubscribed ? "Already unsubscribed" : "Confirm unsubscribe",
      alreadyUnsubscribed
        ? `This email address is already unsubscribed from ${categoryLabel}. Other email preferences, your coalition account, and member access are unchanged.`
        : `Confirm that you want to stop future PGPZ Coalition ${categoryLabel}. Other email preferences, your coalition account, and member access will remain unchanged.`,
      !alreadyUnsubscribed,
    ),
    {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    },
  );
}

export async function POST(request: NextRequest, { params }: Props) {
  const body = new URLSearchParams(await request.text());
  const isOneClick = body.get("List-Unsubscribe") === "One-Click";
  const isBrowserConfirmation = body.get("confirm") === "unsubscribe";
  if (!isOneClick && !isBrowserConfirmation) {
    return NextResponse.json({ error: "Invalid unsubscribe confirmation" }, { status: 400 });
  }

  const { trackingId } = await params;
  let tracking;
  try {
    tracking = await recordNewsletterUnsubscribe(trackingId);
  } catch (err) {
    console.error("Newsletter unsubscribe tracking failed", err);
    return temporarilyUnavailable();
  }

  if (!tracking) {
    return new NextResponse(
      htmlPage(
        "Unsubscribe link not found",
        "We could not find this unsubscribe link. Please contact admin@pgpz.org and we will help.",
      ),
      {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      },
    );
  }

  const categoryLabel = tracking.messageType === "policy_update" ? "policy updates" : "newsletters";

  return new NextResponse(
    htmlPage(
      "You have been unsubscribed",
      `This email address has been unsubscribed from ${categoryLabel}. Other email preferences, your coalition account, and member access are unchanged.`,
    ),
    {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    },
  );
}
