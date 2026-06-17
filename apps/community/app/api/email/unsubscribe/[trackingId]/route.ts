import { NextRequest, NextResponse } from "next/server";
import { recordNewsletterUnsubscribe } from "@/lib/admin/email-tracking";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ trackingId: string }>;
};

const htmlPage = (title: string, body: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body {
        margin: 0;
        background: #fff9ea;
        color: #1e1e1e;
        font-family: Inter, Segoe UI, Arial, sans-serif;
      }
      main {
        max-width: 680px;
        margin: 12vh auto;
        padding: 32px;
        border: 1px solid #e2d3a7;
        border-radius: 18px;
        background: #ffffff;
        box-shadow: 0 22px 48px rgba(30, 30, 30, 0.12);
      }
      .eyebrow {
        color: #8a5a00;
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
        color: #8a5a00;
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="eyebrow">PGPZ Community</div>
      <h1>${title}</h1>
      <p>${body}</p>
      <p><a href="https://community.pgpz.org">Return to PGPZ Community</a></p>
    </main>
  </body>
</html>`;

export async function GET(_request: NextRequest, { params }: Props) {
  const { trackingId } = await params;
  const tracking = await recordNewsletterUnsubscribe(trackingId).catch((err) => {
    console.error("Newsletter unsubscribe tracking failed", err);
    return null;
  });

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

  return new NextResponse(
    htmlPage(
      "You have been unsubscribed",
      "This email address has been suppressed for future PGPZ Community member emails. Your community account and member access are unchanged.",
    ),
    {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    },
  );
}
