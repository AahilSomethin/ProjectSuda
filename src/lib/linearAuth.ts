/** Mirror of Rust linear_auth for frontend tests and documentation. */
export function buildLinearAuthHeader(
  apiKey: string,
  authType: "personal_api_key" | "oauth" = "personal_api_key",
): string {
  const trimmed = apiKey.trim();
  if (authType === "oauth") {
    return trimmed.startsWith("Bearer ") ? trimmed : `Bearer ${trimmed}`;
  }
  return trimmed.startsWith("Bearer ") ? trimmed.slice("Bearer ".length) : trimmed;
}
