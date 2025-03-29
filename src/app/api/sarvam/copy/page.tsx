// "use client";

// import React, { useState, useRef, useEffect } from "react";
// import { Mic, MicOff, Volume2, Settings, BarChart } from "lucide-react";
// import { Button } from "@/components/ui/button";
// import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
// import { Slider } from "@/components/ui/slider";
// import { Switch } from "@/components/ui/switch";
// import { Label } from "@/components/ui/label";
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// import { Input } from "@/components/ui/input";
// import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
// import { Progress } from "@/components/ui/progress";
// import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
// import { Badge } from "@/components/ui/badge";
// import { ScrollArea } from "@/components/ui/scroll-area";

// import type { 
//   AudioData, 
//   VADManager as VADManagerType, 
//   NoiseProfile, 
//   AudioProcessingOptions 
// } from "../lib/vad_version3"; // Ensure this import path is correct


// interface TranscriptSegment {
//   text: string;
//   startTime: number;
//   endTime: number;
//   confidence: number;
// }

// interface APIResponse {
//   transcript?: string;
//   confidence?: number;
//   segments?: TranscriptSegment[];
// }

// // Dynamically import the VADManager on client-side only
// let VADManager: typeof VADManagerType;
// if (typeof window !== 'undefined') {
//   import('../lib/vad_version3').then((module) => {
//     VADManager = module.VADManager;
//   });
// }

// const EnhancedSpeechRecognition: React.FC = () => {
//   // Core state
//   const [isInitialized, setIsInitialized] = useState<boolean>(false);
//   const [isListening, setIsListening] = useState<boolean>(false);
//   const [isRecording, setIsRecording] = useState<boolean>(false);
//   const [isProcessing, setIsProcessing] = useState<boolean>(false);
//   const [error, setError] = useState<string | null>(null);
//   const [transcript, setTranscript] = useState<string>("");
//   const [status, setStatus] = useState<string>("Initializing...");
//   const [lastRecordingUrl, setLastRecordingUrl] = useState<string | null>(null);
//   const [isPlaying, setIsPlaying] = useState<boolean>(false);
//   const audioRef = useRef<HTMLAudioElement | null>(null);
  
//   // Enhanced state for new features
//   const [audioLevel, setAudioLevel] = useState<number>(0);
//   const [noiseProfile, setNoiseProfile] = useState<NoiseProfile | null>(null);
//   const [recordingDuration, setRecordingDuration] = useState<number | null>(null);
//   const [transcriptConfidence, setTranscriptConfidence] = useState<number | null>(null);
//   const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  
//   // VAD settings
//   const [vadSensitivity, setVadSensitivity] = useState<number>(0.75);
//   const [showSettings, setShowSettings] = useState<boolean>(false);
//   const [silenceTimeout, setSilenceTimeout] = useState<number>(1500);
  
//   // Audio processing options
//   const [autoGainControl, setAutoGainControl] = useState<boolean>(true);
//   const [useNoiseSuppression, setUseNoiseSuppression] = useState<boolean>(true);
//   const [echoCancellation, setEchoCancellation] = useState<boolean>(true);
//   const [noiseSuppressIntensity, setNoiseSuppressIntensity] = useState<number>(0.7);
//   const [adaptiveVAD, setAdaptiveVAD] = useState<boolean>(true);
//   const [audioQualityValue, setAudioQualityValue] = useState<string>("medium");
  
//   // Sarvam API-specific settings
//   const [language, setLanguage] = useState<string>("en-IN");
//   const [apiEndpoint, setApiEndpoint] = useState<string>("/api/sarvam");

//   // Reference to VAD manager
//   const vadManagerRef = useRef<VADManagerType | null>(null);

//   // State polling interval for UI updates
//   const pollingIntervalRef = useRef<number | null>(null);

//   // Initialize the VAD manager
//   useEffect(() => {
//     // Skip VAD initialization during SSR
//     if (typeof window === 'undefined') return;

