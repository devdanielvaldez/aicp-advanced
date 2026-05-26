# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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