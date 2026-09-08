import { NextRequest } from "next/server";
import { disclosureApi, disclosureBody, disclosureJson } from "@/lib/disclosures-api";
import { disclosureView, mutateDisclosure } from "@/lib/disclosures-service";
type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
export const GET = (request: NextRequest, context: Context) => disclosureApi(request, false, async (member) => disclosureJson(await disclosureView(member, (await context.params).id)));
export const POST = (request: NextRequest, context: Context) => disclosureApi(request, true, async (member) => disclosureJson({ request: await mutateDisclosure(member, (await context.params).id, await disclosureBody(request)) }));
