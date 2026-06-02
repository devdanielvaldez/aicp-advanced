# @aicp/project

Project workspace for AICP – code indexing, vector search, and real‑time context retrieval for JavaScript/TypeScript projects.

## Features

- Index entire JS/TS codebases into a vector database (SQLite + sqlite-vec)
- Semantic search over code chunks
- Detect changes and update index incrementally
- Provide relevant context to AICP model pools for accurate code assistance

## Usage (internal)

This package is used by the `aicp project` CLI commands. It is not intended for direct use outside the AICP monorepo.

## API

- `ProjectManager` – manage indexed projects
- `VectorStore` – store and search code embeddings
- `ProjectScanner` – scan and chunk a codebase
- `Retriever` – retrieve relevant context for a query