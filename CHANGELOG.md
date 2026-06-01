# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] – 2026-06-01

### Added

- **Model Pools** – create named pools of models with a specialty description. Pools auto‑generate a system prompt based on the description.
- **Code‑focused debates** – tailored prompts for software development: models output reasoning and code blocks in any language.
- **Streaming synthesis** – final answer streams token by token with full Markdown rendering (syntax highlighting, lists, bold, italic).
- **Pool management CLI commands** – `create`, `list`, `show`, `edit`, `delete`, `regenerate-prompt`, and `chat`.
- **Interactive pool selection** – all pool commands now use a searchable, mouse‑friendly list (via `@inquirer/select`).
- **Large context support** – token limits increased to 32k for proposals/arguments/rebuttals, 65k for synthesis. Context window (`num_ctx`) set to 65k by default.
- **Markdown terminal renderer** – custom renderer with syntax highlighting, code block borders, heading styles, and inline formatting.
- **Graceful `Ctrl+C` handling** – captures `ExitPromptError` and exits with code 0, avoiding npm error messages.
- **Self‑vote rejection** – voting phase discards any vote where a model tries to vote for itself.
- **Random vote fallback** – after 3 failed attempts, a random candidate is assigned to ensure every model votes.
- **Inline streaming styling** – keywords (REASONING, ANSWER, CODE, CRITIQUE, etc.) are highlighted in real time during debates.

### Changed

- **CLI menu** – redesigned with dynamic pool count display, mouse‑friendly selections, and a polished logo.
- **Default focus** – shifted entirely to developer use cases; removed general‑purpose debate options from the main menu.
- **Prompts** – redesigned for coding tasks: strict format (REASONING + CODE), language‑agnostic, with emphasis on error handling and best practices.
- **Token budgets** – drastically increased to support long code generation (32k–65k tokens).
- **Ollama client** – `chatStream` and `chat` now accept `numCtx` to control context window size.
- **Voting temperature** – lowered to 0.01 to enforce format compliance.
- **Synthesis phase** – now uses streaming (`callModelStreaming`) instead of non‑streaming call, allowing real‑time final answer output.

### Fixed

- **Truncated responses** – eliminated by raising token limits and removing preview truncation in output.
- **Inconsistent model behaviour** – enhanced refusal detection and retry logic for all phases.
- **Pool name input** – replaced free‑text with interactive list for all pool operations, eliminating typos.

### Removed

- **General‑purpose debate options** from main menu (now only pools and models management remain).
- **Old `consensus` command** from interactive menu (still available via CLI arguments for backward compatibility).

## [1.2.0] – 2026-05-27

### Added

- **Self‑evaluation phase** – models rate their own accuracy, honesty, clarity, and confidence after the debate. Updates reputation based on self‑assessment (optional flag `--self-eval`).
- **Turbo mode** (`--turbo`) – optimises system resources by increasing process priority (`renice`), setting Ollama environment variables, and displaying hardware recommendations (CPU, RAM, GPU).
- **Voting fallback** – if a model fails to produce a parseable vote after 3 retries, a random valid vote is assigned to ensure every model votes.
- **Resource analyzer** – shows CPU cores, load, free RAM, GPU presence, and recommended model types before the debate.
- **Graph visualiser enhancements**:
  - Multi‑line streaming text under each node (35 chars per line, up to 3 lines).
  - Draggable nodes with collision forces to prevent overlap.
  - Dark theme, larger talking nodes (radius 35).
  - Real‑time log panel with phase‑coloured entries.
- **CLI menu** expanded to include 20 combinations of normal/interactive/graph/turbo/self‑eval.

### Changed

- **Prompts completely rewritten** – replaced aggressive language (“critique”, “attack”) with simulation‑friendly phrasing (“identify differences”, “counter”). Added explicit format markers (`ANSWER:`, `DIFFERENCE:`, `COUNTER:`, etc.) to reduce model refusals.
- **Vote temperature** lowered to 0.01 for deterministic output.
- **Reputation initialisation** – all selected models now get a default score of 0.5 (no more zeros).
- **Retry logic** increased to 3 attempts for voting.
- **HTTP timeout** increased to 300 seconds to accommodate slower models.

### Fixed

- Models that responded with “I cannot answer” are now retried and excluded only after repeated failures.
- Self‑votes are discarded and trigger a warning.
- Graph HTML loading error – externalised to `graph-viewer.html` and served via `fs.readFileSync`.
- Spinner not stopping on failure – now `spinner.stop()` is called before error handling.

## [1.1.0] – 2026-05-27

### Added

- **Real‑time graph visualization** – live D3.js graph with draggable nodes, multi‑line streaming text, and dark theme. Each model appears as a separate node with edges showing who is responding to whom.
- **WebSocket server** for graph events – broadcasts `model_speaking`, `stream_chunk`, `vote`, `winner` in real time.
- **Interactive debate mode** – user can select which model’s answer to focus on during the argument round (focus on a specific model, random, or all answers).
- **Streaming client (`chatStream`)** – token‑by‑token output for proposals, arguments, rebuttals, and votes.
- **Automatic model warmup** – measures latency and excludes models slower than 30 seconds before debate starts.
- **Refusal detection** – models that respond with “I cannot answer” are retried and excluded if persistent.
- **Graph viewer** includes a side log panel with phase‑coloured entries and timestamped messages.

### Changed

- **Improved graph viewer** – larger nodes when talking (radius 35), collision forces to prevent overlap, log panel widened to 450px.
- **Lowered temperature** for voting to `0.05` to enforce strict format compliance.
- **Increased token limits** for proposals to `300` and synthesis to `500`.
- **Energy reputation update** now penalises latency more aggressively (`-0.1` per 10 seconds).
- **Removed `console.clear()`** from main menu – debate output remains visible after returning.
- **Renamed project branding** to AICP (was AICP‑Advanced).

### Fixed

- **Timeout issues** – increased HTTP timeout to 300 seconds and added retry logic for all model calls.
- **Self‑voting** – models are instructed explicitly not to vote for themselves, and the parser discards self‑votes.
- **Empty responses** – models that return `[No response]` are excluded from the active set.
- **Spinner not stopping** on failure – ensured `spinner.stop()` is called before error handling.
- **Graph server HTML not loading** – externalised HTML to a separate file and served via `fs.readFileSync`.

### Removed

- **Legacy `commander`‑based argument parsing** – replaced by interactive menu.
- **Old voting placeholder** – replaced by full streaming vote with format enforcement.

## [1.0.0] – 2026-05-25

### Added

- Initial public release
- Structured debate engine (proposals → arguments → rebuttals → voting → synthesis)
- Real‑time streaming for all model outputs
- Model warmup and automatic exclusion of slow/unresponsive models
- Voting with self‑vote rejection and tie‑break by reputation
- Modern interactive CLI with logo and menu
- Support for any Ollama‑compatible model
- Reputation persistence (SQLite)
- BFT and PSO modules (optional)
- Monorepo structure with workspaces

### Security

- No API keys hardcoded – all communication goes through local Ollama instance