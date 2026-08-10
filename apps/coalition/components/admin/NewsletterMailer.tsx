"use client";

import { NewsletterMailer as SharedNewsletterMailer } from "@pgpz/email-admin-ui";
import { Button } from "@/components/ui/button";

export function NewsletterMailer() {
  return <SharedNewsletterMailer Button={Button} />;
}
