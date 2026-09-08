import { NextRequest } from "next/server";
import { disclosureApi, disclosureBody, disclosureJson } from "@/lib/disclosures-api";
import { createDisclosure, disclosureRegister } from "@/lib/disclosures-service";
export const runtime = "nodejs";
export const GET = (request: NextRequest) => disclosureApi(request, false, async (member) => disclosureJson({ records: await disclosureRegister(member) }));
export const POST = (request: NextRequest) => disclosureApi(request, true, async (member) => disclosureJson({ request: await createDisclosure(member, await disclosureBody(request)) }, 201));
