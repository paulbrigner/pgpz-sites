/**
 * AWS SDK v3 resolves temporary role, SSO, profile, or other credentials from
 * its default provider chain when the credentials field is omitted.
 */
export function awsRuntimeClientConfig(region: string) {
  return { region } as const;
}
