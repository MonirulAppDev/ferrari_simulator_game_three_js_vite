import { useEffect, useRef } from 'react';

export function useCarAudio() {
  const ctxRef = useRef<AudioContext | null>(null);
  
  // Audio Nodes
  const engineNodes = useRef<{ osc: OscillatorNode[], gains: GainNode[], masterGain: GainNode, filter: BiquadFilterNode } | null>(null);
  const screechGain = useRef<GainNode | null>(null);

  const initSynth = () => {
    if (ctxRef.current) return;

    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContext();
      ctxRef.current = ctx;

      const masterCompressor = ctx.createDynamicsCompressor();
      masterCompressor.threshold.value = -10;
      masterCompressor.ratio.value = 10;
      masterCompressor.connect(ctx.destination);

      // --- ENGINE SYNTH (Aggressive V8 Growl) ---
      // We use 4 oscillators to create a complex harmonic profile
      const oscTypes: OscillatorType[] = ['sawtooth', 'square', 'sawtooth', 'triangle'];
      const detunes = [0, 7, -12, 19]; // Harmonics and detuning
      
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 5.0; // High resonance for exhaust pipe acoustics
      
      // Add a Waveshaper for distortion/growl
      const distortion = ctx.createWaveShaper();
      distortion.curve = makeDistortionCurve(50);
      distortion.oversample = '4x';

      const masterEngineGain = ctx.createGain();
      masterEngineGain.gain.value = 0;

      const oscs: OscillatorNode[] = [];
      const gains: GainNode[] = [];

      oscTypes.forEach((type, i) => {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.detune.value = detunes[i];

        const gain = ctx.createGain();
        gain.gain.value = i === 0 ? 0.6 : 0.2; // Fundamental is loudest
        
        osc.connect(gain);
        gain.connect(distortion);
        osc.start();
        
        oscs.push(osc);
        gains.push(gain);
      });

      distortion.connect(filter);
      filter.connect(masterEngineGain);
      masterEngineGain.connect(masterCompressor);

      engineNodes.current = { osc: oscs, gains, filter, masterGain: masterEngineGain };

      // --- TIRE SCREECH ---
      const bufferSize = ctx.sampleRate * 2; 
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
          output[i] = Math.random() * 2 - 1; 
      }

      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = buffer;
      noiseSource.loop = true;

      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.value = 1500;
      noiseFilter.Q.value = 1.0;

      const noiseGain = ctx.createGain();
      noiseGain.gain.value = 0;

      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(masterCompressor);

      noiseSource.start();
      screechGain.current = noiseGain;

    } catch (e) {
      console.warn("Web Audio API not supported", e);
    }
  };

  // Helper function to create a distortion curve
  const makeDistortionCurve = (amount: number) => {
    const k = typeof amount === 'number' ? amount : 50;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  useEffect(() => {
    const handleInteraction = () => {
      initSynth();
      if (ctxRef.current && ctxRef.current.state === 'suspended') {
        ctxRef.current.resume();
      }
    };
    
    window.addEventListener('keydown', handleInteraction, { once: true });
    window.addEventListener('mousedown', handleInteraction, { once: true });
    
    return () => {
      window.removeEventListener('keydown', handleInteraction);
      window.removeEventListener('mousedown', handleInteraction);
      if (ctxRef.current) ctxRef.current.close();
    };
  }, []);

  const triggerShift = () => {
    if (!ctxRef.current || !engineNodes.current) return;
    const now = ctxRef.current.currentTime;
    // Pop effect on shift
    engineNodes.current.filter.frequency.setValueAtTime(200, now);
    engineNodes.current.filter.frequency.exponentialRampToValueAtTime(8000, now + 0.1);
  };

  const triggerCrash = (impactVelocity: number) => {
    if (!ctxRef.current) return;
    const now = ctxRef.current.currentTime;
    
    const osc = ctxRef.current.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(60, now);
    osc.frequency.exponentialRampToValueAtTime(10, now + 0.3);

    const gain = ctxRef.current.createGain();
    gain.gain.setValueAtTime(Math.min(1.0, impactVelocity / 20), now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

    osc.connect(gain);
    gain.connect(ctxRef.current.destination);
    
    osc.start(now);
    osc.stop(now + 0.5);
  };

  const updateEngineSound = (rpm: number, maxRpm: number, throttle: number) => {
    if (!ctxRef.current || !engineNodes.current) return;

    const now = ctxRef.current.currentTime;
    const normalizedRpm = Math.max(0.1, rpm / maxRpm); // Min RPM floor
    
    // Deeper base frequency for V8 sound
    const baseFreq = 30 + (normalizedRpm * 150); 

    engineNodes.current.osc.forEach((osc, i) => {
        // Create chord-like harmonics to simulate multi-cylinder resonance
        const multiplier = [1.0, 1.5, 2.0, 0.5][i]; 
        osc.frequency.setTargetAtTime(baseFreq * multiplier, now, 0.05);
    });

    // Aggressive filter opening based on throttle and RPM
    const targetCutoff = 300 + (throttle * 6000) + (normalizedRpm * 2000);
    engineNodes.current.filter.frequency.setTargetAtTime(targetCutoff, now, 0.05);

    // Filter resonance (Q) tightens under load to make it "scream"
    engineNodes.current.filter.Q.setTargetAtTime(2 + (throttle * 5), now, 0.1);

    // Dynamic Volume
    const targetGain = 0.1 + (throttle * 0.4) + (normalizedRpm * 0.3);
    engineNodes.current.masterGain.gain.setTargetAtTime(targetGain, now, 0.05);
  };

  const updateScreech = (slipAmount: number) => {
    if (!ctxRef.current || !screechGain.current) return;
    const now = ctxRef.current.currentTime;
    screechGain.current.gain.setTargetAtTime(Math.min(0.4, slipAmount * 0.4), now, 0.1);
  };

  const updateNitro = () => {};

  return { updateEngineSound, triggerShift, triggerCrash, updateScreech, updateNitro };
}
