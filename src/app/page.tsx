"use client";

import React, { useState, useRef, useEffect } from "react";
import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import type { 
  AudioData, 
  VADManager as VADManagerType, 
  AudioProcessingOptions 
} from "../lib/vad_version3";

interface TranscriptSegment {
  text: string;
  startTime: number;
  endTime: number;
  confidence: number;
}

interface APIResponse {
  transcript?: string;
  confidence?: number;
  segments?: TranscriptSegment[];
}

// Dynamically import the VADManager on client-side only
let VADManager: typeof VADManagerType;
if (typeof window !== 'undefined') {
  import('../lib/vad_version3').then((module) => {
    VADManager = module.VADManager;
  });
}

const SimpleSpeechRecognition: React.FC = () => {
  // Core state
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string>("");
  const [status, setStatus] = useState<string>("Initializing...");
  const [lastRecordingUrl, setLastRecordingUrl] = useState<string | null>(null);
  
  // State for word-by-word effect
  const [displayedText, setDisplayedText] = useState<string>("");
  const [wordQueue, setWordQueue] = useState<string[]>([]);
  const [isDisplayingWords, setIsDisplayingWords] = useState<boolean>(false);
  
  // Settings
  const [language, setLanguage] = useState<string>("en-IN");
  const [apiEndpoint, setApiEndpoint] = useState<string>("/api/sarvam");

  // Reference to VAD manager
  const vadManagerRef = useRef<VADManagerType | null>(null);

  // Initialize the VAD manager
  useEffect(() => {
    // Skip VAD initialization during SSR
    if (typeof window === 'undefined') return;

    // Function to initialize VAD manager
    const initializeVAD = async () => {
      try {
        // Check if Vonage noise suppression is available
        let vonageAvailable = true;
        try {
          if (typeof window !== 'undefined' && 
              typeof (window as any).createVonageNoiseSuppression !== 'function') {
            console.warn("Vonage noise suppression not available, disabling this feature");
            vonageAvailable = false;
          }
        } catch (e) {
          console.warn("Error checking Vonage availability:", e);
          vonageAvailable = false;
        }
        
        // Only create the VAD manager when on the client side
        if (typeof VADManager === 'undefined') {
          // Wait for the dynamic import to complete
          await new Promise<void>(resolve => {
            const checkVAD = () => {
              if (typeof VADManager !== 'undefined') {
                resolve();
              } else {
                setTimeout(checkVAD, 100);
              }
            };
            checkVAD();
          });
        }
        
        // Create a new VAD manager with configurations - set everything to maximum
        const options: AudioProcessingOptions = {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: false, // Browser's built-in noise suppression
          vadSensitivity: 1.0, // Maximum sensitivity
          silenceDetectionTimeout: 1500,
          useVonageNoiseSuppression: vonageAvailable,
          noiseSuppressIntensity: 1.0, // Maximum intensity
          adaptiveVAD: true,
        };
        
        const vadManager = new VADManager(
          options,
          {
            // Basic event handlers
            onStatusChange: (newStatus: string) => setStatus(newStatus),
            onError: (errorMessage: string) => {
              console.error(`VAD error:`, errorMessage);
              setError(errorMessage);
            },
            onRecordingChange: (recording: boolean) => {
              setIsRecording(recording);
            },
            
            // Handle captured audio
            onAudioCaptured: (audio: AudioData) => {
              processAndSendAudio(audio).catch(err => {
                console.error("Error processing audio:", err);
                setError(err instanceof Error ? err.message : "Unknown processing error");
              });
            }
          }
        );

        // Store reference
        vadManagerRef.current = vadManager;

        // Initialize the manager
        await vadManager.initialize();
        setIsInitialized(true);
        setStatus("Ready! Click the microphone button to start.");
      } catch (err) {
        console.error("Failed to initialize VAD manager:", err);
        setError(err instanceof Error ? err.message : "Failed to initialize voice detection");
      }
    };

    initializeVAD();

    // Cleanup on unmount
    return () => {
      if (vadManagerRef.current) {
        vadManagerRef.current.dispose().catch(err => {
          console.error("Error disposing VAD manager:", err);
        });
      }
      
      // Clear audio URL
      if (lastRecordingUrl) {
        URL.revokeObjectURL(lastRecordingUrl);
      }
    };
  }, []);

  // Word-by-word display effect
  useEffect(() => {
    if (wordQueue.length > 0 && !isDisplayingWords) {
      setIsDisplayingWords(true);
      const displayNextWord = () => {
        setWordQueue(prevQueue => {
          if (prevQueue.length === 0) {
            setIsDisplayingWords(false);
            return [];
          }
          
          const nextWord = prevQueue[0];
          const remainingWords = prevQueue.slice(1);
          
          setDisplayedText(prev => prev + (prev ? " " : "") + nextWord);
          
          // Schedule next word
          if (remainingWords.length > 0) {
            const delay = Math.floor(Math.random() * 50) + 50; // Random delay between 50-100ms
            setTimeout(displayNextWord, delay);
          } else {
            setIsDisplayingWords(false);
          }
          
          return remainingWords;
        });
      };
      
      displayNextWord();
    }
  }, [wordQueue, isDisplayingWords]);

  /**
   * Process and send audio to API
   */
  const processAndSendAudio = async (audioData: AudioData) => {
    try {
      setIsProcessing(true);
      setStatus("Processing speech...");
      
      if (!vadManagerRef.current) {
        throw new Error("VAD manager not initialized");
      }
      
      // Convert audio data to WAV Blob
      const wavBlob = await vadManagerRef.current.float32ArrayToWavBlob(audioData);
      
      // Create an audio URL for playback
      if (lastRecordingUrl) {
        URL.revokeObjectURL(lastRecordingUrl); // Clean up previous URL
      }
      const audioUrl = URL.createObjectURL(wavBlob);
      setLastRecordingUrl(audioUrl);
      
      setStatus("Transcribing...");
  
      const formData = new FormData();
      formData.append("file", wavBlob, "recording.wav");
      formData.append("language_code", language);
  
      // Send to API with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      try {
        const response = await fetch(apiEndpoint, {
          method: "POST",
          body: formData,
          signal: controller.signal
        });
    
        clearTimeout(timeoutId);
    
        if (!response.ok) {
          throw new Error(`API Error (${response.status})`);
        }
    
        const data = await response.json() as APIResponse;
    
        const newText = data.transcript || "";
        setTranscript(prev => prev ? `${prev} ${newText}` : newText);
        
        // Add words to the queue for word-by-word display
        const words = newText.split(/\s+/);
        setWordQueue(prev => [...prev, ...words]);
    
        setStatus("Listening...");
      } catch (fetchError) {
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          throw new Error('Request timed out after 30 seconds');
        }
        throw fetchError;
      }
    } catch (err) {
      console.error("Processing error:", err);
      setError(err instanceof Error ? err.message : "Processing error");
      setStatus("Error processing speech");
      throw err;
    } finally {
      setIsProcessing(false);
    }
  };

  // Start listening for speech
  const startListening = async () => {
    if (!vadManagerRef.current) return;
    
    try {
      setError(null);
      setTranscript("");
      setDisplayedText("");
      setWordQueue([]);
      
      await vadManagerRef.current.startListening();
      setIsListening(true);
      setStatus("Listening...");
    } catch (err) {
      console.error("Failed to start listening:", err);
      setError(err instanceof Error ? err.message : "Unknown error starting listening");
    }
  };

  // Stop listening for speech
  const stopListening = async () => {
    if (!vadManagerRef.current) return;
    
    try {
      await vadManagerRef.current.stopListening();
      setIsListening(false);
      setStatus("Stopped listening");
    } catch (err) {
      console.error("Failed to stop listening:", err);
      setError(err instanceof Error ? err.message : "Unknown error stopping listening");
    }
  };

  return (
    <div className="min-h-screen p-4 bg-gray-50">
      <Card className="max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle className="text-center">Speech Recognition</CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="mb-6">
            <p className="text-gray-600 text-center mb-4">{status}</p>

            {/* Language Selection */}
            <div className="mb-6">
              <Label htmlFor="language-select" className="mb-2 block">Language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger id="language-select">
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en-IN">English (India)</SelectItem>
                  <SelectItem value="hi-IN">Hindi</SelectItem>
                  <SelectItem value="bn-IN">Bengali</SelectItem>
                  <SelectItem value="gu-IN">Gujarati</SelectItem>
                  <SelectItem value="kn-IN">Kannada</SelectItem>
                  <SelectItem value="ml-IN">Malayalam</SelectItem>
                  <SelectItem value="mr-IN">Marathi</SelectItem>
                  <SelectItem value="od-IN">Odia</SelectItem>
                  <SelectItem value="pa-IN">Punjabi</SelectItem>
                  <SelectItem value="ta-IN">Tamil</SelectItem>
                  <SelectItem value="te-IN">Telugu</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Main Control Button */}
            <div className="flex justify-center mb-8">
              <Button
                onClick={isListening ? stopListening : startListening}
                disabled={!isInitialized || isProcessing}
                className={`rounded-full w-16 h-16 flex items-center justify-center ${isListening ? "bg-red-500 hover:bg-red-600" : ""}`}
                size="lg"
                variant={isListening ? "destructive" : "default"}
              >
                {isListening ? (
                  <MicOff className="w-8 h-8" />
                ) : (
                  <Mic className="w-8 h-8" />
                )}
              </Button>
            </div>

            {/* Recording Status */}
            {isRecording && (
              <div className="text-center mb-4">
                <p className="text-red-500 animate-pulse">
                  Recording...
                </p>
              </div>
            )}
          </div>

          {/* Transcript Display */}
          <Card>
            <CardContent className="pt-6">
              <div className="bg-white p-4 rounded border min-h-40">
                {displayedText ? (
                  <p className="text-lg">{displayedText}</p>
                ) : (
                  <p className="text-gray-400 italic text-center">Speak to see transcription here...</p>
                )}
                {isDisplayingWords && (
                  <span className="animate-pulse">|</span>
                )}
              </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
};

export default SimpleSpeechRecognition;