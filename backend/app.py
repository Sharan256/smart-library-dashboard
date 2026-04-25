import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import httpx

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, '.env'))

app = Flask(__name__)

# CORS configuration – allow React dev server
CORS(app, resources={r"/api/*": {"origins": ["http://localhost:5173"]}}, supports_credentials=True)

HUGGINGFACE_URL = "https://api-inference.huggingface.co/models/meta-llama/Llama-2-7b-chat-hf"
HUGGINGFACE_API_KEY = os.getenv('HUGGINGFACE_API_KEY')
HEADERS = {
    "Authorization": f"Bearer {HUGGINGFACE_API_KEY}",
    "Content-Type": "application/json",
}

@app.route("/api/chat", methods=["POST"])
def proxy_chat():
    """Forward request payload to Hugging Face and return the response."""
    if not HUGGINGFACE_API_KEY:
        return jsonify({"error": "HUGGINGFACE_API_KEY is not configured."}), 500

    payload = request.get_json()
    
    # Transform messages to Hugging Face format (summarize for /models endpoint)
    messages = payload.get("messages", [])
    conversation_text = ""
    for msg in messages:
        role = msg.get("role", "")
        content = msg.get("content", "")
        if role == "system":
            conversation_text += f"System: {content}\n"
        elif role == "user":
            conversation_text += f"User: {content}\n"
        elif role == "assistant":
            conversation_text += f"Assistant: {content}\n"
    
    # Send to Hugging Face using the text generation format
    hf_payload = {"inputs": conversation_text}
    
    with httpx.Client() as client:
        try:
            resp = client.post(HUGGINGFACE_URL, json=hf_payload, headers=HEADERS, timeout=15.0)
            resp.raise_for_status()
            
            # Transform Hugging Face response back to OpenAI format
            hf_response = resp.json()
            if isinstance(hf_response, list) and len(hf_response) > 0:
                generated_text = hf_response[0].get("generated_text", "")
                # Extract just the new generated part
                new_text = generated_text.replace(conversation_text, "").strip()
                return jsonify({
                    "choices": [{
                        "message": {"role": "assistant", "content": new_text or generated_text}
                    }]
                })
            return jsonify({"choices": [{"message": {"role": "assistant", "content": "No response"}}]})
        except httpx.HTTPStatusError as exc:
            return jsonify({"error": exc.response.text}), exc.response.status_code
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500

if __name__ == "__main__":
    # Run on 0.0.0.0 to be reachable from the host machine
    app.run(host="0.0.0.0", port=8000, debug=True)
