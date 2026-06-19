export type UserDisplayNameSource = {
  name?: unknown;
  firstName?: unknown;
  lastName?: unknown;
};

export const textOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length ? value.trim() : null;

export const getUserDisplayName = (user: UserDisplayNameSource): string | null => {
  const name = textOrNull(user.name);
  if (name) return name;

  const composed = [user.firstName, user.lastName].map(textOrNull).filter(Boolean).join(" ");
  return composed || null;
};

export const getUserGreetingName = (
  user: UserDisplayNameSource,
  fallback = "there",
): string => textOrNull(user.firstName) || fallback;
