"use client";

import { createAuthClient } from "better-auth/react";
import { BOARD_BASE_PATH } from "@/lib/config";

export const betterAuthClient = createAuthClient({
  basePath: BOARD_BASE_PATH,
});

export const { signOut, signIn } = betterAuthClient;