//     // Function to initialize VAD manager
//     const initializeVAD = async () => {
//       try {
//         // Check if Vonage noise suppression is available
//         let vonageAvailable = true;
//         try {
//           if (typeof window !== 'undefined' && 
//               // eslint-disable-next-line @typescript-eslint/no-explicit-any
//               typeof (window as any).createVonageNoiseSuppression !== 'function') {
//             console.warn("Vonage noise suppression not available, disabling this feature");
//             vonageAvailable = false;
//           }
//         } catch (e) {
//           console.warn("Error checking Vonage availability:", e);
//           vonageAvailable = false;
//         }
        
//         // Only create the VAD manager when on the client side
//         if (typeof VADManager === 'undefined') {
//           // Wait for the dynamic import to complete
//           await new Promise<void>(resolve => {
//             const checkVAD = () => {
//               if (typeof VADManager !== 'undefined') {
//                 resolve();
//               } else {
//                 setTimeout(checkVAD, 100);
//               }
//             };
//             checkVAD();
//           });
//         }
        
//         // Convert string audio quality to enum
        
        
//         // Create a new VAD manager with configurations
//         const options: AudioProcessingOptions = {
//           autoGainControl,
//           echoCancellation,
//           noiseSuppression: false, // Browser's built-in noise suppression
//           vadSensitivity,
//           silenceDetectionTimeout: silenceTimeout,
//           useVonageNoiseSuppression: vonageAvailable && useNoiseSuppression,
//           noiseSuppressIntensity,
//           adaptiveVAD,
        
//         };
        
//         const vadManager = new VADManager(
//           options,
//           {
//             // Basic event handlers
//             onStatusChange: (newStatus: string) => setStatus(newStatus),
//             onError: (errorMessage: string, type?: 'initialization' | 'runtime' | 'vad' | 'noiseSuppression') => {
//               console.error(`VAD error (${type}):`, errorMessage);
//               setError(errorMessage);
              
//               // If error is related to Vonage, update UI accordingly
//               if (errorMessage.includes("Vonage")) {
//                 setUseNoiseSuppression(false);
//               }
//             },
//             onRecordingChange: (recording: boolean) => {
//               setIsRecording(recording);
//               if (recording) {
//                 // Reset recording duration when starting new recording
//                 setRecordingDuration(0);
//               }
//             },
            
//             // Advanced event handlers
//             onAudioLevelUpdate: (level: number) => setAudioLevel(level),
//             onNoiseProfileUpdate: (profile: NoiseProfile) => setNoiseProfile(profile),
            
//             // Handle captured audio
//             onAudioCaptured: (audio: AudioData) => {
//               processAndSendAudio(audio).catch(err => {
//                 console.error("Error processing audio:", err);
//                 setError(err instanceof Error ? err.message : "Unknown processing error");
//               });
//             }
//           }
//         );

//         // Store reference
//         vadManagerRef.current = vadManager;

//         // Initialize the manager
//         await vadManager.initialize();
//         setIsInitialized(true);
//         setNoiseProfile(vadManager.getNoiseProfile());
//         setStatus("VAD ready! Click the microphone button to start listening.");
        
//         // Start polling for state updates
//         startStatePolling();
//       } catch (err) {
//         console.error("Failed to initialize VAD manager:", err);
//         setError(err instanceof Error ? err.message : "Failed to initialize voice detection");
//       }
//     };

//     initializeVAD();

//     // Cleanup on unmount
//     return () => {
//       if (vadManagerRef.current) {
//         vadManagerRef.current.dispose().catch(err => {
//           console.error("Error disposing VAD manager:", err);
//         });
//       }
      
//       // Clear polling interval
//       if (pollingIntervalRef.current !== null) {
//         window.clearInterval(pollingIntervalRef.current);
//       }
      
//       // Clear audio URL
//       if (lastRecordingUrl) {
//         URL.revokeObjectURL(lastRecordingUrl);
//       }
//     };
 
//   }, [
//     autoGainControl, 
//     useNoiseSuppression, 
//     echoCancellation, 
//     vadSensitivity, 
//     silenceTimeout,
//     noiseSuppressIntensity,
//     adaptiveVAD,
//     audioQualityValue
//   ]);

//   /**
//    * Helper function to convert string audio quality to enum
  

//   /**
//    * Process and send audio to API
//    */
//   const processAndSendAudio = async (audioData: AudioData) => {
//     try {
//       setIsProcessing(true);
//       setStatus("Processing audio...");
      
