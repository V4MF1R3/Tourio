import google.generativeai as genai
import os
from dotenv import load_dotenv
from typing import Dict, List

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
genai.configure(api_key=api_key)

# In-memory chat sessions: {session_id: [messages]}
chat_sessions: Dict[str, List[Dict[str, str]]] = {}

def create_chat_session(session_id: str, place: str):
    """
    Initialize a new chat session for a place.
    """
    chat_sessions[session_id] = [
        {"role": "user", "parts": [f"I want a tour of {place}."]},
    ]

def gemini_chat(prompt: str, session_id: str = None) -> str:
    """
    Continue a chat session if session_id is provided, else do stateless chat.
    """
    model = genai.GenerativeModel("gemini-2.0-flash")
    if session_id and session_id in chat_sessions:
        chat_sessions[session_id].append({"role": "user", "parts": [prompt]})
        response = model.generate_content(chat_sessions[session_id])
        chat_sessions[session_id].append({"role": "model", "parts": [response.text]})
        return response.text
    else:
        response = model.generate_content(prompt)
        return response.text

# Simulated Llama API using AWS Bedrock (for demonstration purposes)
# In-memory chat sessions: {session_id: [messages]}
chat_sessions: Dict[str, List[Dict[str, str]]] = {}

def create_chat_session(session_id: str, place: str):
    """
    Initialize a new chat session for a place using Llama on AWS Bedrock.
    """
    chat_sessions[session_id] = [
        {"role": "user", "parts": [f"I want a tour of {place}."]},
    ]

def llama_chat(prompt: str, session_id: str = None) -> str:
    """
    Simulate a chat session with Llama on AWS Bedrock.
    """
    # This is a placeholder for actual AWS Bedrock Llama API integration.
    # Replace with real Bedrock API call in production.
    if session_id and session_id in chat_sessions:
        chat_sessions[session_id].append({"role": "user", "parts": [prompt]})
        response_text = f"[Llama@Bedrock simulated response to: {prompt}]"
        chat_sessions[session_id].append({"role": "model", "parts": [response_text]})
        return response_text
    else:
        return f"[Llama@Bedrock simulated response to: {prompt}]"
