# AI Website Builder

A self-hosted web app that generates complete, styled websites from a text prompt using AI. Describe what you want, and get a live-previewable HTML page in seconds.

## Features

- **Prompt-to-site** — Describe a website in plain English and get a full HTML/CSS page
- **Live preview** — Generated sites are served instantly on a separate port
- **Iteration** — Edit your prompt and regenerate; conversation history is sent to the model for context
- **Password protection** — Optional HTTP Basic Auth on the builder UI
- **Favicon** — Built-in pencil emoji favicon on the editor

## Stack

- **Runtime:** Node.js 20 (Alpine) + Express
- **AI:** [OpenRouter](https://openrouter.ai/) API (default model: `anthropic/claude-sonnet-4`)
- **Deployment:** Docker Compose

## Quick Start

```bash
git clone https://github.com/DennisFaucher/ai-website-builder.git
cd ai-website-builder
cp .env.example .env
```

Edit `.env` with your values:

```
OPENROUTER_API_KEY=sk-or-v1-...
SITE_PASSWORD=changeme
```

Then:

```bash
docker compose up -d --build
```

| Port | Service |
|------|---------|
| `40033` | Builder UI (password-protected) |
| `40035` | Live preview of generated site |

Adjust host ports in `docker-compose.yml` as needed.

## How It Works

1. You enter a prompt (e.g. "A modern landing page for a coffee shop").
2. The app sends the prompt — along with any previous prompt/response history — to OpenRouter.
3. The AI returns a self-contained HTML file, which is written to `data/index.html`.
4. The preview server immediately serves the updated page.

Generated sites use inline CSS only (no external dependencies), so they work as standalone HTML files.

## Configuration

| Variable | Required | Description |
|---|---|---|
| `OPENROUTER_API_KEY` | Yes | API key from [openrouter.ai](https://openrouter.ai/keys) |
| `SITE_PASSWORD` | No | Password for HTTP Basic Auth on the builder UI (username: `admin`) |
| `PREVIEW_EXTERNAL_PORT` | No | External port for preview links shown after generation (default: `40035`) |

## Project Structure

```
├── server.js            # Express server (builder + preview)
├── Dockerfile
├── docker-compose.yml
├── package.json
├── public/
│   └── index.html       # Builder UI
├── .env.example         # Template for environment variables
└── data/                # Generated site files (git-ignored)
    ├── index.html
    └── history.json
```

## License

MIT
