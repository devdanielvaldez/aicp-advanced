# 🤖 AICP – AI Consensus Protocol

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![Ollama](https://img.shields.io/badge/Ollama-0.1.2+-green)](https://ollama.ai)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933)](https://nodejs.org)

**AICP** is a production‑grade framework that orchestrates **structured debates** between multiple local LLMs, then **votes** to reach a consensus. It combines real‑time streaming, democratic voting, a reputation system, optional graph visualisation, long‑term memory (RAG), self‑evaluation, and turbo mode – all running 100% locally via Ollama.

![AICP Banner](./assets/banner.png)

---

## 📋 Table of Contents

- [Features](#-features)
- [How It Works](#-how-it-works)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Quick Start](#-quick-start)
- [Detailed Usage](#-detailed-usage)
  - [Selecting Models](#1-selecting-models)
  - [Starting a Debate](#2-starting-a-debate)
  - [Debate Options (Interactive, Graph, Turbo, Memory, Self‑Eval)](#3-debate-options)
  - [Command Line (Advanced)](#4-command-line-advanced)
- [Configuration](#-configuration)
- [Architecture](#-architecture)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)
- [License](#-license)

---

## ✨ Features

- 🧠 **Multi‑model debates** – run Llama 3, Mistral, Phi‑3, Gemma, etc. side by side.
- 🗳️ **Democratic voting** – models vote for the best answer (cannot vote for themselves).
- ⚡ **Real‑time streaming** – watch every argument, rebuttal, and vote token by token.
- 📊 **Live graph visualiser** – D3.js graph with draggable nodes, edges, and streaming text.
- 🎮 **Interactive debate** – you choose which answer the models focus on during the argument round.
- 🚀 **Turbo mode** – automatically optimises system resources (CPU priority, Ollama env) for faster inference.
- 📝 **Self‑evaluation** – models rate their own accuracy, honesty, clarity, and confidence; updates reputation.
- 🧠 **Long‑term memory (RAG)** – stores past debates in a vector database and retrieves relevant context for future conversations.
- 📊 **Reputation system** – models gain or lose reputation (accuracy, energy, honesty) across debates.
- 🖥️ **Modern CLI** – interactive menu with logo, coloured output, and intuitive workflow.
- 🔌 **Extensible** – pluggable consensus algorithms, memory layers, and P2P networking (experimental).

---

## ⚙️ How It Works

1. **Warmup** – Each selected model receives a trivial prompt to measure latency. Models slower than 30 seconds are automatically excluded.
2. **Memory retrieval** (if enabled) – The system searches past debates for semantically similar topics and injects relevant context into the prompt.
3. **Proposals** – Every model gives its initial answer.
4. **Argument round** – Models see all proposals, identify differences, defend their own position, and concede points where appropriate.
5. **Rebuttal rounds** (configurable) – Models continue debating, refining their positions.
6. **Voting** – Each model (except itself) votes for the most accurate/well‑reasoned answer, providing a reason and confidence score.
7. **Synthesis** – The winning model writes a final, unified answer for the user.
8. **Self‑evaluation** (optional) – Models assess their own performance, influencing their reputation.
9. **Memory storage** (if enabled) – The final answer and topic are stored as a vector embedding for future retrieval.

All steps are **streamed** to the terminal – you see every token as it is generated.

---

## 📦 Prerequisites

- **Node.js** 18 or later (tested with v20+)
- **Ollama** installed and running ([ollama.ai](https://ollama.ai))
- At least two models pulled, for example:

```bash
ollama pull llama3:8b
ollama pull mistral:7b
```

- (For memory) An embedding model, e.g. `nomic-embed-text`:

```bash
ollama pull nomic-embed-text
```

> **Recommendation**: For best debate quality, use models with at least 7B parameters. Smaller models (2B‑3B) may give very short or irrelevant answers. Turbo mode helps even small models respond faster.

---

## 🛠 Installation

### 1. Clone the repository

```bash
git clone https://github.com/devdanielvaldez/aicp-advanced.git
cd aicp-advanced
```

### 2. Install dependencies

```bash
npm install
```

### 3. Build all packages

```bash
npm run build
```

### 4. (Optional) Install the CLI globally

```bash
npm install -g ./packages/cli
```

Now you can run `aicp` from anywhere.

---

## 🚀 Quick Start

Start the interactive CLI:

```bash
cd packages/cli
npm run dev
```

Or if installed globally:

```bash
aicp
```

You will see the main menu with options:

- 💬 Start a debate
- 🤖 Manage models (list, select, show selected)
- ❌ Exit

### First debate (quick example)

1. Go to **Manage models** → **Select models** and choose at least two models.
2. Go back and choose **Start a debate**.
3. Configure your debate:
   - Standard debate mode
   - Normal speed (or Turbo for faster responses)
   - Extra features: choose Graph (📊), Self‑Eval (📝), both, or none
   - Enable long‑term memory if you have pulled an embedding model
4. Enter your question and number of rounds.
5. Watch the models argue in real time.
6. Read the final answer.

---

## 📖 Detailed Usage

### 1. Selecting Models

- From the main menu, choose **Manage models** → **Select models**.
- A checklist of all locally available models appears.
- Press `space` to select/unselect, then `enter` to confirm.
- Your selection is saved in `~/.aicp/config.json`.

> **Tip**: Exclude very slow or unreliable models (like `llama2:latest` on CPU) to keep debates snappy.

---

### 2. Starting a Debate

From the main menu, choose **Start a debate**.

You will be guided through:

- **Debate mode** – Standard (models talk in sequence) or Interactive (you choose which answer to focus on during the argument round).
- **Processing speed** – Normal (full responses) or Turbo (optimised for speed).
- **Extra features** – Graph visualiser (📊), Self‑evaluation (📝), both, or none.
- **Long‑term memory** – Whether to store and retrieve past debates (requires an embedding model).

Then:

- **Prompt** – Type your question (e.g., *“Should autonomous vehicles prioritise passenger safety over pedestrians?”*).
- **Rounds** – Number of debate rounds (1–5). More rounds allow deeper discussion but take longer.

---

### 3. Debate Options Explained

| Option | Description |
|--------|-------------|
| **Standard mode** | Models respond one after another without user intervention. |
| **Interactive mode** | Before the argument round, you select which model’s answer the others should focus on (or pick random/all). |
| **Normal speed** | Default token budgets and temperature. |
| **Turbo mode** | Automatically `renice` the process, set Ollama environment variables (`OLLAMA_NUM_PARALLEL=1`, etc.), and prints system resource report. |
| **Graph** | Opens a browser window with a real‑time D3.js graph: nodes = models, edges = who is responding to whom, streaming text under each node. Draggable nodes, dark theme. |
| **Self‑Eval** | After the debate, each model rates its own answer on accuracy, honesty, clarity, and confidence (0.0–1.0). These scores are used to update its reputation. |
| **Long‑term memory** | Stores the debate (topic + final answer) as a vector embedding using `sqlite-vec`. When a new debate starts, the system retrieves up to 3 most similar past debates and injects them as context. |

---

### 4. Command Line (Advanced)

If you prefer the terminal over the interactive menu, use the CLI directly (after global install):

```bash
aicp list
aicp select
aicp consensus "Your question" --rounds 2 --graph --turbo --self-eval --memory
```

Available flags for `consensus`:

| Flag | Description |
|------|-------------|
| `--rounds <number>` | Number of debate rounds (1–5, default 2) |
| `--interactive` | Enable interactive focus selection |
| `--graph` | Launch the graph visualiser (opens browser) |
| `--turbo` | Optimise system resources for speed |
| `--self-eval` | Run self‑evaluation phase after debate |
| `--memory` | Enable long‑term memory (RAG) |

Example with all flags:

```bash
aicp consensus "Should AI have rights?" --rounds 3 --interactive --graph --turbo --self-eval --memory
```

Inside the `packages/cli` directory, you can also run:

```bash
npm run dev consensus "Your question" -- --rounds 2 --graph
```

---

## ⚙️ Configuration

All user configuration is stored in `~/.aicp/`:

| File | Purpose |
|------|---------|
| `config.json` | Selected models, P2P settings (future) |
| `reputation.db` | SQLite database with model reputation scores |
| `memory.db` | Vector database for long‑term memory (sqlite-vec) |

You can manually edit `config.json`:

```json
{
  "selectedModels": ["mistral:7b", "phi3:latest"],
  "p2pEnabled": false,
  "bootstrapPeers": []
}
```

### Reputation System

Reputation is automatically updated after each debate based on:

- **Accuracy** – whether a model’s answer belonged to the winning cluster.
- **Energy** – latency penalty (slower models lose a small amount of reputation).
- **Honesty** – updated by self‑evaluation (honesty score) or future cross‑endorsements.

The overall score is a weighted average (accuracy 50%, honesty 30%, energy 20%). New models start at 0.5.

---

## 🏗 Architecture

AICP is a **monorepo** with four TypeScript packages:

```
aicp-advanced/
├── packages/
│   ├── core/         # Consensus, BFT, PSO, reputation, vector memory
│   ├── cli/          # Interactive CLI, debate orchestrator, streaming client, graph server, memory (RAG)
│   ├── api/          # REST API (Prometheus metrics – stub)
│   └── p2p/          # Libp2p peer‑to‑peer layer (experimental)
└── tsconfig.base.json
```

### Key Modules in `@aicp/cli`

| Module | Purpose |
|--------|---------|
| `phases.ts` | Orchestrates proposal, argument, rebuttal, voting, synthesis phases. |
| `llm-calls.ts` | Streaming calls to Ollama with retries and graph events. |
| `graph-server.ts` | WebSocket + HTTP server for real‑time graph visualisation. |
| `memory.ts` | Vector storage and retrieval (RAG) using `sqlite-vec`. |
| `resource-manager.ts` | System analysis and turbo mode optimisations. |
| `prompts.ts` | Dynamic prompt building (supports file‑based overrides). |

All communication with Ollama uses HTTP streaming (`/api/chat` with `stream: true`).

---

## 🐞 Troubleshooting

| Problem | Likely cause | Solution |
|---------|--------------|----------|
| `Ollama is not running` | Ollama not started | Run `ollama serve` in another terminal. |
| Models excluded during warmup | Latency >30 seconds | Increase `SLOW_MODEL_THRESHOLD_MS` in `packages/cli/src/debate/config.ts`. |
| `timeout of 30000ms exceeded` | Model inference slow | Increase timeout in `client.ts` (axios) or use `--turbo`. |
| Graph page blank | HTML file not found | Ensure `packages/cli/src/debate/graph-viewer.html` exists. Re‑run `npm run build`. |
| Vote unparseable | Model didn't follow `VOTE:` format | The parser already includes fallback scanning. Lower temperature further (already 0.01). |
| Self‑vote | Model ignored instruction | Discarded by parser; improve prompt (already done). |
| Memory not working | Embedding model missing | Run `ollama pull nomic-embed-text` and ensure `sqlite-vec` is installed. |
| Reputation scores stay `0.000` | Missing database entry | The system now initialises scores automatically. Check `~/.aicp/reputation.db` permissions. |

---

## 🤝 Contributing

We welcome contributions! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

**Development workflow:**

```bash
git clone https://github.com/devdanielvaldez/aicp-advanced.git
cd aicp-advanced
npm install
npm run build
cd packages/cli
npm run dev
```

To add a new feature or fix a bug, create a branch, make changes, test, and open a Pull Request.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

## 🙏 Acknowledgements

- [Ollama](https://ollama.ai) – local LLM runtime
- [libp2p](https://libp2p.io) – future P2P networking
- [Inquirer.js](https://github.com/SBoudrias/Inquirer.js) – beautiful CLI prompts
- [sqlite-vec](https://github.com/asg017/sqlite-vec) – vector search for SQLite

---

**Built with ❤️ for the open‑source AI community**

[GitHub Repository](https://github.com/devdanielvaldez/aicp-advanced) – Star and fork welcome!