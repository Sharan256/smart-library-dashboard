import { useState, useRef, useEffect } from "react";

// ── Suggested starter questions shown on first open ──────────────────────────
const SUGGESTIONS = [
  "Which zone is the best to study right now?",
  "What is the peak hour in the library?",
  "How many available seats are there?",
  "Which zone has the best WiFi?",
  "What is the noise level across zones?",
];

// ── Format HH:MM for timestamps ─────────────────────────────────────────────
function nowTime() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ── Render **bold** markdown and newlines safely ─────────────────────────────
function FormattedText({ text }) {
  const parts = text.split(/(\*\*.*?\*\*|\n)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part === "\n") return <br key={i} />;
        if (part.startsWith("**") && part.endsWith("**"))
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        return part;
      })}
    </>
  );
}

// ── Typing animation dots ────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div style={styles.typingWrap}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ ...styles.dot, animationDelay: `${i * 0.18}s` }} />
      ))}
    </div>
  );
}

// ── Message bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div style={{ ...styles.msgRow, flexDirection: isUser ? "row-reverse" : "row" }}>
      {/* Avatar */}
      <div style={{ ...styles.avatar, ...(isUser ? styles.avatarUser : styles.avatarBot) }}>
        {isUser ? "You" : "AI"}
      </div>

      {/* Bubble + timestamp */}
      <div style={{ ...styles.msgCol, alignItems: isUser ? "flex-end" : "flex-start" }}>
        <div style={{ ...styles.bubble, ...(isUser ? styles.bubbleUser : styles.bubbleBot) }}>
          {msg.loading ? <TypingIndicator /> : <FormattedText text={msg.content} />}
        </div>
        {msg.time && <span style={styles.timestamp}>{msg.time}</span>}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      time: nowTime(),
      content:
        "Hi! I'm your Smart Library Assistant. I can help with occupancy, peak hours, zone conditions, WiFi, comfort scores, and more.\n\nTry one of the suggestions below to get started!",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);

  const bodyRef    = useRef(null);
  const inputRef   = useRef(null);
  const endRef     = useRef(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (isOpen) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isOpen]);

  // Focus input when opening
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 200);
  }, [isOpen]);

  const send = async (text) => {
    if (!text.trim() || loading) return;
    setShowSuggestions(false);
    const userMsg = { role: "user", content: text, time: nowTime() };
    const typingMsg = { role: "assistant", content: "", loading: true };

    setMessages((prev) => [...prev, userMsg, typingMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("http://localhost:8000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { role: "assistant", content: data.answer, time: nowTime() },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev.slice(0, -1),
        {
          role: "assistant",
          content: "Could not connect to the library server. Please try again.",
          time: nowTime(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  const handleTextareaInput = (e) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 90) + "px";
  };

  return (
    <>
      {/* ── FAB Button ────────────────────────────────────────────── */}
      <button onClick={() => setIsOpen((o) => !o)} style={styles.fab}>
        {isOpen ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        ) : (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="white">
            <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zm-2 10H6V10h12v2zm0-4H6V6h12v2z" />
          </svg>
        )}
      </button>

      {/* ── Chat Panel ────────────────────────────────────────────── */}
      {isOpen && (
        <div style={styles.panel}>

          {/* Header */}
          <div style={styles.header}>
            <div style={styles.headerAvatar}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1H1a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2zM7.5 13A1.5 1.5 0 0 0 6 14.5 1.5 1.5 0 0 0 7.5 16 1.5 1.5 0 0 0 9 14.5 1.5 1.5 0 0 0 7.5 13zm9 0A1.5 1.5 0 0 0 15 14.5 1.5 1.5 0 0 0 16.5 16 1.5 1.5 0 0 0 18 14.5 1.5 1.5 0 0 0 16.5 13z" />
              </svg>
            </div>
            <div style={styles.headerText}>
              <span style={styles.headerTitle}>Library Assistant</span>
              <span style={styles.headerSub}>
                <span style={styles.onlineDot} /> Online · Smart Analytics
              </span>
            </div>
            <button onClick={() => setIsOpen(false)} style={styles.closeBtn}>✕</button>
          </div>

          {/* Message body */}
          <div ref={bodyRef} style={styles.body}>
            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} />
            ))}

            {/* Suggestions (shown only once at the start) */}
            {showSuggestions && (
              <div style={styles.suggestionsWrap}>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    style={styles.chip}
                    onClick={() => send(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            <div ref={endRef} />
          </div>

          {/* Footer input */}
          <div style={styles.footer}>
            <div style={styles.inputRow}>
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={handleTextareaInput}
                onKeyDown={handleKeyDown}
                placeholder="Ask about zones, noise, WiFi, comfort…"
                disabled={loading}
                style={styles.textarea}
              />
              <button
                onClick={() => send(input)}
                disabled={loading || !input.trim()}
                style={{
                  ...styles.sendBtn,
                  opacity: loading || !input.trim() ? 0.5 : 1,
                  cursor: loading || !input.trim() ? "default" : "pointer",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              </button>
            </div>
            <p style={styles.hint}>Press Enter to send · Shift+Enter for new line</p>
          </div>
        </div>
      )}
    </>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  fab: {
    position: "fixed", bottom: 28, right: 28, zIndex: 1000,
    width: 56, height: 56, borderRadius: "50%",
    background: "#2563eb", border: "none", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: "0 4px 20px rgba(37,99,235,0.4)",
  },

  panel: {
    position: "fixed", bottom: 96, right: 28, zIndex: 999,
    width: 400, height: 580,
    background: "#fff",
    borderRadius: 16,
    border: "1px solid rgba(0,0,0,0.1)",
    display: "flex", flexDirection: "column",
    overflow: "hidden",
    boxShadow: "0 8px 40px rgba(0,0,0,0.14)",
    fontFamily: "'Segoe UI', system-ui, sans-serif",
  },

  header: {
    background: "#2563eb",
    padding: "14px 16px",
    display: "flex", alignItems: "center", gap: 10,
    flexShrink: 0,
  },
  headerAvatar: {
    width: 36, height: 36, borderRadius: "50%",
    background: "rgba(255,255,255,0.2)",
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  headerText: { flex: 1, display: "flex", flexDirection: "column", gap: 2 },
  headerTitle: { fontSize: 14, fontWeight: 600, color: "white" },
  headerSub: { fontSize: 11, color: "rgba(255,255,255,0.75)", display: "flex", alignItems: "center", gap: 5 },
  onlineDot: { display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#4ade80" },
  closeBtn: {
    background: "none", border: "none", cursor: "pointer",
    color: "rgba(255,255,255,0.8)", fontSize: 17, lineHeight: 1,
    padding: "6px 8px", borderRadius: 6,
  },

  body: {
    flex: 1, overflowY: "auto",
    padding: "14px 12px",
    display: "flex", flexDirection: "column", gap: 12,
    background: "#f5f7fa",
  },

  msgRow: {
    display: "flex", alignItems: "flex-end", gap: 8,
  },
  msgCol: { display: "flex", flexDirection: "column", gap: 3, maxWidth: "75%" },

  avatar: {
    width: 28, height: 28, borderRadius: "50%",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 10, fontWeight: 600, flexShrink: 0,
  },
  avatarBot:  { background: "#dbeafe", color: "#1d4ed8" },
  avatarUser: { background: "#e0e7ff", color: "#4338ca" },

  bubble: {
    padding: "10px 13px", borderRadius: 14,
    fontSize: 13.5, lineHeight: 1.55,
  },
  bubbleBot: {
    background: "#fff", color: "#111",
    border: "0.5px solid rgba(0,0,0,0.1)",
    borderBottomLeftRadius: 4,
  },
  bubbleUser: {
    background: "#2563eb", color: "#fff",
    borderBottomRightRadius: 4,
  },

  timestamp: { fontSize: 10, color: "#aaa" },

  typingWrap: { display: "flex", alignItems: "center", gap: 4, padding: "2px 0" },
  dot: {
    display: "inline-block", width: 7, height: 7, borderRadius: "50%",
    background: "#93c5fd",
    animation: "bounce 1.2s infinite",
  },

  suggestionsWrap: {
    display: "flex", flexDirection: "column", gap: 6,
    paddingLeft: 36,
  },
  chip: {
    background: "none",
    border: "1px solid #93c5fd",
    color: "#1d4ed8",
    fontSize: 12, padding: "7px 12px",
    borderRadius: 20, cursor: "pointer",
    textAlign: "left", fontFamily: "inherit",
    transition: "background 0.12s",
  },

  footer: {
    background: "#fff",
    borderTop: "1px solid rgba(0,0,0,0.08)",
    padding: "10px 12px 8px",
    flexShrink: 0,
  },
  inputRow: { display: "flex", gap: 8, alignItems: "flex-end" },
  textarea: {
    flex: 1, padding: "9px 13px",
    borderRadius: 22,
    border: "1px solid rgba(0,0,0,0.18)",
    fontSize: 13, resize: "none",
    minHeight: 40, maxHeight: 90,
    lineHeight: 1.45,
    fontFamily: "inherit",
    outline: "none",
    background: "#f3f4f6",
    color: "#111",
    overflowY: "auto",
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: "50%",
    background: "#2563eb", border: "none",
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0, transition: "opacity 0.15s",
  },
  hint: { fontSize: 10.5, color: "#bbb", textAlign: "center", marginTop: 6 },
};