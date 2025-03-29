// "use client";

// import type WavEncoder from "wav-encoder";
// import { createVonageNoiseSuppression } from "@vonage/noise-suppression";

// // Core AudioData interface
// // eslint-disable-next-line @typescript-eslint/no-empty-object-type
// export interface AudioData extends Float32Array {
//   // AudioData extends Float32Array with no additional properties
// }

// // Essential MicVAD interfaces
// export interface MicVAD {
//   new: (options: MicVADOptions) => Promise<MicVADInstance>;
// }

// export interface MicVADOptions {
//   onSpeechStart?: () => void;
//   onSpeechEnd?: (audio: AudioData) => void;
//   onError?: (error: Error) => void;
//   onBackgroundNoiseLevel?: (level: number) => void;
//   vadThreshold?: number;
//   silenceThreshold?: number;
// }

// export interface MicVADInstance {
//   start: () => Promise<void>;
//   pause: () => Promise<void>;
//   setSensitivity: (threshold: number) => void;
//   getAudioLevel: () => number;
// }

// // Simplified audio processing options
// export interface AudioProcessingOptions {
//   autoGainControl?: boolean;  // Added back auto gain control
//   echoCancellation?: boolean;
//   vadSensitivity?: number;
//   silenceDetectionTimeout?: number;
//   adaptiveVAD?: boolean;
//   audioQuality?: "low" | "medium" | "high";
//   useVonageNoiseSuppression?: boolean;
//   vonageNoiseSuppresionOptions?: VonageNoiseSuppressionOptions;
//   noiseSuppressIntensity?: number; // New parameter for noise suppression intensity
// }

// // Vonage noise suppression options
// export interface VonageNoiseSuppressionOptions {
//   disableWasmMultiThread?: boolean;
//   assetsDirBaseUrl?: string;
// }

// // Essential VAD event callbacks
// export interface VADEvents {
//   onStatusChange?: (status: string) => void;
//   onError?: (error: string) => void;
//   onAudioCaptured?: (audio: AudioData) => void;
//   onRecordingChange?: (isRecording: boolean) => void;
//   onAudioLevelUpdate?: (level: number) => void;
// }

// // Simplified noise profile
// export interface NoiseProfile {
//   averageLevel: number;
//   peakLevel: number;
//   isNoisy: boolean;
// }

// /**
//  * Simplified VADManager - Core Voice Activity Detection Manager
//  * Optimized for real-time speech-to-text applications
//  * Enhanced with Vonage Noise Suppression
//  */
// export class VADManager {
//   // Configuration
//   private readonly autoGainControl: boolean;  // Added back auto gain control
//   private readonly echoCancellation: boolean;
//   private readonly vadSensitivity: number;
//   private readonly silenceDetectionTimeout: number;
//   private readonly adaptiveVAD: boolean;
//   private readonly audioQuality: "low" | "medium" | "high";
//   private useVonageNoiseSuppression: boolean;
//   private readonly vonageNoiseSuppresionOptions: VonageNoiseSuppressionOptions;
//   private noiseSuppressIntensity: number;

//   // State
//   private isInitialized = false;
//   private isListening = false;
//   private isRecording = false;
//   private currentAudioLevel = 0;
//   private noiseProfile: NoiseProfile | null = null;
//   private recordingDuration: number | null = null;
//   private detectionConfidence: number | null = null;
//   private sessionId: string;

//   // References
//   private audioContext: AudioContext | null = null;
//   private microphoneStream: MediaStream | null = null;
//   private audioAnalyser: AnalyserNode | null = null;
//   private recordingStartTime: number | null = null;
//   private vadInstance: MicVADInstance | null = null;
//   private audioLevelInterval: number | null = null;
//   private audioBuffer: Float32Array[] = [];
  
//   // Vonage Noise Suppression
//   // eslint-disable-next-line @typescript-eslint/no-explicit-any
//   private vonageNoiseProcessor: any = null;
//   // eslint-disable-next-line @typescript-eslint/no-explicit-any
//   private vonageNoiseConnector: any = null;
//   private processedMicrophoneStream: MediaStream | null = null;

//   // Events
//   private events: VADEvents;

