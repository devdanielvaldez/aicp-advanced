# 🤖 AICP – AI Consensus Protocol

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![Ollama](https://img.shields.io/badge/Ollama-0.1.2+-green)](https://ollama.ai)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**AICP** is a production‑grade framework that orchestrates **structured debates** between multiple local LLMs, then **votes** to reach a consensus. It combines Byzantine Fault Tolerance (BFT), swarm intelligence (PSO), and real‑time streaming to deliver a unified, authoritative answer.

![AICP Demo](https://via.placeholder.com/800x400?text=AICP+Debate+in+Action)

---

## ✨ Features

- 🧠 **Multi‑model debates** – run llama2, mistral, phi3, gemma, etc. side by side.
- 🗳️ **Democratic voting** – models vote for the best answer (cannot vote for themselves).
- ⚡ **Real‑time streaming** – watch every argument, rebuttal, and vote as it happens.
- 🛡️ **BFT‑inspired consensus** – Byzantine fault tolerance (optional) for critical applications.
- 🐝 **Swarm optimisation** – Particle Swarm Optimisation (PSO) dynamically weights model responses.
- 📊 **Reputation system** – models gain or lose reputation based on past debate performance.
- 🖥️ **Modern CLI** – interactive menu with logo, coloured output, and intuitive workflow.

---

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Ollama](https://ollama.ai) running locally (or on a remote server)
- At least one model pulled, e.g. `ollama pull llama3:8b`

### Installation

```bash
git clone https://github.com/YOUR_USERNAME/aicp-advanced.git
cd aicp-advanced
npm install
npm run build