//       if (!vadManagerRef.current) {
//         throw new Error("VAD manager not initialized");
//       }
      
//       // Convert audio data to WAV Blob
//       const wavBlob = await vadManagerRef.current.float32ArrayToWavBlob(audioData);
//       const wavSize = Math.round(wavBlob.size / 1024);
//       console.log(`WAV blob size: ${wavSize}KB, type: ${wavBlob.type}`);
      
//       // Create an audio URL for playback
//       if (lastRecordingUrl) {
//         URL.revokeObjectURL(lastRecordingUrl); // Clean up previous URL
//       }
//       const audioUrl = URL.createObjectURL(wavBlob);
//       setLastRecordingUrl(audioUrl);
      
//       setStatus("Sending to Sarvam Speech API...");
  
//       const formData = new FormData();
//       formData.append("file", wavBlob, "recording.wav");
//       formData.append("language_code", language);
  
//       // Send to Sarvam API with timeout
//       const controller = new AbortController();
//       const timeoutId = setTimeout(() => controller.abort(), 30000);
      
//       try {
//         const response = await fetch(apiEndpoint, {
//           method: "POST",
//           body: formData,
//           signal: controller.signal
//         });
    
//         clearTimeout(timeoutId);
    
//         if (!response.ok) {
//           const errorText = await response.text().catch(() => "Could not read error response");
//           throw new Error(`API Error (${response.status}): ${errorText}`);
//         }
    
//         const data = await response.json() as APIResponse;
    
//         const newText = data.transcript || "";
//         setTranscript(prev => prev ? `${prev} ${newText}` : newText);
        
//         // Store confidence score if available
//         if (data.confidence !== undefined) {
//           setTranscriptConfidence(data.confidence);
//         }
        
//         // Store detailed segment information if available
//         if (data.segments && data.segments.length > 0) {
//           setSegments(prevSegments => [...prevSegments, ...data.segments]);
//         }
    
//         setStatus("Received transcription");
//       } catch (fetchError) {
//         if (fetchError instanceof Error && fetchError.name === 'AbortError') {
//           throw new Error('API request timed out after 30 seconds');
//         }
//         throw fetchError;
//       }
//     } catch (err) {
//       console.error("Processing error:", err);
//       setError(err instanceof Error ? err.message : "Processing error");
//       setStatus("Error processing speech");
//       throw err;
//     } finally {
//       setIsProcessing(false);
//     }
//   };
  
//   // Play the last recorded audio
//   const playRecordedAudio = () => {
//     if (!lastRecordingUrl || !audioRef.current) return;
    
//     if (isPlaying) {
//       audioRef.current.pause();
//       audioRef.current.currentTime = 0;
//       setIsPlaying(false);
//     } else {
//       audioRef.current.play()
//         .then(() => {
//           setIsPlaying(true);
//         })
//         .catch(error => {
//           console.error("Error playing audio:", error);
//           setError("Failed to play audio recording");
//         });
//     }
//   };
  
//   // Handle audio playback ended
//   useEffect(() => {
//     const audioElement = audioRef.current;
//     if (!audioElement) return;
    
//     const handleEnded = () => {
//       setIsPlaying(false);
//     };
    
//     audioElement.addEventListener('ended', handleEnded);
    
//     return () => {
//       audioElement.removeEventListener('ended', handleEnded);
//     };
//   }, []);

//   // Start listening for speech
//   const startListening = async () => {
//     if (!vadManagerRef.current) return;
    
//     try {
//       setError(null);
//       setTranscript("");
//       setSegments([]);
//       setTranscriptConfidence(null);
      
//       await vadManagerRef.current.startListening();
//       setIsListening(true);
//     } catch (err) {
//       console.error("Failed to start listening:", err);
//       setError(err instanceof Error ? err.message : "Unknown error starting listening");
//     }
//   };

//   // Stop listening for speech
//   const stopListening = async () => {
//     if (!vadManagerRef.current) return;
    
//     try {
//       await vadManagerRef.current.stopListening();
//       setIsListening(false);
      