//   constructor(options?: AudioProcessingOptions, events?: VADEvents) {
//     // Default configuration
//     this.autoGainControl = options?.autoGainControl ?? true;  // Added back auto gain control
//     this.echoCancellation = options?.echoCancellation ?? true;
//     this.vadSensitivity = options?.vadSensitivity ?? 0.75;
//     this.silenceDetectionTimeout = options?.silenceDetectionTimeout ?? 1500;
//     this.adaptiveVAD = options?.adaptiveVAD ?? true;
//     this.audioQuality = options?.audioQuality ?? "medium";
    
//     // Vonage Noise Suppression options
//     this.useVonageNoiseSuppression = options?.useVonageNoiseSuppression ?? true;
//     this.vonageNoiseSuppresionOptions = options?.vonageNoiseSuppresionOptions ?? {
//       disableWasmMultiThread: false
//     };
//     this.noiseSuppressIntensity = options?.noiseSuppressIntensity ?? 0.7;

//     // Generate session ID
//     this.sessionId = this.generateUniqueId();

//     // Events
//     this.events = events ?? {};
//   }

//   /**
//    * Generate a unique ID for sessions
//    */
//   private generateUniqueId(): string {
//     return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
//   }

//   /**
//    * Initialize the Voice Activity Detector
//    */
//   public async initialize(): Promise<void> {
//     try {
//       this.updateStatus("Initializing voice detector...");

//       // Create audio context with quality settings
//       const sampleRate = this.getOptimalSampleRate();

//       // Initialize AudioContext
//       this.audioContext = new (window.AudioContext ||
//         // eslint-disable-next-line @typescript-eslint/no-explicit-any
//         (window as any).webkitAudioContext)({
//         sampleRate,
//         latencyHint: this.getLatencyHint(),
//       });

//       // Set up constraints for getUserMedia with our audio settings
//       const constraints: MediaStreamConstraints = {
//         audio: {
//           echoCancellation: this.echoCancellation,
//           autoGainControl: this.autoGainControl,  // Added back auto gain control
//           sampleRate,
//           channelCount: 1,
//         },
//         video: false,
//       };

//       // Get microphone stream
//       this.microphoneStream = await navigator.mediaDevices.getUserMedia(
//         constraints
//       );
      
//       // Apply Vonage noise suppression if enabled
//       if (this.useVonageNoiseSuppression) {
//         await this.initializeVonageNoiseSuppression();
//       }

//       // Set up audio analyser for level monitoring
//       await this.setupAudioAnalyser();

//       // Start profiling background noise
//       await this.startNoiseProfiler();

//       // Import MicVAD dynamically to avoid SSR issues
//       const { MicVAD } = (await import("@ricky0123/vad-web")) as unknown as {
//         MicVAD: MicVAD;
//       };

//       // Initialize the VAD instance
//       this.vadInstance = await MicVAD.new({
//         // Callback when speech is detected
//         onSpeechStart: () => {
//           console.log("Speech detected");
//           this.isRecording = true;
//           this.recordingStartTime = Date.now();
//           this.audioBuffer = []; // Reset buffer for new recording
//           this.updateStatus("Recording speech...");

//           // Start monitoring recording duration
//           this.startRecordingDurationTracking();

//           // No maximum recording duration timeout

//           // Emit recording state change
//           if (this.events.onRecordingChange) {
//             this.events.onRecordingChange(true);
//           }

//           // Set initial confidence level
//           this.detectionConfidence = 0.5;
//         },

//         // Callback when speech ends - we get audio data here
//         onSpeechEnd: async (audio: AudioData) => {
//           console.log(
//             "Speech ended, audio duration:",
//             audio.length / sampleRate,
//             "seconds"
//           );
//           this.isRecording = false;
//           this.recordingDuration = null;

//           if (this.events.onRecordingChange) {
//             this.events.onRecordingChange(false);
//           }

//           // Process the audio
//           const processedAudio = audio;
          
//           // No high-pass filter or custom processing - Vonage handles noise suppression
          
//           // Emit the processed audio data
//           if (this.events.onAudioCaptured) {
//             this.events.onAudioCaptured(processedAudio);
//           }
//         },

