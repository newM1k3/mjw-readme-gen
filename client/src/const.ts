export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// GitHub OAuth login (self-hosted) — the server's /api/oauth/login route
// builds the same URL, but generating it here avoids an extra redirect hop.
export const getLoginUrl = () => {
  const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "read:user user:email");

  return url.toString();
};
