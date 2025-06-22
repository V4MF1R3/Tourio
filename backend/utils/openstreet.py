import requests

def get_nearby_attractions(lat: float, lon: float, radius: int = 1000):
    # Include only tourist attractions (exclude accommodations)
    valid_tourism_types = {
        "attraction",
        "museum",
        "artwork",
        "viewpoint",
        "gallery",
        "theme_park",
        "zoo",
        "aquarium"
    }

    query = f"""
    [out:json];
    (
      node["tourism"](around:{radius},{lat},{lon});
      way["tourism"](around:{radius},{lat},{lon});
    );
    out center;
    """
    response = requests.get("https://overpass-api.de/api/interpreter", params={"data": query})
    if response.status_code != 200:
        print(f"OpenStreetMap API error: {response.status_code} {response.text}")
        return []
    try:
        data = response.json()
    except Exception as e:
        print(f"Failed to parse JSON from OpenStreetMap API: {e} | Response: {response.text}")
        return []
    
    results = []
    for element in data.get("elements", []):
        tags = element.get("tags", {})
        tourism_type = tags.get("tourism")
        name = tags.get("name")

        if name and tourism_type in valid_tourism_types:
            results.append({
                "name": name,
                "lat": element.get("lat") or element.get("center", {}).get("lat"),
                "lon": element.get("lon") or element.get("center", {}).get("lon"),
                "type": tourism_type
            })
    
    return results