//       // Stop audio playback if it's playing
//       if (isPlaying && audioRef.current) {
//         audioRef.current.pause();
//         audioRef.current.currentTime = 0;
//         setIsPlaying(false);
//       }
//     } catch (err) {
//       console.error("Failed to stop listening:", err);
//       setError(err instanceof Error ? err.message : "Unknown error stopping listening");
//     }
//   };

//   // Handle VAD sensitivity change
//   const handleSensitivityChange = (value: number[]) => {
//     const newValue = value[0];
//     setVadSensitivity(newValue);
    
//     if (vadManagerRef.current) {
//       vadManagerRef.current.setBaseSensitivity(newValue);
//     }
//   };

//   // Handle noise suppression intensity change
//   const handleNoiseSuppressIntensityChange = (value: number[]) => {
//     const newValue = value[0];
//     setNoiseSuppressIntensity(newValue);
    
//     if (vadManagerRef.current) {
//       vadManagerRef.current.setNoiseSuppressIntensity(newValue);
//     }
//   };

//   // Poll VAD manager state for UI updates
//   const startStatePolling = () => {
//     if (pollingIntervalRef.current !== null) {
//       window.clearInterval(pollingIntervalRef.current);
//     }
    
//     pollingIntervalRef.current = window.setInterval(() => {
//       if (!vadManagerRef.current) return;
      
//       // Update audio level
//       const level = vadManagerRef.current.getAudioLevel();
//       setAudioLevel(level);
      
//       // Update recording duration if recording
//       if (isRecording) {
//         setRecordingDuration(vadManagerRef.current.getRecordingDuration() * 1000);
//       }
      
//       // Update noise profile
//       const profile = vadManagerRef.current.getNoiseProfile();
//       if (profile) {
//         setNoiseProfile(profile);
//       }
//     }, 100);
//   };

//   // Format time in MM:SS.ms format
//   const formatTime = (ms: number | null): string => {
//     if (ms === null) return "00:00.00";
    
//     const totalSeconds = Math.floor(ms / 1000);
//     const minutes = Math.floor(totalSeconds / 60);
//     const seconds = totalSeconds % 60;
//     const milliseconds = Math.floor((ms % 1000) / 10);
    
//     return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
//   };

//   // Get color based on audio level
//   const getAudioLevelColor = (level: number): string => {
//     if (level < 0.2) return 'bg-green-500';
//     if (level < 0.5) return 'bg-yellow-500';
//     return 'bg-red-500';
//   };

//   // Get signal quality description
//   const getSignalQuality = (profile: NoiseProfile | null): string => {
//     if (!profile) return 'Unknown';
    
//     const snr = profile.peakLevel / (profile.averageLevel || 0.01);
    
//     if (snr > 5) return 'Excellent';
//     if (snr > 2) return 'Good';
//     if (snr > 1) return 'Fair';
//     return 'Poor';
//   };

//   // Calculate transcript color based on confidence
//   const getConfidenceColor = (confidence: number | null): string => {
//     if (confidence === null) return 'text-gray-700';
//     if (confidence >= 0.8) return 'text-green-700';
//     if (confidence >= 0.5) return 'text-yellow-700';
//     return 'text-red-700';
//   };

//   // Toggle Vonage noise suppression
//   const handleToggleNoiseSuppression = async (enabled: boolean) => {
//     setUseNoiseSuppression(enabled);
    
//     if (vadManagerRef.current && isInitialized) {
//       try {
//         await vadManagerRef.current.toggleVonageNoiseSuppression(enabled);
//       } catch (err) {
//         console.error("Failed to toggle noise suppression:", err);
//         setError(err instanceof Error ? err.message : "Failed to toggle noise suppression");
//       }
//     }
//   };

//   return (
//     <div className="min-h-screen p-4 bg-gray-50">
//       <Card className="max-w-4xl mx-auto">
//         <CardHeader>
//           <CardTitle className="text-center">Enhanced Speech Recognition</CardTitle>
//           <p className="text-center text-gray-600">
//             With advanced Voice Activity Detection and Vonage Noise Suppression
//           </p>
//         </CardHeader>
//         <CardContent>
//           {error && (
//             <Alert variant="destructive" className="mb-4">
//               <AlertTitle>Error</AlertTitle>
//               <AlertDescription>{error}</AlertDescription>
//             </Alert>
//           )}

