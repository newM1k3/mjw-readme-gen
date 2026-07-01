export const ENV = {
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",

  // GitHub OAuth (self-hosted login) — create an OAuth App at
  // https://github.com/settings/developers with callback URL
  // {origin}/api/oauth/callback
  githubClientId: process.env.GITHUB_CLIENT_ID ?? "",
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",

  // Anthropic (direct) — used for README generation
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",

  // Optional S3-compatible storage for archiving uploaded zips.
  // Storage is best-effort: if unset, uploads simply aren't archived.
  s3Bucket: process.env.AWS_S3_BUCKET ?? "",
  s3Region: process.env.AWS_REGION ?? "us-east-1",
};
