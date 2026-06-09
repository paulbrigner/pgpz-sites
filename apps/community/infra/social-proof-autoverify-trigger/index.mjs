const endpoint = process.env.AUTOVERIFY_URL || "https://community.pgpz.org/api/social-proof/x/autoverify";
const secret = process.env.SOCIAL_PROOF_AUTOVERIFY_SECRET || "";

export const handler = async () => {
  if (!secret) {
    throw new Error("SOCIAL_PROOF_AUTOVERIFY_SECRET is required");
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
      "user-agent": "pgpz-social-proof-autoverify/1.0",
    },
    body: JSON.stringify({ source: "eventbridge" }),
  });
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`PGPZ auto-verification endpoint returned ${res.status}: ${text.slice(0, 500)}`);
  }

  return {
    statusCode: res.status,
    body: text,
  };
};