//         // Handle any errors from the VAD
//         onError: (error: Error) => {
//           console.error("VAD error:", error);
//           this.handleError("VAD error: " + (error.message || "Unknown error"));
//         },

//         // Background noise level monitoring
//         onBackgroundNoiseLevel: (level: number) => {
//           this.updateNoiseProfile(level);
//         },

//         // Configure VAD sensitivity
//         vadThreshold: this.vadSensitivity,

//         // Configure silence threshold - adaptive based on noise profile
//         silenceThreshold: this.calculateSilenceThreshold(),
//       });

//       // Start audio level monitoring
//       this.startAudioLevelMonitoring();

//       this.isInitialized = true;
//       this.updateStatus("VAD ready! Click the microphone button to start listening.");
//       return;
//     } catch (err) {
//       console.error("VAD initialization error:", err);
//       this.handleError(
//         err instanceof Error
//           ? err.message
//           : "Failed to initialize audio. Please check microphone permissions."
//       );
//       this.updateStatus(
//         "Error initializing audio. Please check microphone permissions."
//       );
//       throw err;
//     }
//   }
  
//   /**
//    * Initialize Vonage Noise Suppression
//    */
//   private async initializeVonageNoiseSuppression(): Promise<void> {
//     try {
//       if (!this.microphoneStream) {
//         throw new Error("Microphone stream not available");
//       }
      
//       this.updateStatus("Initializing Vonage noise suppression...");
      
//       // Create the noise suppression processor
//       this.vonageNoiseProcessor = createVonageNoiseSuppression();
      
//       // Initialize with options
//       await this.vonageNoiseProcessor.init({
//         disableWasmMultiThread: this.vonageNoiseSuppresionOptions.disableWasmMultiThread,
//         assetsDirBaseUrl: this.vonageNoiseSuppresionOptions.assetsDirBaseUrl
//       });
      
//       // Get the connector
//       this.vonageNoiseConnector = await this.vonageNoiseProcessor.getConnector();
      
//       // Apply noise suppression intensity if supported
//       if (this.vonageNoiseConnector && typeof this.vonageNoiseConnector.setIntensity === 'function') {
//         this.vonageNoiseConnector.setIntensity(this.noiseSuppressIntensity);
//       }
      
//       // Process the audio track
//       const processedTrack = await this.vonageNoiseConnector.setTrack(
//         this.microphoneStream.getAudioTracks()[0]
//       );
      
//       // Create a new MediaStream with the processed track
//       this.processedMicrophoneStream = new MediaStream();
//       this.processedMicrophoneStream.addTrack(processedTrack);
      
//       // Replace the original stream with the processed one
//       this.microphoneStream = this.processedMicrophoneStream;
      
//       this.updateStatus("Vonage noise suppression initialized.");
//       console.log("Vonage noise suppression initialized successfully");
//     } catch (error) {
//       console.error("Error initializing Vonage noise suppression:", error);
//       this.handleError(
//         "Failed to initialize Vonage noise suppression: " +
//         (error instanceof Error ? error.message : "Unknown error")
//       );
      
//       // Fall back to original stream and disable Vonage for future processing
//       this.useVonageNoiseSuppression = false;
//       this.updateStatus("Falling back to standard noise suppression.");
//     }
//   }

//   /**
//    * Set noise suppression intensity
//    * @param intensity Value between 0 and 1, where 1 is maximum suppression
//    */
//   public setNoiseSuppressIntensity(intensity: number): void {
//     // Ensure intensity is between 0 and 1
//     this.noiseSuppressIntensity = Math.max(0, Math.min(1, intensity));
    
//     // Apply to Vonage connector if available
//     if (this.vonageNoiseConnector && typeof this.vonageNoiseConnector.setIntensity === 'function') {
//       this.vonageNoiseConnector.setIntensity(this.noiseSuppressIntensity);
//       console.log(`Noise suppression intensity set to ${this.noiseSuppressIntensity}`);
//     }
//   }

//   /**
//    * Get current noise suppression intensity
//    */
//   public getNoiseSuppressIntensity(): number {
//     return this.noiseSuppressIntensity;
//   }

