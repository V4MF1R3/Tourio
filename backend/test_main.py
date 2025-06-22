import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_root():
    resp = client.get("/")
    assert resp.status_code == 200
    assert resp.json() == {"message": "Tour Guide Backend is running"}

def test_attractions_missing_params():
    resp = client.get("/attractions")
    assert resp.status_code == 422

def test_attractions_valid():
    resp = client.get("/attractions?lat=48.8584&lon=2.2945")
    assert resp.status_code == 200
    assert "attractions" in resp.json()

def test_explain_resets_context():
    # Call explain
    resp = client.get("/explain?name=Eiffel Tower")
    assert resp.status_code == 200
    assert "explanation" in resp.json()
    # Call again to ensure context resets (should not error)
    resp2 = client.get("/explain?name=Louvre Museum")
    assert resp2.status_code == 200
    assert "explanation" in resp2.json()

def test_ask_uses_context():
    # Call explain to reset context
    client.get("/explain?name=Eiffel Tower")
    # Ask a question (should use context)
    resp = client.post("/ask", json={"query": "What is special about it?"})
    assert resp.status_code == 200
    assert "response" in resp.json()

def test_speak_nearby_and_spoken_reset():
    # Reset context
    client.get("/explain?name=Eiffel Tower")
    # Call speak (should find something to speak about)
    resp = client.get("/speak?lat=48.8584&lon=2.2945&radius=1000")
    assert resp.status_code == 200
    data = resp.json()
    assert "speak" in data
    assert "spoken" in data
    # Call speak again with spoken attractions (should skip already spoken)
    spoken = data.get("spoken", [])
    resp2 = client.get(
        "/speak?lat=48.8584&lon=2.2945&radius=1000&spoken=" + "&spoken=".join(spoken)
    )
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert "speak" in data2
    assert "spoken" in data2

def test_speak_no_attractions():
    # Use coordinates far from known attractions
    resp = client.get("/speak?lat=0&lon=0&radius=100")
    assert resp.status_code == 200
    data = resp.json()
    assert data["speak"] is False

def test_ask_without_explain():
    # Should still work and create a session
    resp = client.post("/ask", json={"query": "Tell me about Paris"})
    assert resp.status_code == 200
    assert "response" in resp.json()
