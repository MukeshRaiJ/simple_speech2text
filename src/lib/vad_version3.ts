"use client";

import type WavEncoder from "wav-encoder";
import { createVonageNoiseSuppression } from "@vonage/noise-suppression";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AudioData extends Float32Array {}

export interface MicVAD {
  new: (options: MicVADOptions) => Promise<MicVADInstance>;
}

export interface MicVADOptions {
  onSpeechStart?: () => void;
  onSpeechEnd?: (audio: AudioData) => void;
  onError?: (error: Error) => void;
  onBackgroundNoiseLevel?: (level: number) => void;
  vadThreshold?: number;
  silenceThreshold?: number;
  minSilenceDuration?: number;
  stream?: MediaStream;
  audioContext?: AudioContext;
}

export interface MicVADInstance {
  start: () => Promise<void>;
  pause: () => Promise<void>;
  setSensitivity?: (threshold: number) => void;
  getAudioLevel?: () => number;
}

export enum AudioQuality {
  Low = "low",
  Medium = "medium",
  High = "high",
}

export interface AudioProcessingOptions {
  autoGainControl?: boolean;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  vadSensitivity?: number;
  silenceDetectionTimeout?: number;
  adaptiveVAD?: boolean;
  audioQuality?: AudioQuality;
  useVonageNoiseSuppression?: boolean;
  vonageNoiseSuppresionOptions?: VonageNoiseSuppressionOptions;
  noiseSuppressIntensity?: number;
}

export interface VonageNoiseSuppressionOptions {
  disableWasmMultiThread?: boolean;
  assetsDirBaseUrl?: string;
}

interface VonageNoiseConnector {
  setTrack: (track: MediaStreamAudioTrack) => Promise<MediaStreamAudioTrack>;
  setIntensity?: (intensity: number) => void;
  destroy?: () => Promise<void> | void;
}

interface VonageNoiseProcessor {
  init: (options: VonageNoiseSuppressionOptions) => Promise<void>;
  getConnector: () => Promise<VonageNoiseConnector>;
  destroy?: () => Promise<void> | void;
}

export interface VADEvents {
  onStatusChange?: (status: string) => void;
  onError?: (error: string, type?: 'initialization' | 'runtime' | 'vad' | 'noiseSuppression') => void;
  onAudioCaptured?: (audio: AudioData) => void;
  onRecordingChange?: (isRecording: boolean) => void;
  onAudioLevelUpdate?: (level: number) => void;
  onNoiseProfileUpdate?: (profile: NoiseProfile) => void;
}

export interface NoiseProfile {
  averageLevel: number;
  peakLevel: number;
  isNoisy: boolean;
}

/**
 * Enhanced VADManager - Core Voice Activity Detection Manager
 */
export class VADManager {
  private readonly autoGainControl: boolean;
  private readonly echoCancellation: boolean;
  private readonly noiseSuppression: boolean;
  private vadSensitivity: number;
  private readonly silenceDetectionTimeout: number;
  private readonly adaptiveVAD: boolean;
  private readonly audioQuality: AudioQuality;
  private useVonageNoiseSuppression: boolean;
  private readonly vonageNoiseSuppresionOptions: VonageNoiseSuppressionOptions;
  private noiseSuppressIntensity: number;

  private isInitialized = false;
  private isInitializing = false;
  private isListening = false;
  private isRecording = false;
  private currentAudioLevel = 0;
  private noiseProfile: NoiseProfile | null = null;
  private recordingStartTime: number | null = null;
  private sessionId: string;

  private audioContext: AudioContext | null = null;
  private microphoneStream: MediaStream | null = null;
  private processedMicrophoneStream: MediaStream | null = null;
  private microphoneSourceNode: MediaStreamAudioSourceNode | null = null;
  private audioAnalyser: AnalyserNode | null = null;
  private vadInstance: MicVADInstance | null = null;

  private audioLevelIntervalId: number | null = null;
  private recordingDurationIntervalId: number | null = null;
  private noiseProfilerIntervalId: number | null = null;
  private noiseProfilerTimeoutId: number | null = null;