//   /**
//    * Calculate optimal sample rate based on quality setting
//    */
//   private getOptimalSampleRate(): number {
//     switch (this.audioQuality) {
//       case "low":
//         return 8000;
//       case "high":
//         return 44100;
//       case "medium":
//       default:
//         return 16000;
//     }
//   }

//   /**
//    * Get latency hint based on quality settings
//    */
//   private getLatencyHint(): AudioContextLatencyCategory | number {
//     switch (this.audioQuality) {
//       case "low":
//         return "playback";
//       case "high":
//         return "interactive";
//       case "medium":
//       default:
//         return 0.01; // 10ms target latency
//     }
//   }

//   /**
//    * Set up audio analyser for level monitoring
//    */
//   private async setupAudioAnalyser(): Promise<void> {
//     if (!this.audioContext || !this.microphoneStream) return;

//     try {
//       const source = this.audioContext.createMediaStreamSource(
//         this.microphoneStream
//       );
//       this.audioAnalyser = this.audioContext.createAnalyser();

//       // Configure analyzer for optimal performance based on quality settings
//       switch (this.audioQuality) {
//         case "low":
//           this.audioAnalyser.fftSize = 512;
//           this.audioAnalyser.smoothingTimeConstant = 0.9;
//           break;
//         case "high":
//           this.audioAnalyser.fftSize = 2048;
//           this.audioAnalyser.smoothingTimeConstant = 0.7;
//           break;
//         case "medium":
//         default:
//           this.audioAnalyser.fftSize = 1024;
//           this.audioAnalyser.smoothingTimeConstant = 0.8;
//       }

//       source.connect(this.audioAnalyser);
//     } catch (error) {
//       console.error("Error setting up audio analyser:", error);
//       throw error;
//     }
//   }

//   /**
//    * Start monitoring audio levels
//    */
//   private startAudioLevelMonitoring(): void {
//     if (!this.audioAnalyser) return;

//     // Clear any existing interval
//     if (this.audioLevelInterval !== null) {
//       window.clearInterval(this.audioLevelInterval);
//     }

//     const dataArray = new Uint8Array(this.audioAnalyser.frequencyBinCount);

//     this.audioLevelInterval = window.setInterval(() => {
//       if (!this.audioAnalyser) return;

//       // Get current audio level
//       this.audioAnalyser.getByteFrequencyData(dataArray);
//       const average =
//         dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length;
//       this.currentAudioLevel = average / 255; // Normalize to 0-1

//       // Update detection confidence if recording
//       if (this.isRecording && this.detectionConfidence !== null) {
//         // Increase confidence if audio level is high
//         if (this.currentAudioLevel > 0.4) {
//           this.detectionConfidence = Math.min(
//             0.95,
//             this.detectionConfidence + 0.05
//           );
//         }
//       }

//       // Emit event with current level
//       if (this.events.onAudioLevelUpdate) {
//         this.events.onAudioLevelUpdate(this.currentAudioLevel);
//       }
//     }, 100); // Update every 100ms
//   }

//   /**
//    * Begin profiling background noise
//    */
//   private async startNoiseProfiler(): Promise<void> {
//     if (!this.audioAnalyser) return;

//     // Collect noise samples for 2 seconds
//     const noiseProfilingData: number[] = [];
//     const dataArray = new Uint8Array(this.audioAnalyser.frequencyBinCount);

//     return new Promise((resolve) => {
//       const interval = setInterval(() => {
//         if (!this.audioAnalyser) {
//           clearInterval(interval);
//           resolve();
//           return;
//         }

//         this.audioAnalyser.getByteFrequencyData(dataArray);
//         const average =
//           dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length;
//         noiseProfilingData.push(average / 255);
//       }, 100);

//       // After 2 seconds, calculate noise profile
//       setTimeout(() => {
//         clearInterval(interval);
//         this.calculateNoiseProfile(noiseProfilingData);
//         resolve();
//       }, 2000);
//     });
//   }

//   /**
//    * Calculate noise profile from collected samples
//    */
//   private calculateNoiseProfile(noiseProfilingData: number[]): void {
//     if (noiseProfilingData.length === 0) return;