//           <div className="mb-6">
//             <div className="flex items-center justify-between">
//               <p className="text-gray-600">{status}</p>
//               <Button 
//                 variant="ghost"
//                 size="sm"
//                 onClick={() => setShowSettings(!showSettings)}
//                 className="flex items-center text-blue-600"
//               >
//                 <Settings className="w-4 h-4 mr-1" />
//                 <span>{showSettings ? 'Hide Settings' : 'Show Settings'}</span>
//               </Button>
//             </div>

//             {/* Audio Level Indicator */}
//             <div className="mb-4 mt-2">
//               <div className="flex items-center mb-1">
//                 <Volume2 className="w-4 h-4 mr-2 text-gray-600" />
//                 <span className="text-sm text-gray-600">Audio Level</span>
//               </div>
//               <Progress value={audioLevel * 100} className={getAudioLevelColor(audioLevel)} />
//             </div>

//             {/* Settings Panel */}
//             {showSettings && (
//               <Card className="mb-4">
//                 <CardContent className="pt-6">
//                   <Tabs defaultValue="vad">
//                     <TabsList className="grid w-full grid-cols-2">
//                       <TabsTrigger value="vad">Voice Detection</TabsTrigger>
//                       <TabsTrigger value="api">API Settings</TabsTrigger>
//                     </TabsList>
                    
//                     <TabsContent value="vad" className="space-y-4">
//                       {/* VAD Sensitivity */}
//                       <div className="space-y-2">
//                         <div className="flex items-center justify-between">
//                           <Label>VAD Sensitivity</Label>
//                           <span className="text-sm text-gray-500">{vadSensitivity.toFixed(2)}</span>
//                         </div>
//                         <Slider 
//                           min={0} 
//                           max={1} 
//                           step={0.05}
//                           value={[vadSensitivity]}
//                           onValueChange={handleSensitivityChange}
//                         />
//                         <p className="text-xs text-gray-500">
//                           Higher values detect speech more easily but may cause false triggers
//                         </p>
//                       </div>
                      
//                       {/* Noise Suppression Intensity */}
//                       <div className="space-y-2">
//                         <div className="flex items-center justify-between">
//                           <Label>Noise Suppression Intensity</Label>
//                           <span className="text-sm text-gray-500">{noiseSuppressIntensity.toFixed(2)}</span>
//                         </div>
//                         <Slider 
//                           min={0} 
//                           max={1} 
//                           step={0.05}
//                           disabled={!useNoiseSuppression}
//                           value={[noiseSuppressIntensity]}
//                           onValueChange={handleNoiseSuppressIntensityChange}
//                         />
//                         <p className="text-xs text-gray-500">
//                           Higher values remove more background noise but may affect voice quality
//                         </p>
//                       </div>
                      
//                       {/* Silence Detection */}
//                       <div className="space-y-2">
//                         <div className="flex items-center justify-between">
//                           <Label>Silence Timeout</Label>
//                           <span className="text-sm text-gray-500">{(silenceTimeout / 1000).toFixed(1)}s</span>
//                         </div>
//                         <Slider 
//                           min={500} 
//                           max={3000} 
//                           step={100}
//                           value={[silenceTimeout]}
//                           onValueChange={(value) => setSilenceTimeout(value[0])}
//                         />
//                         <p className="text-xs text-gray-500">
//                           Time of silence before recording stops
//                         </p>
//                       </div>
                      
//                       {/* Audio Processing Options */}
//                       <div className="space-y-3">
//                         <Label>Audio Processing</Label>
//                         <div className="space-y-2">
//                           <div className="flex items-center justify-between">
//                             <Label htmlFor="auto-gain" className="cursor-pointer">Auto Gain Control</Label>
//                             <Switch 
//                               id="auto-gain"
//                               checked={autoGainControl}
//                               onCheckedChange={setAutoGainControl}
//                             />
//                           </div>
                          
//                           <div className="flex items-center justify-between">
//                             <Label htmlFor="noise-suppression" className="cursor-pointer">Vonage Noise Suppression</Label>
//                             <Switch 
//                               id="noise-suppression"
//                               checked={useNoiseSuppression}
//                               onCheckedChange={handleToggleNoiseSuppression}
//                             />
//                           </div>
                          
