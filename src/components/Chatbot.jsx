import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hi! I am your Smart Library Analytics Assistant. I answer questions in natural language, explain trends, guide dashboard exploration, and help you turn the data into useful insights. How can I help you today?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const messagesEndRef = useRef(null);
  const location = useLocation();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = { role: 'user', content: input.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    const systemPrompt = `You are a domain-specific Analytics Assistant for a Smart Library Visual Analytics Dashboard.
Your chatbot features are:
- Answer user questions using natural language.
- Guide users to explore the dashboard and dataset.
- Explain trends, patterns, and anomalies clearly.
- Support decision-making by giving practical data insights.
- Handle irrelevant questions by responding appropriately.

Dataset Context:
- Columns: Timestamp, Zone_ID, Occupancy_Count, Noise_Level, Temperature, Humidity, Air_Quality, Light_Level, Device_Usage_Count, WiFi_Speed, Total_Power_Consumption.
- Key relationships: Noise increases with occupancy, power consumption increases with device usage and light level.

User's current context:
- Viewing: ${location.pathname}

Response rules:
- Keep responses short, helpful, and specific to the Smart Library domain.
- Use dataset context whenever possible.
- Avoid generic or off-topic answers.

If the user asks an unrelated or meaningless question (e.g., coding, general knowledge, math, non-library topics, jokes, weather outside), respond exactly with:
"This question is not related to the Smart Library analytics system. Please ask about the dataset, dashboard, or library insights."
Do not answer unrelated questions or say "I cannot answer that."`;

      try {
        const response = await fetch('http://localhost:8000/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'meta-llama/Llama-2-7b-chat-hf',
            messages: [
              { role: 'system', content: systemPrompt },
              ...messages.map(m => ({ role: m.role, content: m.content })),
              userMessage
            ],
            temperature: 0.2,
            max_tokens: 500
          })
        });

        if (!response.ok) {
          throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();
        const botResponse = data.choices[0]?.message?.content || 'Sorry, I could not process that request.';

        setMessages((prev) => [...prev, { role: 'assistant', content: botResponse }]);
      } catch (error) {
        console.error('Chatbot error:', error);
        setMessages((prev) => [...prev, {
          role: 'assistant',
          content: error.message.includes('API Key')
            ? error.message
            : 'Sorry, I encountered an error. Please try again later.'
        }]);
      } finally {
        setIsLoading(false);
      }
  };

  return (
    <div className={`chatbot-container ${isOpen ? 'open' : ''}`}>
      {!isOpen ? (
        <button className="chatbot-toggle" onClick={() => setIsOpen(true)}>
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        </button>
      ) : (
        <div className="chatbot-window">
          <div className="chatbot-header">
            <h3>Library Assistant</h3>
            <button onClick={() => setIsOpen(false)} className="chatbot-close">✕</button>
          </div>
          
          <div className="chatbot-messages">
            {messages.map((msg, idx) => (
              <div key={idx} className={`message-wrapper ${msg.role}`}>
                <div className={`message-bubble ${msg.role}`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="message-wrapper assistant">
                <div className="message-bubble assistant loading">
                  <div className="dot"></div>
                  <div className="dot"></div>
                  <div className="dot"></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSubmit} className="chatbot-input-area">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about library data..."
              disabled={isLoading}
            />
            <button type="submit" disabled={isLoading || !input.trim()}>
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