//     const average =
//       noiseProfilingData.reduce((acc, val) => acc + val, 0) /
//       noiseProfilingData.length;
//     const peak = Math.max(...noiseProfilingData);
//     const isNoisy = average > 0.15; // Threshold for "noisy environment"

//     this.noiseProfile = {
//       averageLevel: average,
//       peakLevel: peak,
//       isNoisy
//     };

//     // Adjust VAD sensitivity based on noise profile
//     if (this.adaptiveVAD) {
//       this.adjustVADSensitivity();
//     }

//     console.log("Noise profile calculated:", this.noiseProfile);
//   }

//   /**
//    * Update noise profile with new level data
//    */
//   private updateNoiseProfile(level: number): void {
//     if (!this.noiseProfile) return;

//     // Update with exponential moving average
//     const alpha = 0.1;
//     this.noiseProfile.averageLevel =
//       (1 - alpha) * this.noiseProfile.averageLevel + alpha * level;
//     this.noiseProfile.peakLevel = Math.max(
//       this.noiseProfile.peakLevel * 0.95,
//       level
//     );
//     this.noiseProfile.isNoisy = this.noiseProfile.averageLevel > 0.15;

//     // Update silence threshold if adaptive VAD is enabled
//     if (this.adaptiveVAD && this.vadInstance) {
//       const newThreshold = this.calculateSilenceThreshold();
//       // eslint-disable-next-line @typescript-eslint/no-explicit-any
//       (this.vadInstance as any).silenceThreshold = newThreshold;
//     }
//   }

//   /**
//    * Calculate silence threshold based on noise profile
//    */
//   private calculateSilenceThreshold(): number {
//     if (!this.noiseProfile) return 0.2; // Default value

//     // Adaptive threshold based on noise level
//     return Math.min(0.3, Math.max(0.05, this.noiseProfile.averageLevel * 2.5));
//   }

//   /**
//    * Adjust VAD sensitivity based on noise profile
//    */
//   private adjustVADSensitivity(): void {
//     if (!this.vadInstance || !this.noiseProfile) return;

//     // Custom VAD instance methods may not be in the type definition
//     const vadWithSensitivity = this.vadInstance as unknown as {
//       setSensitivity: (value: number) => void;
//     };

//     if (typeof vadWithSensitivity.setSensitivity === "function") {
//       let sensitivity = this.vadSensitivity;

//       // Adjust based on noise profile
//       if (this.noiseProfile.isNoisy) {
//         // Reduce sensitivity in noisy environments
//         sensitivity = Math.max(0.3, this.vadSensitivity - 0.2);
//       } else {
//         // Increase sensitivity in quiet environments
//         sensitivity = Math.min(0.9, this.vadSensitivity + 0.1);
//       }

//       console.log(
//         `Adjusting VAD sensitivity to ${sensitivity} based on noise profile`
//       );
//       vadWithSensitivity.setSensitivity(sensitivity);
//     }
//   }

//   /**
//    * Start tracking recording duration
//    */
//   private startRecordingDurationTracking(): void {
//     if (this.recordingStartTime === null) return;

//     const updateInterval = setInterval(() => {
//       if (!this.isRecording || this.recordingStartTime === null) {
//         clearInterval(updateInterval);
//         return;
//       }

//       this.recordingDuration = Date.now() - this.recordingStartTime;
//     }, 100);
//   }

//   /**
//    * Start voice detection and listening mode
//    */
//   public async startListening(): Promise<void> {
//     if (!this.isInitialized || !this.vadInstance) {
//       throw new Error("VAD not initialized");
//     }

//     try {
//       this.updateStatus("Starting voice detection...");

//       // Start the VAD
//       await this.vadInstance.start();
//       this.isListening = true;

//       this.updateStatus("Listening for speech...");
//     } catch (err) {
//       console.error("Start listening error:", err);
//       this.handleError(
//         "Failed to start listening: " +
//           (err instanceof Error ? err.message : "Unknown error")
//       );
//       this.updateStatus("Error starting listening");
//       throw err;
//     }
//   }

//   /**
//    * Stop voice detection and listening mode
//    */
//   public async stopListening(): Promise<void> {
//     if (!this.isListening || !this.vadInstance) return;