//                           <div className="flex items-center justify-between">
//                             <Label htmlFor="echo-cancellation" className="cursor-pointer">Echo Cancellation</Label>
//                             <Switch 
//                               id="echo-cancellation"
//                               checked={echoCancellation}
//                               onCheckedChange={setEchoCancellation}
//                             />
//                           </div>
                          
//                           <div className="flex items-center justify-between">
//                             <Label htmlFor="adaptive-vad" className="cursor-pointer">Adaptive VAD</Label>
//                             <Switch 
//                               id="adaptive-vad"
//                               checked={adaptiveVAD}
//                               onCheckedChange={setAdaptiveVAD}
//                             />
//                           </div>
//                         </div>
//                       </div>
//                     </TabsContent>
                    
//                     <TabsContent value="api" className="space-y-4">
//                       {/* Language Selection */}
//                       <div className="space-y-2">
//                         <Label htmlFor="language-select">Language</Label>
//                         <Select value={language} onValueChange={setLanguage}>
//                           <SelectTrigger id="language-select">
//                             <SelectValue placeholder="Select language" />
//                           </SelectTrigger>
//                           <SelectContent>
//                             <SelectItem value="en-IN">English (India)</SelectItem>
//                             <SelectItem value="hi-IN">Hindi</SelectItem>
//                             <SelectItem value="bn-IN">Bengali</SelectItem>
//                             <SelectItem value="gu-IN">Gujarati</SelectItem>
//                             <SelectItem value="kn-IN">Kannada</SelectItem>
//                             <SelectItem value="ml-IN">Malayalam</SelectItem>
//                             <SelectItem value="mr-IN">Marathi</SelectItem>
//                             <SelectItem value="od-IN">Odia</SelectItem>
//                             <SelectItem value="pa-IN">Punjabi</SelectItem>
//                             <SelectItem value="ta-IN">Tamil</SelectItem>
//                             <SelectItem value="te-IN">Telugu</SelectItem>
//                           </SelectContent>
//                         </Select>
//                       </div>
                      
//                       {/* Audio Quality */}
//                       <div className="space-y-2">
//                         <Label htmlFor="quality-select">Audio Quality</Label>
//                         <Select value={audioQualityValue} onValueChange={setAudioQualityValue}>
//                           <SelectTrigger id="quality-select">
//                             <SelectValue placeholder="Select quality" />
//                           </SelectTrigger>
//                           <SelectContent>
//                             <SelectItem value="low">Low (8kHz)</SelectItem>
//                             <SelectItem value="medium">Medium (16kHz)</SelectItem>
//                             <SelectItem value="high">High (44.1kHz)</SelectItem>
//                           </SelectContent>
//                         </Select>
//                       </div>
                      
//                       {/* API Endpoint */}
//                       <div className="space-y-2">
//                         <Label htmlFor="api-endpoint">API Endpoint</Label>
//                         <Input
//                           id="api-endpoint"
//                           value={apiEndpoint}
//                           onChange={(e) => setApiEndpoint(e.target.value)}
//                         />
//                         <p className="text-xs text-gray-500">
//                           Default endpoint: /api/sarvam
//                         </p>
//                       </div>
//                     </TabsContent>
//                   </Tabs>
//                 </CardContent>
//               </Card>
//             )}
            
//             {/* Noise Profile Card */}
//             {noiseProfile && (
//               <Card className="mb-4">
//                 <CardContent className="pt-4">
//                   <div className="flex items-center mb-2">
//                     <BarChart className="w-4 h-4 mr-2 text-gray-600" />
//                     <span className="font-medium">Noise Profile</span>
//                   </div>
//                   <div className="grid grid-cols-2 gap-2 text-sm">
//                     <div>
//                       <span className="text-gray-600">Environment:</span>{' '}
//                       <Badge variant={noiseProfile.isNoisy ? "outline" : "secondary"}>
//                         {noiseProfile.isNoisy ? 'Noisy' : 'Quiet'}
//                       </Badge>
//                     </div>
//                     <div>
//                       <span className="text-gray-600">Signal Quality:</span>{' '}
//                       <Badge variant={getSignalQuality(noiseProfile) !== 'Poor' ? "secondary" : "outline"}>
//                         {getSignalQuality(noiseProfile)}
//                       </Badge>
//                     </div>
//                     <div>
//                       <span className="text-gray-600">Average Level:</span>{' '}
//                       <span>{Math.round(noiseProfile.averageLevel * 100)}%</span>
//                     </div>
//                     <div>
//                       <span className="text-gray-600">Peak Level:</span>{' '}
//                       <span>{Math.round(noiseProfile.peakLevel * 100)}%</span>
//                     </div>
//                   </div>
//                 </CardContent>
//               </Card>
//             )}

