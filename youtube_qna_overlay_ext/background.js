// background.js
// Proxies fetch requests to your local backend if the content script is blocked by CORS.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "ASK_BACKEND") {
    (async () => {
      try {
        const res = await fetch(msg.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(msg.body || {}),
        });
        const data = await res.json();
        sendResponse({ ok: true, data });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true; // keep the message channel open for async response
  }
});
