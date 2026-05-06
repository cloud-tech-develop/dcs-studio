# AGENTS.md — seedance-studio-v05

## Project

Single-file Express backend (`server.js`) serving static frontend from `public/`. No framework, no build step, no tests, no lint, no CI. ESM (`"type": "module"`).

## Commands

| Command | What it does |
|---|---|
| `npm start` | Start server on port 3000 |
| `npm run dev` | Start with `node --watch` (auto-reload) |
| `node server.js` | Same as start |

No other scripts exist. No typecheck, lint, test, or build commands.

## Architecture

```
server.js          ← Express backend + BytePlus API client + prompt compiler
public/
  index.html       ← SPA UI (DCS brand)
  styles.css       ← Design system
  app.js           ← Frontend logic + UI
presets.json       ← Cinematographic preset library (lens, camera, grade, motion, genre)
keys.json          ← API keys + endpoints (gitignored, managed via UI panel)
outputs/           ← Downloaded .mp4 videos + prompt .txt (gitignored, auto-created)
```

- `server.js` is the **only** backend file. All API routes, key management, prompt compilation, and asset handling live here.
- Frontend is plain HTML/CSS/JS — no bundler, no framework.
- `byteplus-signer.js` is a custom AWS SigV4-style signer for the BytePlus Assets API (management plane).

## Key Management

- API keys are **not** in `.env`. They are added via the UI panel (top-right `⚿ API`).
- Keys persist in `keys.json` (never committed). Multiple keys supported; switch without restart.
- Each key is tied to an endpoint: `byteplus_ap` (Singapore) or `volcengine_cn` (China). Default is `byteplus_ap`.
- `.env` only sets `ARK_BASE_URL`, `DEFAULT_MODEL`, and `PORT`. See `.env.example`.

## BytePlus / Seedance 2.0

- Base URL: `https://ark.ap-southeast.bytepluses.com/api/v3`
- Model IDs include date suffix (e.g. `260128`) — changes each release.
- Two models: `dreamina-seedance-2-0-260128` (Pro, has audio) and `dreamina-seedance-2-0-fast-260128` (Fast, no audio).
- **Resource pack required** before any generation works. Buy at BytePlus console.
- Rate limit: 2 QPS per account, max 3 concurrent tasks.
- Video URL extraction is heuristic (`findVideoUrl` in `server.js`) — BytePlus response shape varies by model version.

## Assets API (Private Virtual Portrait Library)

- Uses **AK/SK signed requests** (not Bearer token) to `open.byteplusapi.com`.
- Requires `ak` and `sk` fields on a key (set via UI). Inference and Assets API use different auth planes.
- Custom signer in `byteplus-signer.js` — do not replace with a generic AWS signer; BytePlus SigV4 has minor differences.

## Preset Workflow

Two ways to edit presets:
1. **Excel**: Edit `seedance-prompts.xlsx` → run `import-presets.bat` (or `./import-presets.sh`) → hard-reload browser (`Ctrl+Shift+R`). Requires Python 3.9+ and `openpyxl`. Creates timestamped backup.
2. **Direct JSON**: Edit `presets.json` → restart server → reload browser.

Categories: `lens`, `camera`, `colorGrading`, `cameraMotion`, `genre`, `aspectRatio`, `resolution`. Only `aspectRatio` and `resolution` use `value` field; all others use `prompt`.

## Prompt Compiler

`buildPayload()` in `server.js` constructs the full API request. It:
- Assembles text from user prompt + selected preset prompts (camera, lens, motion, grade, genre)
- Embeds multimodal assets as base64 inline (images, video, audio) — no server roundtrip for uploads
- Sets top-level fields: `ratio`, `duration`, `resolution`, `camerafixed`, `watermark`, `generate_audio`

## Gotchas

- `express.json({ limit: '50mb' })` — needed for base64 image/video payloads.
- `start.bat` auto-detects stale `keys.json` (missing `endpoint` field) and deletes it to force re-add.
- Polling timeout: 10 minutes. Pro 1080p takes 2–4 min normally.
- `outputs/` directory is auto-created by the server when saving completed videos.
- `_trustedAssets` and `_loggedTasks` are in-memory only — cleared on restart.
