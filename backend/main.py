from fastapi import FastAPI, Query
from utils.llama import llama_chat
from utils.openstreet import get_nearby_attractions
from utils.distance import haversine
from pydantic import BaseModel
from fastapi import HTTPException
from typing import List, Optional
from uuid import uuid4
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Or specify your app's origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global context for chat and spoken attractions
current_session_id = None
spoken_attractions = []

@app.get("/")
def root():
    return {"message": "Tour Guide Backend is running"}

@app.get("/attractions")
def nearby(lat: float = Query(...), lon: float = Query(...)):
    try:
        attractions = get_nearby_attractions(lat, lon)
        return {"attractions": attractions}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/explain")
def explain(name: str):
    global current_session_id, spoken_attractions
    # Start a new chat session (no history)
    current_session_id = str(uuid4())
    spoken_attractions = []  # Reset spoken attractions
    prompt = (
        f"You are an engaging and knowledgeable local tour guide. "
        f"A visitor is standing right in front of {name} and wants to learn about it. "
        f"Share the most interesting and essential facts about this place in a conversational, "
        f"friendly tone. Include historical significance, unique features, or cultural importance. "
        f"Keep it concise (under 60 words) and make it sound like you're speaking directly to them. "
        f"Focus on what makes this place special and worth visiting."
    )
    response = llama_chat(prompt, session_id=current_session_id)
    return {"explanation": response}

class AskRequest(BaseModel):
    query: str

@app.post("/ask")
def ask_ai(request: AskRequest):
    global current_session_id
    if not current_session_id:
        current_session_id = str(uuid4())
    response = llama_chat(request.query, session_id=current_session_id)  # changed from gemini_chat
    return {"response": response}

@app.get("/speak")
def speak_nearby(
    lat: float = Query(...),
    lon: float = Query(...),
    radius: float = Query(100),
    spoken: Optional[List[str]] = Query(None, description="List of already spoken attraction names")
):
    global current_session_id, spoken_attractions
    if not current_session_id:
        current_session_id = str(uuid4())
    if spoken is not None:
        spoken_attractions = spoken
    try:
        attractions = get_nearby_attractions(lat, lon)
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
    spoken_set = set(n.strip().lower() for n in (spoken_attractions or []))
    for attraction in attractions:
        name = attraction.get("name")
        att_lat = attraction.get("lat")
        att_lon = attraction.get("lon")
        normalized_name = name.strip().lower() if name else None
        if normalized_name and normalized_name in spoken_set:
            continue
        if att_lat is not None and att_lon is not None:
            distance = haversine(lat, lon, att_lat, att_lon)
            if distance <= radius:
                prompt = (
                    f"You are a friendly local tour guide walking with a visitor. "
                    f"They're approaching {name or 'an interesting attraction'} and you want to "
                    f"catch their attention with something fascinating about this place. "
                    f"Start with something like 'Oh, you're near...' or 'Did you know that...' "
                    f"Share the most captivating fact or story about this location. "
                    f"Keep it under 60 words and make it engaging enough to make them want to explore it."
                )
                explanation = llama_chat(prompt, session_id=current_session_id)
                spoken_attractions.append(normalized_name)
                spoken_attractions = list(set(spoken_attractions))
                print("spoken_attractions received:", spoken_attractions)
                return {
                    "speak": True,
                    "attraction": attraction,
                    "explanation": explanation,
                    "spoken": spoken_attractions
                }
    return {
        "speak": False,
        "message": "No new nearby attractions within the specified radius.",
        "spoken": spoken_attractions
    }