//     try {
//       // Stop the VAD
//       await this.vadInstance.pause();
//       this.isListening = false;
//       this.isRecording = false;
//       this.recordingDuration = null;

//       if (this.events.onRecordingChange) {
//         this.events.onRecordingChange(false);
//       }

//       this.updateStatus("Listening stopped.");
//     } catch (err) {
//       console.error("Stop listening error:", err);
//       this.handleError(
//         "Failed to stop listening: " +
//           (err instanceof Error ? err.message : "Unknown error")
//       );
//       throw err;
//     }
//   }

//   /**
//    * Adjust VAD sensitivity manually
//    */
//   public setSensitivity(value: number): void {
//     if (!this.vadInstance) return;

//     // Ensure value is between 0 and 1
//     const sensitivity = Math.max(0, Math.min(1, value));

//     // Custom VAD instance methods may not be in the type definition
//     const vadWithSensitivity = this.vadInstance as unknown as {
//       setSensitivity: (value: number) => void;
//     };

//     if (typeof vadWithSensitivity.setSensitivity === "function") {
//       vadWithSensitivity.setSensitivity(sensitivity);
//       console.log(`Manually adjusted VAD sensitivity to ${sensitivity}`);
//     }
//   }

//   /**
//    * Get current audio level (0-1)
//    */
//   public getAudioLevel(): number {
//     return this.currentAudioLevel;
//   }

//   /**
//    * Get current noise profile
//    */
//   public getNoiseProfile(): NoiseProfile | null {
//     return this.noiseProfile;
//   }

//   /**
//    * Handle error and trigger event
//    */
//   private handleError(error: string): void {
//     if (this.events.onError) {
//       this.events.onError(error);
//     }
//   }

//   /**
//    * Update status and trigger event
//    */
//   private updateStatus(status: string): void {
//     if (this.events.onStatusChange) {
//       this.events.onStatusChange(status);
//     }
//   }

//   /**
//    * Convert Float32Array to WAV Blob - Utility method for speech to text
//    */
//   public async float32ArrayToWavBlob(audioData: AudioData): Promise<Blob> {
//     try {
//       // Import WavEncoder dynamically to avoid SSR issues
//       const wavEncoder: typeof WavEncoder = await import("wav-encoder");

//       // Create audio data format suitable for WavEncoder
//       const audioDataForEncoder = {
//         sampleRate: this.getOptimalSampleRate(), // Use the current sample rate
//         channelData: [audioData], // Mono audio
//       };

//       // Encode as WAV
//       const wavBuffer = await wavEncoder.encode(audioDataForEncoder);
//       return new Blob([wavBuffer], { type: "audio/wav" });
//     } catch (error) {
//       console.error("Error converting audio data to WAV:", error);
//       throw error;
//     }
//   }

//   /**
//    * Clean up resources
//    */
//   public dispose(): void {
//     if (this.vadInstance) {
//       try {
//         void this.vadInstance.pause?.();
//       } catch (e) {
//         console.error("Error stopping VAD:", e);
//       }
//     }

//     if (this.audioContext) {
//       try {
//         void this.audioContext.close();
//       } catch (e) {
//         console.error("Error closing audio context:", e);
//       }
//     }

//     // Stop microphone stream
//     if (this.microphoneStream) {
//       try {
//         this.microphoneStream.getTracks().forEach((track) => track.stop());
//       } catch (e) {
//         console.error("Error stopping microphone stream:", e);
//       }
//     }
    
//     // Clean up Vonage resources
//     if (this.vonageNoiseProcessor) {
//       try {
//         // Some cleanup might be needed here depending on the Vonage APIa
//         this.vonageNoiseProcessor = null;
//         this.vonageNoiseConnector = null;
//       } catch (e) {
//         console.error("Error cleaning up Vonage resources:", e);
//       }
//     }

//     // Clear intervals and timeouts
//     if (this.audioLevelInterval !== null) {
//       window.clearInterval(this.audioLevelInterval);
//       this.audioLevelInterval = null;
//     }

//     // Clear buffer
//     this.audioBuffer = [];
//   }
// }