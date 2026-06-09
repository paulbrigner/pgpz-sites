import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Pending signup records are no longer used. Sign in with email, then verify membership with X social proof.",
    },
    { status: 410 }
  );
}
