import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

const handlers = toNextJsHandler(auth);

export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
export const PUT = handlers.PUT;
export const DELETE = handlers.DELETE;