  private vonageNoiseProcessor: VonageNoiseProcessor | null = null;
  private vonageNoiseConnector: VonageNoiseConnector | null = null;

  private events: VADEvents;

  constructor(options?: AudioProcessingOptions, events?: VADEvents) {
    this.autoGainControl = options?.autoGainControl ?? true;
    this.echoCancellation = options?.echoCancellation ?? true;
    this.noiseSuppression = options?.noiseSuppression ?? false;
    this.vadSensitivity = options?.vadSensitivity ?? 0.75;
    this.silenceDetectionTimeout = options?.silenceDetectionTimeout ?? 1500;
    this.adaptiveVAD = options?.adaptiveVAD ?? true;
    this.audioQuality = options?.audioQuality ?? AudioQuality.Medium;

    this.useVonageNoiseSuppression = options?.useVonageNoiseSuppression ?? true;
    this.vonageNoiseSuppresionOptions = options?.vonageNoiseSuppresionOptions ?? {
      disableWasmMultiThread: false
    };
    this.noiseSuppressIntensity = options?.noiseSuppressIntensity ?? 0.7;

    this.sessionId = this.generateUniqueId();
    this.events = events ?? {};

    this.vadSensitivity = Math.max(0, Math.min(1, this.vadSensitivity));
    this.noiseSuppressIntensity = Math.max(0, Math.min(1, this.noiseSuppressIntensity));
  }

