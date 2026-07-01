import { ENV } from "./env";

export type GithubUserInfo = {
  openId: string;
  name: string | null;
  email: string | null;
};

async function exchangeCodeForAccessToken(
  code: string,
  redirectUri: string
): Promise<string> {
  const resp = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      client_id: ENV.githubClientId,
      client_secret: ENV.githubClientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!resp.ok) {
    throw new Error(`GitHub token exchange failed: ${resp.status}`);
  }

  const data = (await resp.json()) as { access_token?: string; error?: string };
  if (!data.access_token) {
    throw new Error(data.error || "GitHub token exchange returned no access_token");
  }
  return data.access_token;
}

async function fetchPrimaryEmail(accessToken: string): Promise<string | null> {
  const resp = await fetch("https://api.github.com/user/emails", {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/vnd.github+json",
      "user-agent": "mjw-readme-gen",
    },
  });
  if (!resp.ok) return null;

  const emails = (await resp.json()) as Array<{
    email: string;
    primary: boolean;
    verified: boolean;
  }>;
  const primary = emails.find((e) => e.primary && e.verified) || emails.find((e) => e.verified);
  return primary?.email ?? null;
}

export async function completeGithubLogin(
  code: string,
  redirectUri: string
): Promise<GithubUserInfo> {
  if (!ENV.githubClientId || !ENV.githubClientSecret) {
    throw new Error(
      "GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET."
    );
  }

  const accessToken = await exchangeCodeForAccessToken(code, redirectUri);

  const userResp = await fetch("https://api.github.com/user", {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/vnd.github+json",
      "user-agent": "mjw-readme-gen",
    },
  });
  if (!userResp.ok) {
    throw new Error(`GitHub user lookup failed: ${userResp.status}`);
  }

  const user = (await userResp.json()) as {
    id: number;
    login: string;
    name: string | null;
    email: string | null;
  };

  const email = user.email ?? (await fetchPrimaryEmail(accessToken));

  return {
    openId: `github:${user.id}`,
    name: user.name || user.login,
    email,
  };
}
