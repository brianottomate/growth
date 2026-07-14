export function linkedinProfileDatasetFor(
  url: string,
): "linkedinProfile" | "linkedinPersonProfile" {
  try {
    return new URL(url).pathname.startsWith("/in/")
      ? "linkedinPersonProfile"
      : "linkedinProfile";
  } catch {
    return "linkedinProfile";
  }
}
