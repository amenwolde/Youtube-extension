// content.js
// Injects a floating Q&A overlay on YouTube and sends queries to your backend.
// It tries direct fetch first; if blocked by CORS, it falls back to background proxy.

const BACKEND_URL = "http://127.0.0.1:8000/ask"; // change if needed

(function initOnce() {
  if (window.__yt_qna_overlay_injected__) return;
  window.__yt_qna_overlay_injected__ = true;

  // Keep overlay across SPA navigations in YouTube
  document.addEventListener("yt-navigate-finish", () => {
    if (!document.getElementById("yt-assistant-host")) {
      mountOverlay();
    }
  });

  // Initial mount
  mountOverlay();
})();

function mountOverlay() {
  // Host for Shadow DOM (isolates styles from YouTube)
  const host = document.createElement("div");
  host.id = "yt-assistant-host";
  host.style.position = "fixed";
  host.style.bottom = "20px";
  host.style.right = "20px";
  host.style.zIndex = "2147483647"; // max-ish
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });

  // Styles scoped to shadow root
  const style = document.createElement("style");
  style.textContent = `
    .fab {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: #007bff;
      color: #fff;
      border: none;
      font-size: 26px;
      box-shadow: 0 4px 10px rgba(0,0,0,0.25);
      cursor: pointer;
    }
    .card {
      position: fixed;
      bottom: 100px;
      right: 20px;
      width: 320px;
      max-height: 70vh;
      display: none; /* toggled via JS */
      flex-direction: column;
      gap: 10px;
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.2);
      padding: 16px;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
    }
    .title {
      font-weight: 600;
      font-size: 14px;
      color: #111;
      opacity: 0.9;
    }
    .messages {
      flex: 1;
      overflow-y: auto;
      max-height: 50vh;
      padding-right: 4px;
    }
    .bubble {
      padding: 10px 14px;
      border-radius: 16px;
      margin: 6px 0;
      max-width: 90%;
      width: fit-content;
      word-wrap: break-word;
      white-space: pre-wrap;
      line-height: 1.3;
      font-size: 13px;
    }
    .user { background: #d1e7dd; margin-left: auto; }
    .assistant { background: #f8f9fa; margin-right: auto; }
    .row {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }
    .input {
      flex: 1;
      padding: 10px;
      border-radius: 10px;
      border: 1px solid #ccc;
      font-size: 13px;
    }
    .btn {
      padding: 0 12px;
      border-radius: 10px;
      border: none;
      background: #007bff;
      color: #fff;
      cursor: pointer;
      font-size: 18px;
    }
  `;
  shadow.appendChild(style);

  // UI nodes
  const card = el("div", { class: "card", id: "card" });
  const title = el("div", { class: "title" }, "Q&A Assistant");
  const messages = el("div", { class: "messages", id: "messages" });
  const row = el("div", { class: "row" });
  const input = el("input", { class: "input", placeholder: "Ask something…", type: "text" });
  const send = el("button", { class: "btn", title: "Send" }, "➤");

  row.append(input, send);
  card.append(title, messages, row);

  const fab = el("button", { class: "fab", id: "fab", title: "Open Q&A" }, "💬");

  shadow.append(card, fab);

  // Behavior
  fab.addEventListener("click", () => {
    card.style.display = card.style.display === "flex" ? "none" : "flex";
    input.focus();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSend();
  });
  send.addEventListener("click", handleSend);

  function appendBubble(text, who) {
    const b = el("div", { class: `bubble ${who}` });
    b.textContent = text;
    messages.appendChild(b);
    messages.scrollTop = messages.scrollHeight;
  }

  async function handleSend() {
    const q = input.value.trim();
    if (!q) return;
    appendBubble(q, "user");
    input.value = "";

    // Try direct fetch first
    try {
      const data = await askBackendDirect(q);
      appendBubble(data.answer ?? JSON.stringify(data), "assistant");
      return;
    } catch (e) {
      // fall through to proxy
    }

    // Fallback to background proxy (works if host_permissions include localhost/127.0.0.1)
    try {
      const data = await askBackendViaProxy(q);
      appendBubble(data.answer ?? JSON.stringify(data), "assistant");
    } catch (e2) {
      appendBubble("❌ Error: could not get response.", "assistant");
    }
  }

  async function askBackendDirect(question) {
    const res = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question })
    });
    if (!res.ok) throw new Error("Direct fetch failed");
    return res.json();
  }

  async function askBackendViaProxy(question) {
    const response = await chrome.runtime.sendMessage({
      type: "ASK_BACKEND",
      url: BACKEND_URL,
      body: { question }
    });
    if (!response || !response.ok) throw new Error(response?.error || "Proxy fetch failed");
    return response.data;
  }

  function el(tag, attrs = {}, text) {
    const n = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === "class") n.className = v;
      else if (k === "style") Object.assign(n.style, v);
      else n.setAttribute(k, v);
    });
    if (text != null) n.textContent = text;
    return n;
  }
}