//             {/* Main Control Button */}
//             <div className="flex flex-col items-center justify-center mt-4">
//               <Button
//                 onClick={isListening ? stopListening : startListening}
//                 disabled={!isInitialized || isProcessing}
//                 className={`rounded-full px-6 ${isListening ? "bg-red-500 hover:bg-red-600" : ""}`}
//                 size="lg"
//                 variant={isListening ? "destructive" : "default"}
//               >
//                 {isListening ? (
//                   <>
//                     <MicOff className="w-5 h-5 mr-2" />
//                     Stop Listening
//                   </>
//                 ) : (
//                   <>
//                     <Mic className="w-5 h-5 mr-2" />
//                     Start Listening
//                   </>
//                 )}
//               </Button>

//               {/* Recording Status */}
//               {isRecording && (
//                 <div className="text-center mt-2">
//                   <p className="text-sm text-red-500 animate-pulse mb-1">
//                     Recording speech...
//                   </p>
//                   {recordingDuration !== null && (
//                     <p className="text-xs text-gray-600">
//                       Duration: {formatTime(recordingDuration)}
//                     </p>
//                   )}
//                 </div>
//               )}
//             </div>
//           </div>

//           {/* Transcript Display */}
//           <Card>
//             <CardContent className="pt-6">
//               <div className="flex items-center justify-between mb-2">
//                 <h2 className="font-semibold">Transcription:</h2>
//                 <div className="flex items-center">
//                   {lastRecordingUrl && (
//                     <Button
//                       onClick={playRecordedAudio}
//                       variant="outline"
//                       size="sm"
//                       className="mr-3 flex items-center"
//                     >
//                       {isPlaying ? "Pause" : "Play"}
//                     </Button>
//                   )}
//                   {transcriptConfidence !== null && (
//                     <Badge className={getConfidenceColor(transcriptConfidence)}>
//                       Confidence: {Math.round(transcriptConfidence * 100)}%
//                     </Badge>
//                   )}
//                 </div>
//               </div>
              
//               <div className="bg-white p-3 rounded border min-h-40">
//                 {transcript ? (
//                   <p className={getConfidenceColor(transcriptConfidence)}>{transcript}</p>
//                 ) : (
//                   <p className="text-gray-400 italic">Speak to see transcription here...</p>
//                 )}
//               </div>
              
//               {/* Hidden audio element for playback */}
//               <audio ref={audioRef} src={lastRecordingUrl ?? undefined} className="hidden" />
              
//               {/* Segment Timeline */}
//               {segments.length > 0 && (
//                 <div className="mt-4">
//                   <h3 className="text-sm font-medium mb-2">Speech Segments:</h3>
//                   <ScrollArea className="h-40">
//                     <div className="space-y-2">
//                       {segments.map((segment, idx) => (
//                         <Card key={idx} className="p-2">
//                           <div className="flex justify-between text-gray-600 mb-1 text-xs">
//                             <span>
//                               {formatTime(segment.startTime)} - {formatTime(segment.endTime)}
//                             </span>
//                             <Badge variant="outline" className={getConfidenceColor(segment.confidence)}>
//                               {Math.round(segment.confidence * 100)}%
//                             </Badge>
//                           </div>
//                           <p className="text-sm">{segment.text}</p>
//                         </Card>
//                       ))}
//                     </div>
//                   </ScrollArea>
//                 </div>
//               )}
//             </CardContent>
//           </Card>
//         </CardContent>
//       </Card>
//     </div>
//   );
// };

// export default EnhancedSpeechRecognition;