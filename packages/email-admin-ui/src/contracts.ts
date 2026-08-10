import type { ComponentProps, ComponentType } from "react";

export type NewsletterMailerButtonProps = ComponentProps<"button"> & {
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link"
    | "outlined-primary"
    | null;
  size?: "default" | "sm" | "lg" | "icon" | null;
  isLoading?: boolean;
};

export type NewsletterMailerButton = ComponentType<NewsletterMailerButtonProps>;

export type NewsletterMailerConfig = Readonly<{
  newslettersEndpoint: string;
  jobsEndpoint: string;
}>;
