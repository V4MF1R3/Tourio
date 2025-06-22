import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, Dimensions, Platform, Keyboard, KeyboardAvoidingView, PermissionsAndroid } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import {
    ExpoSpeechRecognitionModule,
    useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import Markdown from 'react-native-markdown-display';

const { height } = Dimensions.get('window');
const API_BASE_URL = 'https://tourguide-grel.onrender.com'; // <-- Replace with your backend

export default function TourScreen() {
    const [location, setLocation] = useState(null);
    const [attractions, setAttractions] = useState([]);
    const [responses, setResponses] = useState([]);
    const [initialPlace, setInitialPlace] = useState('');
    const [showInitialInput, setShowInitialInput] = useState(true);
    const [userInput, setUserInput] = useState('');
    const [isListening, setIsListening] = useState(false);
    const [spokenAttractions, setSpokenAttractions] = useState([]);
    const mapRef = useRef(null);

    // Voice setup
    useEffect(() => {
        return () => {
            if (ExpoSpeechRecognitionModule && ExpoSpeechRecognitionModule.stop) {
                ExpoSpeechRecognitionModule.stop();
            }
        };
    }, []);

    // Location setup
    useEffect(() => {
        let subscription;
        (async () => {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission denied', 'Location permission is required');
                return;
            }
            subscription = await Location.watchPositionAsync(
                { accuracy: Location.Accuracy.High, distanceInterval: 5 },
                (loc) => {
                    // Only use mock location if available, otherwise ignore real location during testing
                    if (loc.mocked === true) {
                        setLocation({
                            latitude: loc.coords.latitude,
                            longitude: loc.coords.longitude,
                        });
                    }
                    // Optionally, ignore real locations if you are testing with mock locations
                    // else if (loc.mocked === false) {
                    //     // Ignore real location updates during mock testing
                    // }
                }
            );
        })();
        return () => {
            if (subscription) subscription.remove();
        };
    }, []);

    // Fetch attractions and check /speak when location changes
    useEffect(() => {
        if (location) {
            fetchAttractions();
            checkSpeak();
        }
    }, [location]);

    // TTS for latest response
    useEffect(() => {
        if (responses.length > 0) {
            Speech.speak(stripMarkdown(responses[0].content), { language: 'en-US', pitch: 1.0, rate: 0.9 });
        }
    }, [responses]);

    // Update map when location or attractions change
    useEffect(() => {
        if (location && mapRef.current) {
            mapRef.current.postMessage(JSON.stringify({
                type: 'update',
                userLat: location.latitude,
                userLon: location.longitude,
                attractions: attractions.map(a => ({
                    name: a.name,
                    lat: a.latitude,
                    lon: a.longitude,
                })),
            }));
        }
    }, [location, attractions]);

    // Helper to safely parse JSON
    async function safeJson(res) {
        const text = await res.text();
        try {
            return JSON.parse(text);
        } catch (e) {
            console.error('Non-JSON response:', text);
            return null;
        }
    }

    // Fetch nearby attractions
    const fetchAttractions = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/attractions?lat=${location.latitude}&lon=${location.longitude}`);
            const data = await safeJson(res);
            if (data && data.attractions) setAttractions(data.attractions);
        } catch (e) {
            console.error(e);
        }
    };

    // Check /speak endpoint for nearby attractions
    const checkSpeak = async () => {
        try {
            // Normalize and deduplicate spokenAttractions
            const uniqueSpoken = [...new Set(spokenAttractions.map(name => name.trim().toLowerCase()))];
            const spokenParam = uniqueSpoken.length > 0 ? `&spoken=${uniqueSpoken.join(',')}` : '';
            const params = new URLSearchParams({
                lat: location.latitude,
                lon: location.longitude,
                radius: 100,
            });
            uniqueSpoken.forEach(name => params.append('spoken', name));
            const res = await fetch(`${API_BASE_URL}/speak?${params.toString()}`);
            const data = await safeJson(res);
            if (data && data.speak && data.explanation) {
                setResponses(prev => [
                    {
                        id: Date.now(),
                        type: 'speak',
                        content: data.explanation,
                        attraction: data.attraction?.name,
                        timestamp: new Date().toLocaleTimeString()
                    },
                    ...prev
                ]);
                // Also normalize and deduplicate the received spoken list
                setSpokenAttractions(
                    (data.spoken || []).map(name => name.trim().toLowerCase()).filter((v, i, a) => a.indexOf(v) === i)
                );
            }
        } catch (e) {
            console.error(e);
        }
    };

    // Handle initial place input
    const handleInitialPlaceSubmit = async () => {
        if (!initialPlace.trim()) return;
        try {
            const res = await fetch(`${API_BASE_URL}/explain?name=${encodeURIComponent(initialPlace)}`);
            const data = await safeJson(res);
            if (data && data.explanation) {
                setResponses([{ id: Date.now(), type: 'explain', content: data.explanation, place: initialPlace, timestamp: new Date().toLocaleTimeString() }]);
                setShowInitialInput(false);
                Keyboard.dismiss();
            } else {
                Alert.alert('Error', 'Failed to get explanation');
            }
        } catch (e) {
            Alert.alert('Error', 'Failed to get explanation');
        }
    };

    // Handle /ask
    const handleAsk = async () => {
        if (!userInput.trim()) return;
        try {
            const res = await fetch(`${API_BASE_URL}/ask`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: userInput }),
            });
            const data = await safeJson(res);
            if (data && data.response) {
                setResponses(prev => [{ id: Date.now(), type: 'ask', content: data.response, question: userInput, timestamp: new Date().toLocaleTimeString() }, ...prev]);
                setUserInput('');
                Keyboard.dismiss();
            } else {
                Alert.alert('Error', 'Failed to get response');
            }
        } catch (e) {
            Alert.alert('Error', 'Failed to get response');
        }
    };

    // Handle marker press
    const handleMarkerPress = async (attraction) => {
        try {
            const res = await fetch(`${API_BASE_URL}/explain?name=${encodeURIComponent(attraction.name)}`);
            const data = await safeJson(res);
            if (data && data.explanation) {
                setResponses(prev => [{ id: Date.now(), type: 'explain', content: data.explanation, place: attraction.name, timestamp: new Date().toLocaleTimeString() }, ...prev]);
            } else {
                Alert.alert('Error', 'Failed to get explanation');
            }
        } catch (e) {
            Alert.alert('Error', 'Failed to get explanation');
        }
    };

    // Voice-to-text handlers
    const onSpeechResults = (e) => {
        if (e.value && e.value.length > 0) {
            setUserInput(e.value[0]);
        }
    };

    const startVoice = async () => {
        const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!result.granted) {
            Alert.alert('Permission denied', 'Microphone permission is required for speech recognition.');
            return;
        }
        ExpoSpeechRecognitionModule.start({
            lang: "en-US",
            interimResults: true,
            continuous: false,
        });
    };

    const stopVoice = () => {
        ExpoSpeechRecognitionModule.stop();
    };

    // Request microphone permission
    const requestMicrophonePermission = async () => {
        if (Platform.OS === 'android') {
            const granted = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
                {
                    title: 'Microphone Permission',
                    message: 'This app needs access to your microphone for speech recognition.',
                    buttonNeutral: 'Ask Me Later',
                    buttonNegative: 'Cancel',
                    buttonPositive: 'OK',
                }
            );
            return granted === PermissionsAndroid.RESULTS.GRANTED;
        }
        return true;
    };

    // Speech recognition events
    useSpeechRecognitionEvent("start", () => setIsListening(true));
    useSpeechRecognitionEvent("end", () => setIsListening(false));
    useSpeechRecognitionEvent("result", (event) => {
        setUserInput(event.results[0]?.transcript || "");
    });
    useSpeechRecognitionEvent("error", (event) => {
        Alert.alert("Voice Error", event.message || "Could not start voice recognition");
        setIsListening(false);
    });

    function stripMarkdown(text) {
        return text
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/__(.*?)__/g, '$1')
            .replace(/\*(.*?)\*/g, '$1')
            .replace(/_(.*?)_/g, '$1')
            .replace(/`(.*?)`/g, '$1')
            .replace(/\[(.*?)\]\((.*?)\)/g, '$1');
    }

    if (showInitialInput) {
        return (
            <View style={styles.initialContainer}>
                <StatusBar style="auto" />
                <Text style={styles.initialTitle}>Welcome to Tour Guide</Text>
                <Text style={styles.initialSubtitle}>What place would you like to explore?</Text>
                <TextInput
                    style={styles.initialInput}
                    value={initialPlace}
                    onChangeText={setInitialPlace}
                    placeholder="Enter place name..."
                    placeholderTextColor="#999"
                />
                <TouchableOpacity style={styles.initialButton} onPress={handleInitialPlaceSubmit}>
                    <Text style={styles.initialButtonText}>Start Tour</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
            <View style={styles.container}>
                <StatusBar style="auto" />
                {/* Map Section */}
                <View style={styles.mapContainer}>
                    <WebView
                        ref={mapRef}
                        style={{ flex: 1 }}
                        originWhitelist={['*']}
                        javaScriptEnabled={true}
                        injectedJavaScript={`
      document.addEventListener("message", function(event) {
        var data = JSON.parse(event.data);
        if (data.type === 'update') {
          if (window.userMarker) {
            window.userMarker.setLatLng([data.userLat, data.userLon]);
            // window.map.panTo([data.userLat, data.userLon]); // Don't auto-pan every update
          }
          // Remove old attraction markers
          if (window.attractionMarkers) {
            window.attractionMarkers.forEach(m => window.map.removeLayer(m));
          }
          window.attractionMarkers = [];
          data.attractions.forEach(function(attraction) {
            var marker = L.marker([attraction.lat, attraction.lon], {
              icon: L.icon({
                iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png',
                iconSize: [32, 32],
                iconAnchor: [16, 32],
              })
            }).addTo(window.map).bindPopup(attraction.name);
            window.attractionMarkers.push(marker);
          });
        }
      });
      true;
    `}
                        source={{
                            html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css" />
          <style>
            #map { height: 100vh; width: 100vw; margin:0; padding:0; }
            html, body { margin:0; padding:0; }
          </style>
        </head>
        <body>
          <div id="map"></div>
          <script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>
          <script>
            var map = L.map('map').setView([${location ? location.latitude : 28.6139}, ${location ? location.longitude : 77.2090}], 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
              maxZoom: 19,
            }).addTo(map);

            window.userMarker = L.marker([${location ? location.latitude : 28.6139}, ${location ? location.longitude : 77.2090}], {
              icon: L.icon({
                iconUrl: 'https://cdn-icons-png.flaticon.com/512/64/64113.png',
                iconSize: [32, 32],
                iconAnchor: [16, 32],
              })
            }).addTo(map).bindPopup('You are here');

            window.attractionMarkers = [];
            var attractions = ${JSON.stringify(
                                attractions.map(a => ({
                                    name: a.name,
                                    lat: a.latitude,
                                    lon: a.longitude,
                                }))
                            )};
            attractions.forEach(function(attraction) {
              var marker = L.marker([attraction.lat, attraction.lon], {
                icon: L.icon({
                  iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png',
                  iconSize: [32, 32],
                  iconAnchor: [16, 32],
                })
              }).addTo(map).bindPopup(attraction.name);
              window.attractionMarkers.push(marker);
            });

            window.map = map;
          </script>
        </body>
        </html>
      `,
                        }}
                    />
                </View>
                {/* Response Section */}
                <View style={styles.responseContainer}>
                    <ScrollView style={styles.responseScroll} keyboardShouldPersistTaps="handled">
                        {responses.map((response) => (
                            <View key={response.id} style={styles.responseItem}>
                                <View style={styles.responseHeader}>
                                    <Text style={styles.responseType}>{response.type.toUpperCase()}</Text>
                                    <Text style={styles.responseTime}>{response.timestamp}</Text>
                                </View>
                                {response.question && <Text style={styles.responseQuestion}>Q: {response.question}</Text>}
                                {response.place && <Text style={styles.responsePlace}>📍 {response.place}</Text>}
                                <Markdown style={{ body: styles.responseContent }}>
                                    {response.content}
                                </Markdown>
                            </View>
                        ))}
                    </ScrollView>
                    {/* Input Section */}
                    <View style={styles.inputContainer}>
                        <TextInput
                            style={styles.textInput}
                            value={userInput}
                            onChangeText={setUserInput}
                            placeholder="Ask me anything..."
                            placeholderTextColor="#999"
                            multiline={false}
                        />
                        <TouchableOpacity
                            style={[styles.micButton, isListening && styles.micButtonActive]}
                            onPress={isListening ? stopVoice : startVoice}
                        >
                            <Ionicons name={isListening ? 'mic' : 'mic-outline'} size={24} color={isListening ? '#fff' : '#007AFF'} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.sendButton} onPress={handleAsk}>
                            <Ionicons name="send" size={24} color="#fff" />
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    initialContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#f5f5f5' },
    initialTitle: { fontSize: 28, fontWeight: 'bold', color: '#333', marginBottom: 10 },
    initialSubtitle: { fontSize: 16, color: '#666', marginBottom: 30, textAlign: 'center' },
    initialInput: { width: '100%', height: 50, borderWidth: 1, borderColor: '#ddd', borderRadius: 25, paddingHorizontal: 20, fontSize: 16, backgroundColor: '#fff', marginBottom: 20 },
    initialButton: { backgroundColor: '#007AFF', paddingHorizontal: 40, paddingVertical: 15, borderRadius: 25 },
    initialButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    mapContainer: { flex: 1 },
    responseContainer: { flex: 1, backgroundColor: '#f8f9fa', borderTopWidth: 1, borderTopColor: '#e0e0e0' },
    responseScroll: { flex: 1, padding: 10 },
    responseItem: { backgroundColor: '#fff', padding: 12, marginBottom: 8, borderRadius: 8, borderLeftWidth: 3, borderLeftColor: '#007AFF' },
    responseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
    responseType: { fontSize: 10, fontWeight: 'bold', color: '#007AFF', backgroundColor: '#e3f2fd', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    responseTime: { fontSize: 10, color: '#999' },
    responseQuestion: { fontSize: 12, color: '#666', fontStyle: 'italic', marginBottom: 3 },
    responsePlace: { fontSize: 12, color: '#007AFF', fontWeight: '500', marginBottom: 3 },
    responseContent: { fontSize: 14, color: '#333', lineHeight: 18 },
    inputContainer: { flexDirection: 'row', padding: 10, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e0e0e0', alignItems: 'center' },
    textInput: { flex: 1, height: 40, borderWidth: 1, borderColor: '#ddd', borderRadius: 20, paddingHorizontal: 15, marginRight: 8, backgroundColor: '#f8f9fa' },
    micButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center', marginRight: 8 },
    micButtonActive: { backgroundColor: '#007AFF' },
    sendButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#007AFF', justifyContent: 'center', alignItems: 'center' },
});