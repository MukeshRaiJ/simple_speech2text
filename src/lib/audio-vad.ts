// lib/audio-vad.ts
"use client";

import type WavEncoder from 'wav-encoder';

// Type definitions for MicVAD
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AudioData extends Float32Array {
  // AudioData extends Float32Array with no additional properties
}

export interface MicVAD {
  new: (options: MicVADOptions) => Promise<MicVADInstance>;
}

export interface MicVADOptions {
  onSpeechStart?: () => void;
  onSpeechEnd?: (audio: AudioData) => void;
  onError?: (error: Error) => void;
  onVADMisfire?: () => void;  // Callback for false positive detections
  onBackgroundNoiseLevel?: (level: number) => void; // Background noise monitoring
  baseAssetPath?: string;
  onnxWASMBasePath?: string;
  vadThreshold?: number; // Configurable VAD threshold sensitivity
  silenceThreshold?: number; // Threshold for silence detection
}

export interface MicVADInstance {
  start: () => Promise<void>;
  pause: () => Promise<void>;
  setSensitivity: (threshold: number) => void; // Dynamically adjust sensitivity
  getAudioLevel: () => number; // Get current audio level
}

// Type definitions for audio processing options
export interface AudioProcessingOptions {
  minRecordingDuration?: number;
  maxRecordingDuration?: number; // Maximum recording duration
  autoGainControl?: boolean; // Enable/disable automatic gain control
  noiseSuppression?: boolean; // Enable/disable noise suppression
  echoCancellation?: boolean; // Enable/disable echo cancellation
  vadSensitivity?: number; // Initial VAD sensitivity (0.0-1.0)
  silenceDetectionTimeout?: number; // Time in ms to consider silence as end of speech
}

// VAD Manager events interface
export interface VADManagerEvents {
  onStatusChange?: (status: string) => void;
  onError?: (error: string) => void;
  onProcessing?: (isProcessing: boolean) => void;
  onAudioCaptured?: (audio: AudioData) => void; // New: Event for captured audio data
  onRecordingChange?: (isRecording: boolean) => void;
  onAudioLevelUpdate?: (level: number) => void; // Audio level monitoring
  onNoiseProfile?: (profile: NoiseProfile) => void; // Noise profile information
}

// Noise profile information
export interface NoiseProfile {
  averageLevel: number;
  peakLevel: number;
  isNoisy: boolean;
  snr: number; // Signal-to-noise ratio estimate
}

export interface VADManagerState {
  isInitialized: boolean;
  isListening: boolean;
  isRecording: boolean;
  isProcessing: boolean;
  currentAudioLevel: number; // Current audio level
  noiseProfile: NoiseProfile | null; // Current noise profile
  recordingDuration: number | null; // Current recording duration if recording
}

/**
 * VADManager - Manages Voice Activity Detection
 */
export class VADManager {
  // Configuration
  private readonly minRecordingDuration: number;
  private readonly maxRecordingDuration: number;
  private readonly autoGainControl: boolean;
  private readonly noiseSuppression: boolean;
  private readonly echoCancellation: boolean;
  private readonly vadSensitivity: number;
  private readonly silenceDetectionTimeout: number;
  
  // State
  private isInitialized = false;
  private isListening = false;
  private isRecording = false;
  private isProcessing = false;
  private chunkCount = 0;
  private currentAudioLevel = 0;
  private noiseProfile: NoiseProfile | null = null;
  private recordingDuration: number | null = null;
  
  // References
  private audioContext: AudioContext | null = null;
  private microphoneStream: MediaStream | null = null;
  private audioAnalyser: AnalyserNode | null = null;
  private recordingStartTime: number | null = null;
  private vadInstance: MicVADInstance | null = null;
  private maxRecordingTimeout: number | null = null;
  private audioLevelInterval: number | null = null;
  private noiseProfilingData: number[] = [];
  
  // Events
  private events: VADManagerEvents;

  constructor(options?: AudioProcessingOptions, events?: VADManagerEvents) {
    // Default configuration
    this.minRecordingDuration = options?.minRecordingDuration ?? 250;
    this.maxRecordingDuration = options?.maxRecordingDuration ?? 30000; // Default 30 seconds max
    this.autoGainControl = options?.autoGainControl ?? true;
    this.noiseSuppression = options?.noiseSuppression ?? true;
    this.echoCancellation = options?.echoCancellation ?? true;
    this.vadSensitivity = options?.vadSensitivity ?? 0.75; // Default sensitivity
    this.silenceDetectionTimeout = options?.silenceDetectionTimeout ?? 1500; // Default 1.5s silence
    
    // Events
    this.events = events ?? {};
  }

