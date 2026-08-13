"use client";

import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";
import { BOARD_BASE_PATH } from "@/lib/config";

export const betterAuthClient = createAuthClient({
  basePath: BOARD_BASE_PATH,
  plugins: [magicLinkClient(), passkeyClient()],
});

export const { signOut, signIn } = betterAuthClient;
