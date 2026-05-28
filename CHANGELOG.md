# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] – 2025-05-27

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

### Removed

- None.

## [1.1.0] – 2025-05-27

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

## [1.0.0] – 2025-05-25

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