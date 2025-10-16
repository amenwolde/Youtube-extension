import React, { useState } from "react";
import FloatingButton from "./FloatingButton";

function App() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");

  const handleSend = async () => {
  if (!input.trim()) return;

  const userMessage = { from: "user", text: input };
  setMessages((prev) => [...prev, userMessage]);
  setInput("");

  try {
    const response = await fetch("http://127.0.0.1:8000/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: input }),
  });

    if (!response.ok) throw new Error("Server error");
    const data = await response.json();
    const assistantMessage = { from: "assistant", text: data.answer };
    setMessages((prev) => [...prev, assistantMessage]);
  } catch (err) {
    setMessages((prev) => [
      ...prev,
      { from: "assistant", text: "❌ Error: could not get response." },
    ]);
  }
};

  return (
    <div>
      {isOpen && (
        <div style={overlayStyle}>
          <div style={{ flexGrow: 1, overflowY: "auto", maxHeight: "60vh" }}>
            {messages.map((msg, idx) => (
              <div key={idx} style={bubble(msg.from)}>
                {msg.text}
              </div>
            ))}
          </div>

          <div style={inputContainer}>
            <input
              type="text"
              placeholder="Ask something..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              style={inputStyle}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSend();
              }}
            />
            <button onClick={handleSend} style={micBtn}>
              🎤
            </button>
          </div>
        </div>
      )}

      <FloatingButton onClick={() => setIsOpen(!isOpen)} />
    </div>
  );
}

const overlayStyle = {
  position: "fixed",
  bottom: 100,
  right: 20,
  width: 300,
  backgroundColor: "#fff",
  borderRadius: 12,
  boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
  padding: 20,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const bubble = (from) => ({
  backgroundColor: from === "user" ? "#d1e7dd" : "#f8f9fa",
  padding: "10px 14px",
  borderRadius: "16px",
  margin: "6px 0",
  alignSelf: from === "user" ? "flex-end" : "flex-start",
  maxWidth: "90%",
});

const inputContainer = {
  display: "flex",
  marginTop: 10,
  gap: 8,
};

const inputStyle = {
  flexGrow: 1,
  padding: 10,
  borderRadius: 10,
  border: "1px solid #ccc",
};

const micBtn = {
  fontSize: 20,
  padding: "0 12px",
  borderRadius: 10,
  border: "none",
  backgroundColor: "#007bff",
  color: "white",
  cursor: "pointer",
};

export default App;
