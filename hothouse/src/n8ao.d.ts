declare module 'n8ao' {
  import type { Camera, Color, Scene } from 'three';
  import { Pass } from 'postprocessing';
  export class N8AOPostPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    configuration: {
      aoSamples: number; denoiseSamples: number; denoiseRadius: number; aoRadius: number;
      distanceFalloff: number; intensity: number; color: Color; halfRes: boolean; depthAwareUpsampling: boolean;
      screenSpaceRadius: boolean; renderMode: number; gammaCorrection: boolean; transparencyAware: boolean;
      biasOffset: number; biasMultiplier: number; aoTones: number; accumulate: boolean; autoRenderBeauty?: boolean;
    };
    setQualityMode(mode: 'Performance' | 'Low' | 'Medium' | 'High' | 'Ultra'): void;
    setDisplayMode(mode: 'Combined' | 'AO' | 'No AO' | 'Split' | 'Split AO'): void;
    setSize(width: number, height: number): void;
    enableDebugMode(): void;
    lastTime: number;
  }
}