  /**
   * Initialize the Voice Activity Detector
   */
  public async initialize(): Promise<void> {
    try {
      this.updateStatus("Initializing voice detector...");

      // Create audio context
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000,
      });

      // Set up constraints for getUserMedia with our audio settings
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: this.echoCancellation,
          noiseSuppression: this.noiseSuppression,
          autoGainControl: this.autoGainControl,
          sampleRate: 16000,
          channelCount: 1
        },
        video: false
      };

      // Get microphone stream
      this.microphoneStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Set up audio analyser for level monitoring
      await this.setupAudioAnalyser();
      
      // Start profiling background noise
      await this.startNoiseProfiler();

      // Import MicVAD dynamically to avoid SSR issues
      const { MicVAD } = await import("@ricky0123/vad-web") as unknown as { MicVAD: MicVAD };

      // Initialize the VAD instance with proper callbacks
      this.vadInstance = await MicVAD.new({
        // Callback when speech is detected
        onSpeechStart: () => {
          console.log("Speech started");
          this.isRecording = true;
          this.recordingStartTime = Date.now();
          this.updateStatus("Recording speech...");
          
          // Start monitoring recording duration
          this.startRecordingDurationTracking();
          
          // Set a timeout for maximum recording duration
          this.setupMaxRecordingTimeout();
          
          if (this.events.onRecordingChange) {
            this.events.onRecordingChange(true);
          }
        },
        
        // Callback when speech ends - we get audio data here
        onSpeechEnd: (audio: AudioData) => {
          console.log("Speech ended, audio duration:", audio.length / 16000, "seconds");
          this.isRecording = false;
          this.clearMaxRecordingTimeout();
          this.recordingDuration = null;
          
          if (this.events.onRecordingChange) {
            this.events.onRecordingChange(false);
          }
          
          // Only process if the audio is long enough
          const duration = audio.length / 16000 * 1000; // Convert to ms
          if (duration >= this.minRecordingDuration) {
            // Instead of processing directly, emit the audio data
            if (this.events.onAudioCaptured) {
              this.events.onAudioCaptured(audio);
            }
          } else {
            console.log("Audio too short, discarding");
            // Trigger misfire event for very short detections
            if (duration < 100 && this.vadInstance && "onVADMisfire" in this.vadInstance) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (this.vadInstance as any).onVADMisfire?.();
            }
          }
        },
        
        // Handle any errors from the VAD
        onError: (error: Error) => {
          console.error("VAD error:", error);
          this.handleError("VAD error: " + (error.message || "Unknown error"));
        },
        
        // VAD misfire detection (false positives)
        onVADMisfire: () => {
          console.log("VAD misfire detected (false positive)");
          // Consider adjusting sensitivity dynamically
          this.adjustVADSensitivity();
        },
        
        // Background noise level monitoring
        onBackgroundNoiseLevel: (level: number) => {
          this.updateNoiseProfile(level);
        },
        
        // Configure VAD sensitivity
        vadThreshold: this.vadSensitivity,
        
        // Configure silence threshold
        silenceThreshold: 0.2 // Default value, can be adjusted
      });
      
      // Start audio level monitoring
      this.startAudioLevelMonitoring();
      
      this.isInitialized = true;
      this.updateStatus("Ready! Click the microphone button to start listening.");
      return;
    } catch (err) {
      console.error("Initialization error:", err);
      this.handleError(
        err instanceof Error
          ? err.message
          : "Failed to initialize audio. Please check microphone permissions."
      );
      this.updateStatus("Error initializing audio. Please check microphone permissions.");
      throw err;
    }
  }

  /**
   * Set up audio analyser for level monitoring
   */
  private async setupAudioAnalyser(): Promise<void> {
    if (!this.audioContext || !this.microphoneStream) return;
    
    try {
      const source = this.audioContext.createMediaStreamSource(this.microphoneStream);
      this.audioAnalyser = this.audioContext.createAnalyser();
      this.audioAnalyser.fftSize = 1024;
      this.audioAnalyser.smoothingTimeConstant = 0.8;
      source.connect(this.audioAnalyser);
    } catch (error) {
      console.error("Error setting up audio analyser:", error);
    }
  }

  /**
   * Start monitoring audio levels
   */
  private startAudioLevelMonitoring(): void {
    if (!this.audioAnalyser) return;
    
    // Clear any existing interval
    if (this.audioLevelInterval !== null) {
      window.clearInterval(this.audioLevelInterval);
    }
    
    const dataArray = new Uint8Array(this.audioAnalyser.frequencyBinCount);
    
    this.audioLevelInterval = window.setInterval(() => {
      if (!this.audioAnalyser) return;
      
      // Get current audio level
      this.audioAnalyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length;
      this.currentAudioLevel = average / 255; // Normalize to 0-1
      
      // Emit event with current level
      if (this.events.onAudioLevelUpdate) {
        this.events.onAudioLevelUpdate(this.currentAudioLevel);
      }
    }, 100); // Update every 100ms
  }

  /**
   * Begin profiling background noise
   */
  private async startNoiseProfiler(): Promise<void> {
    if (!this.audioAnalyser) return;
    
    // Collect noise samples for 2 seconds
    this.noiseProfilingData = [];
    const dataArray = new Uint8Array(this.audioAnalyser.frequencyBinCount);
    
    return new Promise((resolve) => {
      const interval = setInterval(() => {
        if (!this.audioAnalyser) {
          clearInterval(interval);
          resolve();
          return;
        }
        
        this.audioAnalyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length;
        this.noiseProfilingData.push(average / 255);
      }, 100);
      
      // After 2 seconds, calculate noise profile
      setTimeout(() => {
        clearInterval(interval);
        this.calculateNoiseProfile();
        resolve();
      }, 2000);
    });
  }

  /**
   * Calculate noise profile from collected samples
   */
  private calculateNoiseProfile(): void {
    if (this.noiseProfilingData.length === 0) return;
    
    const average = this.noiseProfilingData.reduce((acc, val) => acc + val, 0) / this.noiseProfilingData.length;
    const peak = Math.max(...this.noiseProfilingData);
    const isNoisy = average > 0.15; // Threshold for "noisy environment"
    
    // Estimate signal-to-noise ratio (simplified)
    const snr = isNoisy ? 1 / average : 10; // Higher is better
    
    this.noiseProfile = {
      averageLevel: average,
      peakLevel: peak,
      isNoisy,
      snr
    };
    
    // Emit noise profile event
    if (this.events.onNoiseProfile) {
      this.events.onNoiseProfile(this.noiseProfile);
    }
    
    // Adjust VAD sensitivity based on noise profile
    this.adjustVADSensitivity();
    
    console.log("Noise profile:", this.noiseProfile);
  }

  /**
   * Update noise profile with new level data
   */
  private updateNoiseProfile(level: number): void {
    if (!this.noiseProfile) return;
    
    // Update with exponential moving average
    const alpha = 0.1;
    this.noiseProfile.averageLevel = (1 - alpha) * this.noiseProfile.averageLevel + alpha * level;
    this.noiseProfile.peakLevel = Math.max(this.noiseProfile.peakLevel * 0.95, level);
    this.noiseProfile.isNoisy = this.noiseProfile.averageLevel > 0.15;
    this.noiseProfile.snr = this.noiseProfile.isNoisy ? 1 / this.noiseProfile.averageLevel : 10;
    
    // Emit updated profile
    if (this.events.onNoiseProfile) {
      this.events.onNoiseProfile(this.noiseProfile);
    }
  }

  /**
   * Adjust VAD sensitivity based on noise profile
   */
  private adjustVADSensitivity(): void {
    if (!this.vadInstance || !this.noiseProfile) return;
    
    // Custom VAD instance methods may not be in the type definition
    const vadWithSensitivity = this.vadInstance as unknown as { setSensitivity: (value: number) => void };
    
    if (typeof vadWithSensitivity.setSensitivity === 'function') {
      let sensitivity = this.vadSensitivity;
      
      // Adjust based on noise profile
      if (this.noiseProfile.isNoisy) {
        // Reduce sensitivity in noisy environments
        sensitivity = Math.max(0.3, this.vadSensitivity - 0.2);
      } else {
        // Increase sensitivity in quiet environments
        sensitivity = Math.min(0.9, this.vadSensitivity + 0.1);
      }
      
      console.log(`Adjusting VAD sensitivity to ${sensitivity} based on noise profile`);
      vadWithSensitivity.setSensitivity(sensitivity);
    }
  }

  /**
   * Start tracking recording duration
   */
  private startRecordingDurationTracking(): void {
    if (this.recordingStartTime === null) return;
    
    const updateInterval = setInterval(() => {
      if (!this.isRecording || this.recordingStartTime === null) {
        clearInterval(updateInterval);
        return;
      }
      
      this.recordingDuration = Date.now() - this.recordingStartTime;
    }, 100);
  }

  /**
   * Set up timeout for maximum recording duration
   */
  private setupMaxRecordingTimeout(): void {
    if (this.maxRecordingTimeout !== null) {
      window.clearTimeout(this.maxRecordingTimeout);
    }
    
    this.maxRecordingTimeout = window.setTimeout(() => {
      if (this.isRecording) {
        console.log(`Recording exceeded maximum duration of ${this.maxRecordingDuration}ms, forcing stop`);
        // Force recording to stop
        this.stopListening().catch(err => {
          console.error("Error stopping recording after timeout:", err);
        });
      }
    }, this.maxRecordingDuration);
  }

  /**
   * Clear maximum recording timeout
   */
  private clearMaxRecordingTimeout(): void {
    if (this.maxRecordingTimeout !== null) {
      window.clearTimeout(this.maxRecordingTimeout);
      this.maxRecordingTimeout = null;
    }
  }

  /**
   * Start voice detection and listening mode
   */
  public async startListening(): Promise<void> {
    if (!this.isInitialized || !this.vadInstance) {
      throw new Error("VAD not initialized");
    }
    
    try {
      this.updateStatus("Starting voice detection...");
      
      // Start the VAD
      await this.vadInstance.start();
      this.isListening = true;
      
      this.updateStatus("Listening for speech...");
    } catch (err) {
      console.error("Start listening error:", err);
      this.handleError("Failed to start listening: " + ((err instanceof Error) ? err.message : "Unknown error"));
      this.updateStatus("Error starting listening");
      throw err;
    }
  }
  
  /**
   * Stop voice detection and listening mode
   */
  public async stopListening(): Promise<void> {
    if (!this.isListening || !this.vadInstance) return;
    
    try {
      // Stop the VAD
      await this.vadInstance.pause();
      this.isListening = false;
      this.isRecording = false;
      this.clearMaxRecordingTimeout();
      this.recordingDuration = null;
      
      if (this.events.onRecordingChange) {
        this.events.onRecordingChange(false);
      }
      
      this.updateStatus("Listening stopped.");
    } catch (err) {
      console.error("Stop listening error:", err);
      this.handleError("Failed to stop listening: " + ((err instanceof Error) ? err.message : "Unknown error"));
      throw err;
    }
  }

  /**
   * Adjust VAD sensitivity manually
   */
  public setSensitivity(value: number): void {
    if (!this.vadInstance) return;
    
    // Ensure value is between 0 and 1
    const sensitivity = Math.max(0, Math.min(1, value));
    
    // Custom VAD instance methods may not be in the type definition
    const vadWithSensitivity = this.vadInstance as unknown as { setSensitivity: (value: number) => void };
    
    if (typeof vadWithSensitivity.setSensitivity === 'function') {
      vadWithSensitivity.setSensitivity(sensitivity);
      console.log(`Manually adjusted VAD sensitivity to ${sensitivity}`);
    }
  }

  /**
   * Get current audio level (0-1)
   */
  public getAudioLevel(): number {
    return this.currentAudioLevel;
  }

  /**
   * Get current noise profile
   */
  public getNoiseProfile(): NoiseProfile | null {
    return this.noiseProfile;
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    if (this.vadInstance) {
      try {
        void this.vadInstance.pause?.();
      } catch (e) {
        console.error("Error stopping VAD:", e);
      }
    }
    
    if (this.audioContext) {
      try {
        void this.audioContext.close();
      } catch (e) {
        console.error("Error closing audio context:", e);
      }
    }
    
    // Stop microphone stream
    if (this.microphoneStream) {
      try {
        this.microphoneStream.getTracks().forEach(track => track.stop());
      } catch (e) {
        console.error("Error stopping microphone stream:", e);
      }
    }
    
    // Clear intervals and timeouts
    if (this.audioLevelInterval !== null) {
      window.clearInterval(this.audioLevelInterval);
      this.audioLevelInterval = null;
    }
    
    this.clearMaxRecordingTimeout();
  }

  /**
   * Get the current state of the manager
   */
  public getState(): VADManagerState {
    return {
      isInitialized: this.isInitialized,
      isListening: this.isListening,
      isRecording: this.isRecording,
      isProcessing: this.isProcessing,
      currentAudioLevel: this.currentAudioLevel,
      noiseProfile: this.noiseProfile,
      recordingDuration: this.recordingDuration
    };
  }

  /**
   * Convert Float32Array to WAV Blob - Utility method for clients
   */
  public async float32ArrayToWavBlob(audioData: AudioData): Promise<Blob> {
    try {
      // Import WavEncoder dynamically to avoid SSR issues
      const wavEncoder: typeof WavEncoder = await import('wav-encoder');
      
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
  }

  /**
   * Update status and trigger event
   */
  private updateStatus(status: string): void {
    if (this.events.onStatusChange) {
      this.events.onStatusChange(status);
    }
  }

  /**
   * Handle error and trigger event
   */
  private handleError(error: string): void {
    if (this.events.onError) {
      this.events.onError(error);
    }
  }
}