  private generateUniqueId(): string {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
        return window.crypto.randomUUID();
    } else {
        return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
    }
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized || this.isInitializing) {
        console.warn("VADManager already initialized or initializing.");
        return;
    }
    this.isInitializing = true;
    this.updateStatus("Initializing voice detector...");

    try {
      // Use proper type assertion for browser compatibility with webkit prefix
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass({
        sampleRate: this.getOptimalSampleRate(),
        latencyHint: this.getLatencyHint(),
      });
      
      if (this.audioContext.state === 'suspended') {
          await this.audioContext.resume();
      }

      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: this.echoCancellation,
          autoGainControl: this.autoGainControl,
          noiseSuppression: this.noiseSuppression,
          sampleRate: this.getOptimalSampleRate(),
          channelCount: 1,
        },
        video: false,
      };
      
      try {
        this.microphoneStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (getUserMediaError) {
          if (getUserMediaError instanceof DOMException) {
            if (getUserMediaError.name === 'NotAllowedError') {
                throw new Error("Microphone permission denied. Please allow microphone access in your browser settings.");
            } else if (getUserMediaError.name === 'NotFoundError') {
                throw new Error("No microphone found. Please ensure a microphone is connected and enabled.");
            } else {
                throw new Error(`Error accessing microphone: ${getUserMediaError.message} (${getUserMediaError.name})`);
            }
          } else {
              throw new Error(`An unexpected error occurred while accessing the microphone: ${getUserMediaError}`);
          }
      }

      let streamToProcess = this.microphoneStream;
      if (this.useVonageNoiseSuppression && this.microphoneStream) {
        streamToProcess = await this.initializeVonageNoiseSuppression(this.microphoneStream);
      }
      this.processedMicrophoneStream = streamToProcess;

      if (!this.processedMicrophoneStream) {
           throw new Error("Failed to obtain a valid audio stream for processing.");
      }

      this.microphoneSourceNode = this.audioContext.createMediaStreamSource(this.processedMicrophoneStream);
      this.audioAnalyser = this.audioContext.createAnalyser();
      this.configureAudioAnalyser();
      this.microphoneSourceNode.connect(this.audioAnalyser);

      await this.startNoiseProfiler();

      const { MicVAD } = (await import("@ricky0123/vad-web")) as unknown as {
        MicVAD: MicVAD;
      };

      this.vadInstance = await MicVAD.new({
        stream: this.processedMicrophoneStream,
        audioContext: this.audioContext,
        vadThreshold: this.vadSensitivity,
        minSilenceDuration: this.silenceDetectionTimeout,
        silenceThreshold: this.calculateSilenceThreshold(),
        onSpeechStart: this.handleSpeechStart,
        onSpeechEnd: this.handleSpeechEnd,
        onError: this.handleVadError,
        onBackgroundNoiseLevel: this.handleBackgroundNoiseUpdate,
      });

      this.startAudioLevelMonitoring();

      this.isInitialized = true;
      this.updateStatus("VAD ready. Click microphone to start.");

    } catch (err) {
      console.error("VAD initialization failed:", err);
      const errorMessage = err instanceof Error ? err.message : "Unknown initialization error.";
      this.handleError(errorMessage, 'initialization');
      this.updateStatus(`Error: ${errorMessage}`);
      await this.dispose();
      throw err;
    } finally {
        this.isInitializing = false;
    }
  }

  private async initializeVonageNoiseSuppression(originalStream: MediaStream): Promise<MediaStream> {
      this.updateStatus("Initializing Vonage noise suppression...");
      try {
          this.vonageNoiseProcessor = createVonageNoiseSuppression();
          await this.vonageNoiseProcessor.init(this.vonageNoiseSuppresionOptions);
          this.vonageNoiseConnector = await this.vonageNoiseProcessor.getConnector();

          if (this.vonageNoiseConnector?.setIntensity) {
              this.vonageNoiseConnector.setIntensity(this.noiseSuppressIntensity);
          }

          const originalTrack = originalStream.getAudioTracks()[0];
          const processedTrack = await this.vonageNoiseConnector.setTrack(originalTrack);

          const processedStream = new MediaStream([processedTrack]);
          this.updateStatus("Vonage noise suppression active.");
          console.log("Vonage noise suppression initialized successfully.");
          return processedStream;

      } catch (error) {
          console.error("Vonage noise suppression initialization failed:", error);
          const message = error instanceof Error ? error.message : "Unknown Vonage NS error";
          this.handleError(`Failed to initialize Vonage NS: ${message}`, 'noiseSuppression');
          this.updateStatus("Vonage NS failed. Using original audio.");
          this.useVonageNoiseSuppression = false;
          this.vonageNoiseProcessor = null;
          this.vonageNoiseConnector = null;
          return originalStream;
      }
  }

  private handleSpeechStart = (): void => {
    console.log("Speech detected");
    this.isRecording = true;
    this.recordingStartTime = Date.now();
    this.updateStatus("Recording speech...");
    this.startRecordingDurationTracking();
    this.events.onRecordingChange?.(true);
  };

  private handleSpeechEnd = (audio: AudioData): void => {
    const duration = this.recordingStartTime ? (Date.now() - this.recordingStartTime) / 1000 : 0;
    console.log(`Speech ended. Duration: ${duration.toFixed(2)}s`);
    this.isRecording = false;
    this.stopRecordingDurationTracking();
    this.recordingStartTime = null;

    this.events.onRecordingChange?.(false);
    this.events.onAudioCaptured?.(audio);

    if(this.isListening) {
        this.updateStatus("Listening for speech...");
    }
  };

  private handleVadError = (error: Error): void => {
    console.error("VAD runtime error:", error);
    this.handleError("VAD error: " + (error.message || "Unknown VAD error"), 'vad');
  };

  private handleBackgroundNoiseUpdate = (level: number): void => {
    if (this.adaptiveVAD) {
      this.updateNoiseProfile(level);
    }
  };

  public setNoiseSuppressIntensity(intensity: number): void {
    this.noiseSuppressIntensity = Math.max(0, Math.min(1, intensity));
    if (this.useVonageNoiseSuppression && this.vonageNoiseConnector?.setIntensity) {
      try {
        this.vonageNoiseConnector.setIntensity(this.noiseSuppressIntensity);
        console.log(`Vonage NS intensity set to ${this.noiseSuppressIntensity}`);
      } catch (e) {
          console.error("Failed to set Vonage NS intensity:", e);
      }
    }
  }

  public getNoiseSuppressIntensity(): number {
    return this.noiseSuppressIntensity;
  }

  private getOptimalSampleRate(): number {
    switch (this.audioQuality) {
      case AudioQuality.Low: return 8000;
      case AudioQuality.High: return 44100;
      case AudioQuality.Medium:
      default: return 16000;
    }
  }

  private getLatencyHint(): AudioContextLatencyCategory | number {
    switch (this.audioQuality) {
      case AudioQuality.Low: return "playback";
      case AudioQuality.High: return "interactive";
      case AudioQuality.Medium:
      default: return 0.02;
    }
  }

  private configureAudioAnalyser(): void {
      if (!this.audioAnalyser) return;
      switch (this.audioQuality) {
        case AudioQuality.Low:
          this.audioAnalyser.fftSize = 512;
          this.audioAnalyser.smoothingTimeConstant = 0.9;
          break;
        case AudioQuality.High:
          this.audioAnalyser.fftSize = 2048;
          this.audioAnalyser.smoothingTimeConstant = 0.7;
          break;
        case AudioQuality.Medium:
        default:
          this.audioAnalyser.fftSize = 1024;
          this.audioAnalyser.smoothingTimeConstant = 0.8;
      }
  }

  private startAudioLevelMonitoring(): void {
    if (!this.audioAnalyser || this.audioLevelIntervalId !== null) return;

    const dataArray = new Uint8Array(this.audioAnalyser.frequencyBinCount);
    const updateInterval = 100;

    this.audioLevelIntervalId = window.setInterval(() => {
      if (!this.audioAnalyser) {
          this.stopAudioLevelMonitoring();
          return;
      }
      try {
        this.audioAnalyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for(let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        this.currentAudioLevel = average / 255;

        this.events.onAudioLevelUpdate?.(this.currentAudioLevel);

      } catch (error) {
          console.error("Error getting audio level:", error);
          this.stopAudioLevelMonitoring();
          this.handleError("Audio level monitoring failed.", 'runtime');
      }
    }, updateInterval);
  }

  private stopAudioLevelMonitoring(): void {
      if (this.audioLevelIntervalId !== null) {
          window.clearInterval(this.audioLevelIntervalId);
          this.audioLevelIntervalId = null;
      }
  }

  private async startNoiseProfiler(): Promise<void> {
    if (!this.audioAnalyser || this.noiseProfilerIntervalId !== null) return Promise.resolve();
    this.updateStatus("Profiling background noise...");

    const noiseProfilingData: number[] = [];
    const dataArray = new Uint8Array(this.audioAnalyser.frequencyBinCount);
    const profilingDuration = 2000;
    const sampleInterval = 100;

    return new Promise((resolve) => {
        this.noiseProfilerIntervalId = window.setInterval(() => {
            if (!this.audioAnalyser) {
                this.stopNoiseProfiler();
                resolve();
                return;
            }
            try {
                this.audioAnalyser.getByteFrequencyData(dataArray);
                const average = dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length;
                noiseProfilingData.push(average / 255);
            } catch(e) {
                console.error("Error sampling noise level:", e);
            }
        }, sampleInterval);

        this.noiseProfilerTimeoutId = window.setTimeout(() => {
            this.stopNoiseProfilerInterval();
            this.calculateNoiseProfile(noiseProfilingData);
            if (this.isListening) {
                this.updateStatus("Listening for speech...");
            } else if (this.isInitialized && !this.isListening) {
                 this.updateStatus("VAD ready. Click microphone to start.");
            }
            resolve();
        }, profilingDuration);
    });
  }

  private stopNoiseProfilerInterval(): void {
       if (this.noiseProfilerIntervalId !== null) {
           clearInterval(this.noiseProfilerIntervalId);
           this.noiseProfilerIntervalId = null;
       }
  }

  private stopNoiseProfiler(): void {
       this.stopNoiseProfilerInterval();
       if (this.noiseProfilerTimeoutId !== null) {
           clearTimeout(this.noiseProfilerTimeoutId);
           this.noiseProfilerTimeoutId = null;
       }
  }

  private calculateNoiseProfile(noiseData: number[]): void {
    if (noiseData.length === 0) {
        console.warn("No noise data collected for profiling.");
        this.noiseProfile = { averageLevel: 0.1, peakLevel: 0.2, isNoisy: false };
        this.events.onNoiseProfileUpdate?.(this.noiseProfile);
        return;
    }

    const sum = noiseData.reduce((acc, val) => acc + val, 0);
    const average = sum / noiseData.length;
    const peak = Math.max(...noiseData);
    const noiseThreshold = 0.15;
    const isNoisy = average > noiseThreshold;

    this.noiseProfile = { averageLevel: average, peakLevel: peak, isNoisy };
    console.log("Noise profile calculated:", this.noiseProfile);
    this.events.onNoiseProfileUpdate?.(this.noiseProfile);

    if (this.adaptiveVAD) {
        this.adjustVADParameters();
    }
  }

  private updateNoiseProfile(level: number): void {
    if (!this.noiseProfile) {
        this.noiseProfile = { averageLevel: level, peakLevel: level, isNoisy: level > 0.15 };
        this.events.onNoiseProfileUpdate?.(this.noiseProfile);
        return;
    }

    const alpha = 0.1;
    this.noiseProfile.averageLevel = (1 - alpha) * this.noiseProfile.averageLevel + alpha * level;
    this.noiseProfile.peakLevel = Math.max(this.noiseProfile.peakLevel * 0.99, level);
    this.noiseProfile.isNoisy = this.noiseProfile.averageLevel > 0.15;

    this.events.onNoiseProfileUpdate?.(this.noiseProfile);

    if (this.adaptiveVAD) {
        this.adjustVADParameters();
    }
  }

  private calculateSilenceThreshold(): number {
    const defaultThreshold = 0.2;
    if (!this.noiseProfile) return defaultThreshold;

    const baseThreshold = 0.05;
    const noiseFactor = 2.0;
    const maxThreshold = 0.35;

    const calculated = baseThreshold + (this.noiseProfile.averageLevel * noiseFactor);
    return Math.min(maxThreshold, Math.max(baseThreshold, calculated));
  }

  private adjustVADParameters(): void {
    if (!this.vadInstance || !this.noiseProfile) return;

    const newSilenceThreshold = this.calculateSilenceThreshold();
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.vadInstance as any).silenceThreshold = newSilenceThreshold;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
        // Some VAD libraries might not allow dynamic threshold changes
    }

    if ('setSensitivity' in this.vadInstance && typeof this.vadInstance.setSensitivity === 'function') {
        let newSensitivity = this.vadSensitivity;

        const noisySensitivityFactor = 0.15;
        const quietSensitivityFactor = 0.1;
        const minSensitivity = 0.3;
        const maxSensitivity = 0.9;

        if (this.noiseProfile.isNoisy) {
            newSensitivity = Math.max(minSensitivity, this.vadSensitivity - noisySensitivityFactor);
        } else {
            newSensitivity = Math.min(maxSensitivity, this.vadSensitivity + quietSensitivityFactor);
        }

        try {
            this.vadInstance.setSensitivity(newSensitivity);
        } catch (e) {
            console.warn("Could not dynamically set VAD sensitivity:", e);
        }
    }
  }

  private startRecordingDurationTracking(): void {
    this.stopRecordingDurationTracking();
    if (this.recordingStartTime === null) return;

    const updateInterval = 100;
    this.recordingDurationIntervalId = window.setInterval(() => {
      if (!this.isRecording || this.recordingStartTime === null) {
        this.stopRecordingDurationTracking();
        return;
      }
    }, updateInterval);
  }

  private stopRecordingDurationTracking(): void {
       if (this.recordingDurationIntervalId !== null) {
           window.clearInterval(this.recordingDurationIntervalId);
           this.recordingDurationIntervalId = null;
       }
   }

  public async startListening(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error("VADManager not initialized. Call initialize() first.");
    }
    if (this.isListening) {
      console.warn("Already listening.");
      return;
    }
    if (!this.vadInstance) {
        throw new Error("VAD instance is not available.");
    }

    try {
      if (this.audioContext && this.audioContext.state === 'suspended') {
          await this.audioContext.resume();
      }

      this.updateStatus("Starting voice detection...");
      await this.vadInstance.start();
      this.isListening = true;
      this.updateStatus("Listening for speech...");
    } catch (err) {
      console.error("Failed to start listening:", err);
      const message = err instanceof Error ? err.message : "Unknown start listening error";
      this.handleError(`Failed to start listening: ${message}`, 'runtime');
      this.updateStatus(`Error: ${message}`);
      this.isListening = false;
      throw err;
    }
  }

  public async stopListening(): Promise<void> {
    if (!this.isInitialized || !this.isListening) {
        return;
    }
    if (!this.vadInstance) {
        console.warn("stopListening called, but VAD instance is missing.");
        return;
    }

    this.updateStatus("Stopping voice detection...");
    try {
      await this.vadInstance.pause();
      this.isListening = false;
      if (this.isRecording) {
          this.isRecording = false;
          this.stopRecordingDurationTracking();
          this.recordingStartTime = null;
          this.events.onRecordingChange?.(false);
      }
      this.updateStatus("Listening stopped.");
    } catch (err) {
      console.error("Failed to stop listening:", err);
      const message = err instanceof Error ? err.message : "Unknown stop listening error";
      this.handleError(`Failed to stop listening: ${message}`, 'runtime');
      this.updateStatus(`Error stopping: ${message}`);
    }
  }

  public setBaseSensitivity(value: number): void {
    if (!this.isInitialized) {
        console.warn("Cannot set sensitivity: VADManager not initialized.");
        return;
    }
    this.vadSensitivity = Math.max(0, Math.min(1, value));
    console.log(`Base VAD sensitivity manually set to ${this.vadSensitivity}`);
    if (this.adaptiveVAD) {
        this.adjustVADParameters();
    } else if (this.vadInstance && 'setSensitivity' in this.vadInstance && typeof this.vadInstance.setSensitivity === 'function') {
         try {
            this.vadInstance.setSensitivity(this.vadSensitivity);
         } catch (e) {
             console.warn("Could not manually set VAD sensitivity:", e);
         }
    }
  }

  public getAudioLevel(): number {
    return this.currentAudioLevel;
  }

  public getNoiseProfile(): NoiseProfile | null {
    return this.noiseProfile ? { ...this.noiseProfile } : null;
  }

  private handleError(error: string, type: 'initialization' | 'runtime' | 'vad' | 'noiseSuppression' = 'runtime'): void {
    console.error(`VADManager Error (${type}):`, error);
    this.events.onError?.(error, type);
  }

  private updateStatus(status: string): void {
    console.log("VADManager Status:", status);
    this.events.onStatusChange?.(status);
  }

  public async float32ArrayToWavBlob(audioData: AudioData): Promise<Blob> {
    try {
      const wavEncoder: typeof WavEncoder = await import("wav-encoder");
      const sampleRate = this.getOptimalSampleRate();

      const audioDataForEncoder = {
        sampleRate: sampleRate,
        channelData: [audioData],
      };

      const wavBuffer = await wavEncoder.encode(audioDataForEncoder);
      return new Blob([wavBuffer], { type: "audio/wav" });
    } catch (error) {
      console.error("Error converting audio data to WAV:", error);
      this.handleError("Failed to encode audio to WAV", 'runtime');
      throw error;
    }
  }

  public async dispose(): Promise<void> {
    console.log("Disposing VADManager...");
    this.isInitialized = false;
    this.isListening = false;
    this.isRecording = false;

    if (this.vadInstance) {
        try {
            await this.vadInstance.pause();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (typeof (this.vadInstance as any).destroy === 'function') {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (this.vadInstance as any).destroy();
            }
        } catch (e) {
            console.error("Error stopping/destroying VAD instance:", e);
        }
        this.vadInstance = null;
    }

    this.stopAudioLevelMonitoring();
    this.stopRecordingDurationTracking();
    this.stopNoiseProfiler();

    if (this.vonageNoiseConnector) {
        try {
            if (typeof this.vonageNoiseConnector.destroy === 'function') {
                await this.vonageNoiseConnector.destroy();
            }
        } catch(e) {
            console.error("Error destroying Vonage connector:", e);
        }
        this.vonageNoiseConnector = null;
    }
    
    if (this.vonageNoiseProcessor) {
        try {
            if (typeof this.vonageNoiseProcessor.destroy === 'function') {
                await this.vonageNoiseProcessor.destroy();
            }
        } catch(e) {
            console.error("Error destroying Vonage processor:", e);
        }
        this.vonageNoiseProcessor = null;
    }

    if (this.microphoneSourceNode) {
        try {
            this.microphoneSourceNode.disconnect();
        } catch(e) {
            console.error("Error disconnecting microphone source node:", e);
        }
        this.microphoneSourceNode = null;
    }
    
    if (this.audioAnalyser) {
        try {
            this.audioAnalyser.disconnect();
        } catch(e) {
            console.error("Error disconnecting analyser node:", e);
        }
        this.audioAnalyser = null;
    }

    const stopTrack = (track: MediaStreamTrack) => {
        if (track && track.readyState === 'live') {
            track.stop();
        }
    };
    
    this.microphoneStream?.getTracks().forEach(stopTrack);
    this.processedMicrophoneStream?.getTracks().forEach(stopTrack);
    this.microphoneStream = null;
    this.processedMicrophoneStream = null;

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        await this.audioContext.close();
      } catch (e) {
        console.error("Error closing AudioContext:", e);
      }
    }
    this.audioContext = null;

    this.noiseProfile = null;
    this.currentAudioLevel = 0;
    this.recordingStartTime = null;

    console.log("VADManager disposed.");
    this.updateStatus("VAD Manager stopped.");
  }

  public get isManagerInitialized(): boolean {
      return this.isInitialized;
  }
  
  public get isManagerListening(): boolean {
      return this.isListening;
  }
  
  public get isManagerRecording(): boolean {
      return this.isRecording;
  }
  
  public getSessionId(): string {
    return this.sessionId;
  }
  
  public getCurrentAudioQuality(): AudioQuality {
    return this.audioQuality;
  }
  
  public isVonageNoiseSuppressionActive(): boolean {
    return this.useVonageNoiseSuppression && this.vonageNoiseConnector !== null;
  }
  
  public getRecordingDuration(): number {
    if (!this.isRecording || this.recordingStartTime === null) {
      return 0;
    }
    return (Date.now() - this.recordingStartTime) / 1000;
  }
  
  public toggleVonageNoiseSuppression(enable: boolean): Promise<void> {
    if (enable === this.useVonageNoiseSuppression) {
      return Promise.resolve();
    }
    
    if (!this.isInitialized) {
      this.useVonageNoiseSuppression = enable;
      return Promise.resolve();
    }
    
    return this.reinitializeWithUpdatedSettings({ useVonageNoiseSuppression: enable });
  }
  
  private async reinitializeWithUpdatedSettings(updatedOptions: Partial<AudioProcessingOptions>): Promise<void> {
    if (!this.isInitialized) {
      throw new Error("Cannot update settings: VADManager not initialized.");
    }
    
    const wasListening = this.isListening;
    
    // Update instance properties with new settings
    Object.keys(updatedOptions).forEach(key => {
      const typedKey = key as keyof AudioProcessingOptions;
      if (typedKey in this) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this as any)[typedKey] = updatedOptions[typedKey];
      }
    });
    
    // Stop and dispose current resources
    await this.dispose();
    
    // Reinitialize with new settings
    await this.initialize();
    
    // Restore listening state if needed
    if (wasListening) {
      await this.startListening();
    }
  }
}