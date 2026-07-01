# MJW README Generator — TODO

## Backend / Server
- [x] DB schema: readme_generations table (project_name, stack, deps_count, scripts, env_vars, deployment, file_count, readme, source, source_label, model, model_label, template_name, has_reference, context, user_id, created_at)
- [x] DB schema: readme_templates table (name, content, char_count, user_id, created_at)
- [x] tRPC router: readme.generateZip (multipart upload → S3 → parse → LLM → save to DB)
- [x] tRPC router: readme.generateUrl (GitHub URL → fetch zipball → parse → LLM → save to DB)
- [x] tRPC router: readme.listModels (return available LLM model IDs)
- [x] tRPC router: readme.history (list generations for user)
- [x] tRPC router: readme.historyItem (get single generation)
- [x] tRPC router: readme.deleteGeneration
- [x] tRPC router: readme.rerun (regenerate from stored context)
- [x] tRPC router: templates.list
- [x] tRPC router: templates.create
- [x] tRPC router: templates.delete
- [x] ZIP parser utility: extract stack, deps, scripts, env_vars, tree, config files
- [x] GitHub fetch utility: download zipball with 40MB size guard
- [x] LLM generation utility: build system prompt (with optional style reference), call invokeLLM
- [x] MJW banner: prepend centered banner HTML to generated README

## Frontend
- [x] Global layout: dark brutalist theme (JetBrains Mono), CSS variables, scrollbar
- [x] App.tsx: two-pane layout (sidebar left, preview right)
- [x] DropZone component: drag-and-drop / file picker for ZIP
- [x] GitHubImport component: URL input with import button
- [x] ModelPicker component: dropdown for Claude/GPT, persisted in localStorage
- [x] StyleReference component: upload .md/.txt reference, clear chip
- [x] TemplateDropdown component: pick/delete saved templates
- [x] SaveTemplateControl component: save current reference as named template
- [x] BannerToggle component: on/off toggle, persisted in localStorage
- [x] GenerateButton component: triggers ZIP or URL generation
- [x] TerminalLoader component: animated step-by-step progress display
- [x] AnalysisSummary component: badges for stack, scripts, env vars, deployment, deps
- [x] MarkdownPreview component: rendered + raw tabs, copy + download buttons
- [x] HistoryList component: list of past generations with source/model/template badges
- [x] HistoryItem component: load, delete, re-run, compare toggle actions
- [x] CompareView component: side-by-side panes with Preview / Raw / Diff / Merge modes
- [x] DiffView: line-by-line unified diff with +/- coloring and summary
- [x] MergeView: section-by-section A/B picker with live assembled preview
- [x] EmptyPreview component: branded empty state with feature cards
- [x] NeonLogo component: animated MJW Design wordmark

## Tests
- [x] Vitest: ZIP parser unit test (buildContext)
- [x] Vitest: GitHub fetch unit test (parseGithubRepo)
- [x] Vitest: LLM prompt builder unit test (MJW_BANNER)
- [x] Vitest: tRPC auth logout integration test (existing)

## Streaming Generation
- [x] Server: add /api/readme/stream-zip and /api/readme/stream-url Express SSE endpoints
- [x] Server: modify llmGenerator to support stream:true and pipe SSE chunks
- [x] Server: save completed generation to DB after stream ends
- [x] Frontend: replace generateZip/generateUrl tRPC mutations with fetch-based SSE consumer
- [x] Frontend: render tokens progressively in MarkdownPreview as they arrive
- [x] Frontend: show streaming cursor indicator while generation is in progress
- [x] Frontend: handle stream errors and abort gracefully
