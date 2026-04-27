# Clara

A live voice assistant app built with **React + Bun** (frontend) and **FastAPI + UV + Google ADK** (backend).

## Project Structure

```
clara/
├── backend/
│   ├── clara_agent/
│   │   ├── agent.py      # ADK agent definition (Clara Live)
│   │   ├── main.py       # FastAPI app with /live websocket endpoint
│   │   └── .env          # API key config (copy from .env.example)
│   ├── pyproject.toml    # UV dependencies
│   └── .env.example
└── frontend/
    ├── public/
    │   └── audio-capture-worklet.js
    ├── src/
    │   ├── App.jsx       # Voice-first UI
    │   ├── audio/        # Browser audio capture/playback helpers
    │   ├── main.jsx      # Entry point
    │   └── index.css     # Live UI styles
    ├── package.json      # Bun dependencies
    └── vite.config.js    # Dev proxy to backend
```

## Prerequisites

- [Bun](https://bun.sh) installed
- [UV](https://docs.astral.sh/uv) installed
- A [Google AI Studio](https://aistudio.google.com/app/apikey) API key

## Setup

1. **Copy and fill the backend `.env`:**
   ```bash
   cp backend/.env.example backend/clara_agent/.env
   # Edit backend/clara_agent/.env and add your GOOGLE_API_KEY
   ```

2. **Install backend dependencies:**
   ```bash
   cd backend
   uv sync
   ```

3. **Install frontend dependencies:**
   ```bash
   cd frontend
   bun install
   ```

## Running

Start the backend (port 8000):
```bash
cd backend
uv run uvicorn clara_agent.main:app --host 127.0.0.1 --port 8000 --reload
```

Start the frontend (port 5173):
```bash
cd frontend
bun run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser, allow microphone access, and use the live controls to speak with Clara.

## How It Works

- **Frontend:** React live voice UI. Streams microphone PCM audio to the backend over `/live`, plays streamed assistant audio, and renders input/output transcripts.
- **Backend:** FastAPI exposes a `WebSocket /live` endpoint. It uses Google ADK's `Runner.run_live(...)` and `InMemorySessionService` for live bidirectional audio sessions.
- **ADK Agent:** `clara_agent` uses `gemini-3.1-flash-live-preview` with a spoken-conversation persona tuned for short, natural turns.
