<div align="center">

![MJW Design](https://mjwdesign.ca/wp-content/uploads/2024/01/mjw-design-logo.png)

**Built with [MJW Design](https://mjwdesign.ca) — AI-Powered Development**

---

</div>

# MJW README Generator

A full-stack authenticated web application that analyses a GitHub repository or uploaded ZIP archive and generates a polished, production-grade `README.md` using an LLM. Users can supply a reference README to define a house style, pick from saved templates, compare two generations side-by-side, and re-run any previous generation with a different model or reference.

## Screenshots

| Generator — Idle State | Generator — Result with Analysis Summary |
| :---- | :---- |
| ![MJW README Generator idle](client/public/screenshots/idle.png) | ![MJW README Generator result](client/public/screenshots/result.png) |

> Screenshots are placeholders — capture from a running instance and save to `client/public/screenshots/`.

## What It Does

Unlike a simple "paste your repo and get a README" script, MJW README Generator is a stateful, multi-session tool built around a three-stage pipeline.

| Stage | What Happens |
| :---- | :---- |
| **Ingestion** | A ZIP archive is fetched from GitHub or uploaded directly. The server extracts up to 2,000 files, detects the tech stack from `package.json`, `requirements.txt`, and file extensions, reads config files, extracts environment variable names, and builds a structured context string. |
| **Generation** | The context string — plus an optional style-reference README — is sent to the configured LLM. The system prompt instructs the model to produce raw Markdown only, matching the reference's heading order, table layouts, and conventions without copying its project-specific facts. |
| **Persistence** | Every generation is saved to the database with its full context, model label, source, and metadata. Users can reload, re-run with a different model or reference, compare two generations in a diff view, and download the result as a `.md` file. |

**Key features:**

- ZIP upload or public GitHub URL as source
- Manual **Project Name Override** field to correct stale scaffold names
- Style-reference upload (`.md` or `.txt`) with save-as-template support
- Saved templates — pick, apply, and delete from the sidebar
- Model selector — any model available in the configured LLM provider
- MJW Design banner toggle — prepend or suppress the branded header
- Generation history with reload, re-run, delete, and side-by-side compare
- Diff and merge view for comparing two generations
- One-click Markdown download named after the detected project

## How to Use

Sign in with GitHub, then choose a source — either upload a ZIP archive of your repository or paste a public GitHub URL. Optionally type a project name in the **Project Name** field if the repo's `package.json` contains a generic scaffold name. Select a model, attach a style-reference README or pick a saved template, toggle the MJW banner on or off, then click **Generate README**.

The app analyses the repository, streams the generation, and displays the result in a live Markdown preview. Use the toolbar to copy, download, or re-run the generation. Previous generations appear in the history panel; select two to open the compare view.

## Stack

| Layer | Technology |
| :---- | :---- |
| UI framework | React 19 + TypeScript |
| Build tool | Vite 7 |
| Styling | Tailwind CSS 4 + shadcn/ui (Radix UI) |
| Icons | Lucide React |
| Routing | Wouter |
| API layer | tRPC 11 (end-to-end type-safe, no REST boilerplate) |
| Server | Express 4 + Netlify Functions adapter |
| ORM | Drizzle ORM + MySQL (TiDB-compatible) |
| LLM | Anthropic Claude (direct Messages API) |
| Auth | Self-hosted GitHub OAuth |
| File storage | AWS S3 (optional ZIP archiving) |
| Markdown rendering | react-markdown + remark-gfm + rehype-sanitize |
| Testing | Vitest |
| Hosting | Netlify |

## Prerequisites

- Node.js 20+ and pnpm
- A MySQL-compatible database (TiDB Serverless recommended)
- A GitHub OAuth App ([create one here](https://github.com/settings/developers))
- An Anthropic API key
- An AWS S3 bucket (optional — ZIP archiving only; generation works without it)

## Local Development

```bash
pnpm install
cp .env.example .env   # fill in required values (see Environment Variables below)
pnpm run db:push       # generate and apply Drizzle migrations
pnpm run dev           # starts Express + Vite dev server on http://localhost:3000
```

The dev server auto-selects an available port starting at 3000. GitHub OAuth requires a registered callback URL — set it to `http://localhost:3000/api/oauth/callback` in your GitHub OAuth App settings during local development.

## Quality Checks

```bash
pnpm run check    # TypeScript type check (no emit)
pnpm run test     # Vitest test suite (34 tests)
pnpm run format   # Prettier format
pnpm run build    # Full production build (Vite client + esbuild server)
```

## Available Scripts

```bash
pnpm run dev            # Start development server (http://localhost:3000)
pnpm run build          # Production build → dist/public (client) + dist/ (server)
pnpm run build:netlify  # Client-only build for Netlify Functions deployment
pnpm run start          # Start production Node server (dist/index.js)
pnpm run check          # TypeScript type check
pnpm run test           # Run Vitest test suite
pnpm run format         # Prettier format all files
pnpm run db:push        # Generate and apply Drizzle migrations
```

## Environment Variables

All variables are server-side unless prefixed with `VITE_`. The app will not start without the required variables.

| Variable | Required | Scope | Description |
| :---- | :---- | :---- | :---- |
| `DATABASE_URL` | **Required** | Server | MySQL connection string. Example: `mysql://user:password@host:3306/mjw_readme_gen` |
| `JWT_SECRET` | **Required** | Server | Long random string used to sign session JWT cookies. |
| `GITHUB_CLIENT_ID` | **Required** | Server | Client ID from your GitHub OAuth App. |
| `GITHUB_CLIENT_SECRET` | **Required** | Server | Client secret from your GitHub OAuth App. Never expose this in frontend code. |
| `VITE_GITHUB_CLIENT_ID` | **Required** | Browser/public | Same client ID, exposed to the browser to build the GitHub authorize URL. |
| `ANTHROPIC_API_KEY` | **Required** | Server | Anthropic API key for README generation via Claude. Never use a `VITE_` prefix. |
| `OWNER_OPEN_ID` | Optional | Server | GitHub open ID (`github:<numeric id>`) of the account that receives `role="admin"` on first sign-in. |
| `AWS_S3_BUCKET` | Optional | Server | S3 bucket name for archiving uploaded ZIPs. Generation works without this. |
| `AWS_REGION` | Optional | Server | AWS region for the S3 bucket. Defaults to `us-east-1`. Uses the standard AWS credential chain — no separate access key variables required. |

### GitHub OAuth Setup

1. Go to [GitHub Developer Settings](https://github.com/settings/developers) and create a new OAuth App.
2. Set **Homepage URL** to your deployed origin (e.g. `https://your-app.netlify.app`).
3. Set **Authorization callback URL** to `{your-deployed-origin}/api/oauth/callback`.
4. Copy the Client ID into both `GITHUB_CLIENT_ID` and `VITE_GITHUB_CLIENT_ID`.
5. Generate a Client Secret and copy it into `GITHUB_CLIENT_SECRET`.

## Netlify Deployment

The `netlify.toml` at the project root configures the Vite client build and routes all API traffic through a Netlify Function.

| Setting | Value |
| :---- | :---- |
| Build command | `npm run build:netlify` |
| Publish directory | `dist/public` |
| Functions directory | `netlify/functions` |
| API routing | `/api/*` → `/.netlify/functions/api/:splat` |

```toml
[build]
  command = "npm run build:netlify"
  publish = "dist/public"
  functions = "netlify/functions"

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/api/:splat"
  status = 200

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

Set all required environment variables in **Netlify → Site configuration → Environment variables** before deploying. Update the GitHub OAuth App callback URL to your Netlify domain.

## Project Structure

```
mjw-readme-gen/
├── client/                         # Vite + React frontend
│   ├── src/
│   │   ├── _core/hooks/            # useAuth (GitHub OAuth session)
│   │   ├── components/
│   │   │   ├── ui/                 # shadcn/ui Radix primitives
│   │   │   ├── AnalysisSummary.tsx # Repo metadata display after generation
│   │   │   ├── CompareView.tsx     # Side-by-side diff of two generations
│   │   │   ├── MarkdownPreview.tsx # Sanitized live Markdown renderer
│   │   │   ├── NeonLogo.tsx        # Branded idle-state logo
│   │   │   └── TerminalLoader.tsx  # Generation progress animation
│   │   ├── hooks/
│   │   │   └── useStreamGenerate.ts # tRPC mutation orchestration + callbacks
│   │   ├── pages/
│   │   │   └── Generator.tsx       # Main application page
│   │   └── App.tsx                 # Root router (wouter)
├── server/
│   ├── _core/                      # Platform scaffold (auth, tRPC, Express)
│   │   ├── githubOAuth.ts          # Self-hosted GitHub OAuth flow
│   │   └── llm.ts                  # Anthropic Messages API wrapper
│   ├── utils/
│   │   ├── zipParser.ts            # ZIP analysis, stack detection, name heuristics
│   │   ├── llmGenerator.ts         # System prompt builder + MJW banner
│   │   └── githubFetch.ts          # GitHub ZIP download + URL parser
│   ├── routers.ts                  # tRPC router (generateZip, generateUrl, history, templates)
│   ├── db.ts                       # Drizzle data layer (generations, templates)
│   ├── readme.test.ts              # Vitest test suite (34 tests)
│   └── storage.ts                  # S3 put/get helpers (optional)
├── drizzle/
│   ├── schema.ts                   # users, readme_generations, readme_templates
│   └── *.sql                       # Migration files
├── netlify/functions/api.ts        # Netlify Functions serverless-http adapter
├── shared/                         # Shared types and error constants
├── netlify.toml                    # Netlify build + redirect config
├── vite.config.ts                  # Vite client build config
└── vitest.config.ts                # Vitest config (server/**/*.test.ts scope)
```

## Keyboard Shortcuts

No custom keyboard shortcuts are implemented in the current release. All interactions are pointer-driven through the sidebar controls and toolbar buttons.

## Changelog

### v1.1.0 — Project Name Fix + Expanded Test Coverage

- Added `SCAFFOLD_NAMES` blocklist and `isScaffoldName()` helper to `zipParser`; auto-detection now rejects known template defaults (`vite-react-typescript-starter`, `my-app`, `starter`, etc.) and falls back to the repo root directory name.
- Added **Project Name Override** input field to the Generator sidebar so users can supply the correct name before generation.
- Threaded `projectNameOverride` through tRPC input schemas, the streaming hook, `buildContext()`, and the database save — override name is used consistently in the LLM context, history label, and downloaded filename.
- Expanded Vitest suite from 11 tests (3 describe blocks) to **34 tests** (5 describe blocks), covering scaffold name detection, `buildContext` override and edge cases, `buildSystemPrompt` reference injection and truncation, extended GitHub URL parsing, and MJW banner assertions.

### v1.0.1 — Security + Netlify Deployment

- Sanitized LLM-generated HTML in `MarkdownPreview` via `rehype-sanitize`, closing an indirect prompt-injection → stored XSS path.
- Replaced Manus-platform OAuth, storage, and LLM adapters with self-hosted equivalents: GitHub OAuth login, direct S3 for ZIP archiving, and the Anthropic Messages API for generation.
- Added Netlify Functions wrapper (`serverless-http`) and `netlify.toml` for production deployment.
- Removed dead scaffold files that were never wired into any route.

### v1.0.0 — Initial Build

- Full-stack README generation pipeline: ZIP ingestion, stack detection, LLM generation, Markdown preview.
- tRPC API with `generateZip`, `generateUrl`, `rerun`, history, and template CRUD endpoints.
- Style-reference upload and saved-template system.
- Generation history with reload, re-run, delete, and side-by-side compare view.
- MJW Design banner toggle.
- Drizzle ORM schema for `users`, `readme_generations`, and `readme_templates`.

---

Part of the **MJW Personal App Platform**.
