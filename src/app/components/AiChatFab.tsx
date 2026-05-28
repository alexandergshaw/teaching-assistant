import { useState } from "react";
import styles from "../page.module.css";

export default function AiChatFab() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<{role: "user"|"assistant", text: string}[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    setMessages(msgs => [...msgs, { role: "user", text: input }]);
    setLoading(true);
    setInput("");
    // Replace this with your LLM API call
    const response = await fetch("/api/ai-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [...messages, { role: "user", text: input }] })
    });
    const data = await response.json();
    setMessages(msgs => [...msgs, { role: "assistant", text: data.reply }]);
    setLoading(false);
  }

  return (
    <>
      <button
        className={styles.fab}
        aria-label="Open AI Chatbot"
        onClick={() => setOpen(true)}
        style={{position: "fixed", bottom: 24, right: 24, zIndex: 1000}}
      >
        💬
      </button>
      {open && (
        <div className={styles.chatModal} style={{position: "fixed", bottom: 90, right: 24, zIndex: 1001, width: 340, maxWidth: "90vw", background: "#fff", borderRadius: 12, boxShadow: "0 4px 32px rgba(0,0,0,0.18)", padding: 0, display: "flex", flexDirection: "column"}}>
          <div style={{padding: "12px 16px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center"}}>
            <span><b>AI Chatbot</b></span>
            <button aria-label="Close" onClick={() => setOpen(false)} style={{background: "none", border: "none", fontSize: 20, cursor: "pointer"}}>&times;</button>
          </div>
          <div style={{flex: 1, overflowY: "auto", padding: 16, minHeight: 180}}>
            {messages.length === 0 && <div style={{color: "#888"}}>Ask me anything!</div>}
            {messages.map((m, i) => (
              <div key={i} style={{margin: "8px 0", textAlign: m.role === "user" ? "right" : "left"}}>
                <span style={{background: m.role === "user" ? "#e0f7fa" : "#f1f1f1", borderRadius: 8, padding: "6px 12px", display: "inline-block"}}>{m.text}</span>
              </div>
            ))}
            {loading && <div style={{color: "#888"}}>Thinking...</div>}
          </div>
          <form onSubmit={sendMessage} style={{display: "flex", borderTop: "1px solid #eee", padding: 8}}>
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Type your message..."
              style={{flex: 1, border: "none", outline: "none", fontSize: 16, padding: 8, borderRadius: 6, background: "#f9f9f9"}}
              disabled={loading}
              autoFocus
            />
            <button type="submit" disabled={loading || !input.trim()} style={{marginLeft: 8, background: "#1976d2", color: "#fff", border: "none", borderRadius: 6, padding: "0 16px", fontSize: 16, cursor: "pointer"}}>Send</button>
          </form>
        </div>
      )}
    </>
  );
}
