"use client";

import React, { useState, useRef, useEffect } from "react";
import { Mic, MicOff, Volume2, Settings, BarChart } from "lucide-react";
import { VADManager, NoiseProfile, AudioData } from "../lib/audio-vad";

// Define API-specific interfaces directly in the component file
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

/**
 * Enhanced Real-time Speech Recognition component with advanced VAD features
 */
const EnhancedSpeechRecognition: React.FC = () => {
  // Core state
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string>("");
  const [status, setStatus] = useState<string>("Initializing...");
  
  // Enhanced state for new features
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [noiseProfile, setNoiseProfile] = useState<NoiseProfile | null>(null);
  const [recordingDuration, setRecordingDuration] = useState<number | null>(null);
  const [transcriptConfidence, setTranscriptConfidence] = useState<number | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  
  // VAD settings
  const [vadSensitivity, setVadSensitivity] = useState<number>(0.75);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [maxRecordingDuration, setMaxRecordingDuration] = useState<number>(30000);
  const [minRecordingDuration] = useState<number>(250);
  const [silenceTimeout, setSilenceTimeout] = useState<number>(1500);
  
  // Audio processing options
  const [autoGainControl, setAutoGainControl] = useState<boolean>(true);
  const [noiseSuppression, setNoiseSuppression] = useState<boolean>(true);
  const [echoCancellation, setEchoCancellation] = useState<boolean>(true);
  
  // API-specific settings
  const [language, setLanguage] = useState<string>("en-IN");
  const [model, setModel] = useState<string>("saarika:v2");
  const [apiEndpoint, setApiEndpoint] = useState<string>("/api/sarvam");
  const [withTimestamps, setWithTimestamps] = useState<boolean>(true);

  // Reference to VAD manager
  const vadManagerRef = useRef<VADManager | null>(null);

  // State polling interval for UI updates
  const pollingIntervalRef = useRef<number | null>(null);

  // Initialize the VAD manager
  useEffect(() => {
    // Create a new VAD manager with configurations
    const vadManager = new VADManager(
      {
        minRecordingDuration: minRecordingDuration,
        maxRecordingDuration: maxRecordingDuration,
        autoGainControl: autoGainControl,
        noiseSuppression: noiseSuppression,
        echoCancellation: echoCancellation,
        vadSensitivity: vadSensitivity,
        silenceDetectionTimeout: silenceTimeout
      },
      {
        // Basic event handlers
        onStatusChange: (newStatus) => setStatus(newStatus),
        onError: (errorMessage) => setError(errorMessage),
        onProcessing: (processing) => setIsProcessing(processing),
        onRecordingChange: (recording) => setIsRecording(recording),
        
        // Advanced event handlers
        onAudioLevelUpdate: (level) => setAudioLevel(level),
        onNoiseProfile: (profile) => setNoiseProfile(profile),
        
        // Handle captured audio
        onAudioCaptured: (audio) => {
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
    vadManager.initialize()
      .then(() => {
        const state = vadManager.getState();
        setIsInitialized(state.isInitialized);
        
        // Start polling for state updates
        startStatePolling();
      })
      .catch((err) => {
        console.error("Failed to initialize VAD manager:", err);
        setError(err instanceof Error ? err.message : "Failed to initialize voice detection");
      });

    // Cleanup on unmount
    return () => {
      if (vadManagerRef.current) {
        vadManagerRef.current.dispose();
      }
      
      // Clear polling interval
      if (pollingIntervalRef.current !== null) {
        window.clearInterval(pollingIntervalRef.current);
      }
    };
  }, [
    minRecordingDuration, 
    maxRecordingDuration, 
    autoGainControl, 
    noiseSuppression, 
    echoCancellation, 
    vadSensitivity, 
    silenceTimeout
  ]);

  /**
   * Process and send audio to API
   */
  const processAndSendAudio = async (audioData: AudioData): Promise<void> => {
    try {
      setIsProcessing(true);
      setStatus("Processing audio...");
      
      // Convert Float32Array to WAV Blob
      const wavBlob = await convertFloat32ArrayToWav(audioData);
      const wavSize = Math.round(wavBlob.size / 1024);
      console.log(`WAV blob size: ${wavSize}KB, type: ${wavBlob.type}`);
      
      setStatus("Sending to Speech API...");
  
      const formData = new FormData();
      formData.append("file", wavBlob, "recording.wav");
      formData.append("language_code", language);
      formData.append("model", model);
      formData.append("with_timestamps", withTimestamps.toString());
  
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
          const errorText = await response.text().catch(() => "Could not read error response");
          throw new Error(`API Error (${response.status}): ${errorText}`);
        }
    
        const data = await response.json() as APIResponse;
    
        const newText = data.transcript || "";
        setTranscript(prev => prev ? `${prev} ${newText}` : newText);
        
        // Store confidence score if available
        if (data.confidence !== undefined) {
          setTranscriptConfidence(data.confidence);
        }
        
        // Store detailed segment information if available
        if (data.segments && data.segments.length > 0) {
          setSegments(prevSegments => [...prevSegments, ...data.segments]);
        }
    
        setStatus("Received transcription");
      } catch (fetchError) {
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          throw new Error('API request timed out after 30 seconds');
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

  /**
   * Convert Float32Array to WAV Blob
   */
  const convertFloat32ArrayToWav = async (audioData: AudioData): Promise<Blob> => {
    try {
      // Import WavEncoder dynamically to avoid SSR issues
      const wavEncoder = await import('wav-encoder');
      
      // Create audio data format suitable for WavEncoder
      const audioDataForEncoder = {
        sampleRate: 16000, // VAD returns audio at 16kHz
        channelData: [audioData] // Mono audio
      };
      
      // Encode as WAV
      const wavBuffer = await wavEncoder.encode(audioDataForEncoder);
      return new Blob([wavBuffer], { type: 'audio/wav' });
    } catch (error) {
      console.error("Error converting audio data to WAV:", error);
      throw error;
    }
  };

  // Start listening for speech
  const startListening = async (): Promise<void> => {
    if (!vadManagerRef.current) return;
    
    try {
      setError(null);
      setTranscript("");
      setSegments([]);
      setTranscriptConfidence(null);
      
      await vadManagerRef.current.startListening();
      setIsListening(true);
    } catch (err) {
      console.error("Failed to start listening:", err);
      setError(err instanceof Error ? err.message : "Unknown error starting listening");
    }
  };

  // Stop listening for speech
  const stopListening = async (): Promise<void> => {
    if (!vadManagerRef.current) return;
    
    try {
      await vadManagerRef.current.stopListening();
      setIsListening(false);
    } catch (err) {
      console.error("Failed to stop listening:", err);
      setError(err instanceof Error ? err.message : "Unknown error stopping listening");
    }
  };

  // Manually adjust VAD sensitivity
  const handleSensitivityChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const newValue = parseFloat(e.target.value);
    setVadSensitivity(newValue);
    
    if (vadManagerRef.current) {
      vadManagerRef.current.setSensitivity(newValue);
    }
  };

  // Poll VAD manager state for UI updates
  const startStatePolling = (): void => {
    if (pollingIntervalRef.current !== null) {
      window.clearInterval(pollingIntervalRef.current);
    }
    
    pollingIntervalRef.current = window.setInterval(() => {
      if (!vadManagerRef.current) return;
      
      const state = vadManagerRef.current.getState();
      
      // Update recording duration if active
      if (state.recordingDuration !== null) {
        setRecordingDuration(state.recordingDuration);
      }
    }, 100);
  };

  // Format time in MM:SS.ms format
  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = Math.floor((ms % 1000) / 10);
    
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
  };

  // Restart VAD with new settings
  const applySettings = (): void => {
    if (isListening && vadManagerRef.current) {
      // Stop listening before re-initializing
      void stopListening().then(() => {
        // Re-initialize with new settings (this will trigger the useEffect)
        if (vadManagerRef.current) {
          vadManagerRef.current.dispose();
          vadManagerRef.current = null;
        }
      });
    }
  };

  // Get color based on audio level
  const getAudioLevelColor = (level: number): string => {
    if (level < 0.2) return 'bg-green-500';
    if (level < 0.5) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  // Get SNR quality description
  const getSNRQuality = (snr: number): string => {
    if (snr > 5) return 'Excellent';
    if (snr > 2) return 'Good';
    if (snr > 1) return 'Fair';
    return 'Poor';
  };

  // Calculate transcript color based on confidence
  const getConfidenceColor = (confidence: number | null): string => {
    if (confidence === null) return 'text-gray-700';
    if (confidence >= 0.8) return 'text-green-700';
    if (confidence >= 0.5) return 'text-yellow-700';
    return 'text-red-700';
  };

  return (
    <div className="min-h-screen p-4 bg-gray-50">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-bold text-center mb-4">Enhanced Speech Recognition</h1>
        <p className="text-center text-gray-600 mb-6">With advanced Voice Activity Detection features</p>

        {error && (
          <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4 rounded">
            <p className="font-medium">Error</p>
            <p>{error}</p>
          </div>
        )}

        <div className="mb-6">
          <div className="flex items-center justify-between">
            <p className="text-gray-600">{status}</p>
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center text-blue-600 hover:text-blue-800"
            >
              <Settings className="w-4 h-4 mr-1" />
              <span>{showSettings ? 'Hide Settings' : 'Show Settings'}</span>
            </button>
          </div>

          {/* Audio Level Indicator */}
          <div className="mb-4 mt-2">
            <div className="flex items-center mb-1">
              <Volume2 className="w-4 h-4 mr-2 text-gray-600" />
              <span className="text-sm text-gray-600">Audio Level</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div 
                className={`h-2.5 rounded-full ${getAudioLevelColor(audioLevel)}`} 
                style={{ width: `${audioLevel * 100}%` }}
              ></div>
            </div>
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <div className="border rounded-lg p-4 bg-gray-50 mb-4">
              <h3 className="font-semibold mb-3">Settings</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* VAD Settings Section */}
                <div className="border-b pb-3 mb-3 md:border-b-0 md:border-r md:pr-4 md:mb-0">
                  <h4 className="font-medium mb-2">Voice Detection Settings</h4>
                  
                  {/* VAD Sensitivity */}
                  <div className="mb-2">
                    <label className="block text-sm font-medium mb-1">
                      VAD Sensitivity: {vadSensitivity.toFixed(2)}
                    </label>
                    <input 
                      type="range" 
                      min="0" 
                      max="1" 
                      step="0.05"
                      value={vadSensitivity}
                      onChange={handleSensitivityChange}
                      className="w-full"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Higher values detect speech more easily but may cause false triggers
                    </p>
                  </div>
                  
                  {/* Recording Duration Limits */}
                  <div className="mb-2">
                    <label className="block text-sm font-medium mb-1">
                      Max Recording Duration: {(maxRecordingDuration / 1000).toFixed(1)}s
                    </label>
                    <input 
                      type="range" 
                      min="5000" 
                      max="60000" 
                      step="1000"
                      value={maxRecordingDuration}
                      onChange={(e) => setMaxRecordingDuration(parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  
                  {/* Audio Processing Options */}
                  <div className="mb-2">
                    <label className="block text-sm font-medium mb-2">Audio Processing</label>
                    <div className="flex flex-col space-y-2">
                      <label className="inline-flex items-center">
                        <input 
                          type="checkbox" 
                          checked={autoGainControl}
                          onChange={() => setAutoGainControl(!autoGainControl)}
                          className="rounded"
                        />
                        <span className="ml-2 text-sm">Auto Gain Control</span>
                      </label>
                      <label className="inline-flex items-center">
                        <input 
                          type="checkbox" 
                          checked={noiseSuppression}
                          onChange={() => setNoiseSuppression(!noiseSuppression)}
                          className="rounded"
                        />
                        <span className="ml-2 text-sm">Noise Suppression</span>
                      </label>
                      <label className="inline-flex items-center">
                        <input 
                          type="checkbox" 
                          checked={echoCancellation}
                          onChange={() => setEchoCancellation(!echoCancellation)}
                          className="rounded"
                        />
                        <span className="ml-2 text-sm">Echo Cancellation</span>
                      </label>
                    </div>
                  </div>
                  
                  {/* Silence Detection */}
                  <div className="mb-2">
                    <label className="block text-sm font-medium mb-1">
                      Silence Timeout: {(silenceTimeout / 1000).toFixed(1)}s
                    </label>
                    <input 
                      type="range" 
                      min="500" 
                      max="3000" 
                      step="100"
                      value={silenceTimeout}
                      onChange={(e) => setSilenceTimeout(parseInt(e.target.value))}
                      className="w-full"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Time of silence before recording stops
                    </p>
                  </div>
                </div>
                
                {/* API Settings Section */}
                <div>
                  <h4 className="font-medium mb-2">Speech API Settings</h4>
                  
                  {/* Language Selection */}
                  <div className="mb-3">
                    <label className="block text-sm font-medium mb-1">
                      Language
                    </label>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="w-full p-2 border rounded"
                    >
                      <option value="en-IN">English (India)</option>
                      <option value="en-US">English (US)</option>
                      <option value="hi-IN">Hindi</option>
                      {/* Add more language options as needed */}
                    </select>
                  </div>
                  
                  {/* Model Selection */}
                  <div className="mb-3">
                    <label className="block text-sm font-medium mb-1">
                      Model
                    </label>
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="w-full p-2 border rounded"
                    >
                      <option value="saarika:v2">Saarika v2</option>
                      <option value="whisper:small">Whisper Small</option>
                      <option value="whisper:medium">Whisper Medium</option>
                      {/* Add more model options as needed */}
                    </select>
                  </div>
                  
                  {/* API Endpoint */}
                  <div className="mb-3">
                    <label className="block text-sm font-medium mb-1">
                      API Endpoint
                    </label>
                    <input
                      type="text"
                      value={apiEndpoint}
                      onChange={(e) => setApiEndpoint(e.target.value)}
                      className="w-full p-2 border rounded"
                    />
                  </div>
                  
                  {/* Include Timestamps */}
                  <div className="mb-3">
                    <label className="inline-flex items-center">
                      <input 
                        type="checkbox" 
                        checked={withTimestamps}
                        onChange={() => setWithTimestamps(!withTimestamps)}
                        className="rounded"
                      />
                      <span className="ml-2 text-sm">Include Timestamps</span>
                    </label>
                  </div>
                </div>
              </div>
              
              <div className="mt-4">
                <button
                  onClick={applySettings}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Apply Settings
                </button>
              </div>
            </div>
          )}
          
          {/* Noise Profile Info */}
          {noiseProfile && (
            <div className="border rounded-lg p-3 bg-gray-50 mb-4 text-sm">
              <div className="flex items-center mb-1">
                <BarChart className="w-4 h-4 mr-2 text-gray-600" />
                <span className="font-medium">Noise Profile</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-gray-600">Environment:</span>{' '}
                  <span className={noiseProfile.isNoisy ? 'text-yellow-600' : 'text-green-600'}>
                    {noiseProfile.isNoisy ? 'Noisy' : 'Quiet'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">SNR Quality:</span>{' '}
                  <span className={noiseProfile.snr > 2 ? 'text-green-600' : 'text-yellow-600'}>
                    {getSNRQuality(noiseProfile.snr)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Average Level:</span>{' '}
                  <span>{Math.round(noiseProfile.averageLevel * 100)}%</span>
                </div>
                <div>
                  <span className="text-gray-600">Peak Level:</span>{' '}
                  <span>{Math.round(noiseProfile.peakLevel * 100)}%</span>
                </div>
              </div>
            </div>
          )}

          {/* Main Control Button */}
          <div className="flex flex-col items-center justify-center mt-4">
            <button
              onClick={isListening ? () => void stopListening() : () => void startListening()}
              disabled={!isInitialized || isProcessing}
              className={`px-6 py-3 rounded-full flex items-center justify-center transition-colors ${
                isListening
                  ? "bg-red-500 hover:bg-red-600"
                  : "bg-blue-500 hover:bg-blue-600"
              } text-white disabled:opacity-50 disabled:cursor-not-allowed`}
              type="button"
              aria-label={isListening ? "Stop Listening" : "Start Listening"}
            >
              {isListening ? (
                <>
                  <MicOff className="w-5 h-5 mr-2" />
                  Stop Listening
                </>
              ) : (
                <>
                  <Mic className="w-5 h-5 mr-2" />
                  Start Listening
                </>
              )}
            </button>

            {/* Recording Status */}
            {isRecording && (
              <div className="text-center mt-2">
                <p className="text-sm text-red-500 animate-pulse mb-1">
                  Recording speech...
                </p>
                {recordingDuration !== null && (
                  <p className="text-xs text-gray-600">
                    Duration: {formatTime(recordingDuration)}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Transcript Display */}
        <div className="border rounded-lg p-4 bg-gray-50">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold">Transcription:</h2>
            {transcriptConfidence !== null && (
              <span className={`text-sm ${getConfidenceColor(transcriptConfidence)}`}>
                Confidence: {Math.round(transcriptConfidence * 100)}%
              </span>
            )}
          </div>
          
          <div className="bg-white p-3 rounded border min-h-40">
            {transcript ? (
              <p className={getConfidenceColor(transcriptConfidence)}>{transcript}</p>
            ) : (
              <p className="text-gray-400 italic">Speak to see transcription here...</p>
            )}
          </div>
          
          {/* Segment Timeline (Optional) */}
          {segments.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium mb-2">Speech Segments:</h3>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {segments.map((segment, idx) => (
                  <div key={idx} className="text-xs border rounded p-2 bg-white">
                    <div className="flex justify-between text-gray-600 mb-1">
                      <span>
                        {formatTime(segment.startTime)} - {formatTime(segment.endTime)}
                      </span>
                      <span className={getConfidenceColor(segment.confidence)}>
                        {Math.round(segment.confidence * 100)}%
                      </span>
                    </div>
                    <p>{segment.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EnhancedSpeechRecognition;