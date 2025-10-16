# YouTube Q&A Overlay (Chrome Extension, MV3)

This extension overlays your chat widget on any YouTube page and forwards user questions to your local backend (e.g., FastAPI at `http://127.0.0.1:8000/ask`).

## Files
- `manifest.json` — Extension manifest (MV3)
- `background.js` — Service worker; proxies fetch to bypass CORS if needed
- `content.js` — Injects the floating overlay and handles UI + network calls
- `icons/` — Placeholder icons

## Quick Start
1. Ensure your backend is running and accepts:
   ```json
   POST /ask
   { "question": "..." }
   ```
   and returns:
   ```json
   { "answer": "..." }
   ```

2. Load the extension in Chrome:
   - Open `chrome://extensions`
   - Toggle **Developer mode** (top-right)
   - Click **Load unpacked**
   - Select this folder

3. Go to any YouTube page. Click the 💬 button at bottom-right to open the Q&A card.

## Notes
- The content script first tries a **direct fetch** to `http://127.0.0.1:8000/ask`. If blocked by CORS, it falls back to the **background proxy** (works because `host_permissions` include `127.0.0.1`).
- Change `BACKEND_URL` in `content.js` if your server runs elsewhere.
- The overlay is isolated in a **Shadow DOM** to prevent style conflicts.

## Troubleshooting
- If you don't see the 💬 button, refresh the page.
- If messages don't send, check your backend logs and confirm the URL matches `BACKEND_URL`.
- For HTTPS backends or different ports, add them to `host_permissions` in `manifest.json`.
