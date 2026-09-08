import { NextRequest } from "next/server";
import { disclosureApi, disclosureBody, disclosureJson } from "@/lib/disclosures-api";
import { notifyDisclosure } from "@/lib/disclosures-service";
export const runtime = "nodejs";
export const POST = (request: NextRequest, context: { params: Promise<{ id: string }> }) => disclosureApi(request, true, async (member) => disclosureJson(await notifyDisclosure(member, (await context.params).id, await disclosureBody(request))));
