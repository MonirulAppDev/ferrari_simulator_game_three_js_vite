import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Global environment state for other components to read (like streetlights)
export const environmentState = {
  time: 12, // Start at noon
  isNight: false,
}

// Custom 3-hour day/night cycle
const REAL_SECONDS_PER_DAY = 3 * 3600 // 3 hours
const GAME_HOURS_PER_REAL_SECOND = 24 / REAL_SECONDS_PER_DAY

// Color palettes for different times of day
const colors = {
  midnightSky: new THREE.Color('#020617'),
  midnightFog: new THREE.Color('#020617'),
  dawnSky: new THREE.Color('#f472b6'), // Pinkish dawn
  dawnFog: new THREE.Color('#fb923c'), // Orange fog
  daySky: new THREE.Color('#87CEEB'),
  dayFog: new THREE.Color('#87CEEB'),
  duskSky: new THREE.Color('#f97316'), // Orange/red dusk
  duskFog: new THREE.Color('#ea580c'),
}

export function DayNightCycle() {
  const skyColor = useRef(new THREE.Color())
  const fogColor = useRef(new THREE.Color())
  const dirLightRef = useRef<THREE.DirectionalLight>(null)
  const ambientLightRef = useRef<THREE.AmbientLight>(null)

  useFrame((state, delta) => {
    // Update time
    // For testing, you could multiply delta by a large number like 1000 to see the cycle quickly
    environmentState.time = (environmentState.time + delta * GAME_HOURS_PER_REAL_SECOND * 100) % 24
    const t = environmentState.time
    
    environmentState.isNight = t < 5 || t > 19

    // Interpolate colors based on time
    let lerpFactor = 0
    let startSky = colors.midnightSky
    let endSky = colors.dawnSky
    let startFog = colors.midnightFog
    let endFog = colors.dawnFog
    let sunIntensity = 0
    let ambientIntensity = 0.2

    if (t >= 0 && t < 4) {
      // Midnight
      startSky = endSky = colors.midnightSky
      startFog = endFog = colors.midnightFog
      sunIntensity = 0
      ambientIntensity = 0.5 // Moon light
    } else if (t >= 4 && t < 6) {
      // Dawn transition
      lerpFactor = (t - 4) / 2
      startSky = colors.midnightSky; endSky = colors.dawnSky
      startFog = colors.midnightFog; endFog = colors.dawnFog
      sunIntensity = lerpFactor * 1.5
      ambientIntensity = 0.5 + lerpFactor * 0.5
    } else if (t >= 6 && t < 8) {
      // Morning transition
      lerpFactor = (t - 6) / 2
      startSky = colors.dawnSky; endSky = colors.daySky
      startFog = colors.dawnFog; endFog = colors.dayFog
      sunIntensity = 1.5 + lerpFactor * 1.0 // peaks at 2.5
      ambientIntensity = 1.0 + lerpFactor * 0.5 // peaks at 1.5
    } else if (t >= 8 && t < 17) {
      // Day
      startSky = endSky = colors.daySky
      startFog = endFog = colors.dayFog
      sunIntensity = 2.5
      ambientIntensity = 1.5
    } else if (t >= 17 && t < 19) {
      // Dusk transition
      lerpFactor = (t - 17) / 2
      startSky = colors.daySky; endSky = colors.duskSky
      startFog = colors.dayFog; endFog = colors.duskFog
      sunIntensity = 2.5 - lerpFactor * 1.5
      ambientIntensity = 1.5 - lerpFactor * 0.5
    } else if (t >= 19 && t < 21) {
      // Night transition
      lerpFactor = (t - 19) / 2
      startSky = colors.duskSky; endSky = colors.midnightSky
      startFog = colors.duskFog; endFog = colors.midnightFog
      sunIntensity = 1.0 - lerpFactor * 1.0
      ambientIntensity = 1.0 - lerpFactor * 0.5
    } else {
      // Night
      startSky = endSky = colors.midnightSky
      startFog = endFog = colors.midnightFog
      sunIntensity = 0
      ambientIntensity = 0.5
    }

    skyColor.current.lerpColors(startSky, endSky, lerpFactor)
    fogColor.current.lerpColors(startFog, endFog, lerpFactor)

    state.scene.background = skyColor.current
    if (state.scene.fog) {
      state.scene.fog.color.copy(fogColor.current)
    }

    // Move sun across the sky
    if (dirLightRef.current) {
      // Sun angle from 0 (east) at 6am to PI (west) at 18pm
      const sunAngle = ((t - 6) / 12) * Math.PI
      const sunY = Math.sin(sunAngle) * 100
      const sunX = Math.cos(sunAngle) * 100
      
      dirLightRef.current.position.set(sunX, Math.max(-10, sunY), -100)
      dirLightRef.current.intensity = sunIntensity
      
      // Warm color at dusk/dawn, white at noon
      if (t < 8 || t > 16) {
        dirLightRef.current.color.set('#ffed4a') // Golden hour
      } else {
        dirLightRef.current.color.set('#ffffff') // Noon
      }
    }

    if (ambientLightRef.current) {
      ambientLightRef.current.intensity = ambientIntensity
      // Moon is slightly blue, sun is white
      if (environmentState.isNight) {
        ambientLightRef.current.color.set('#3b82f6')
      } else {
        ambientLightRef.current.color.set('#ffffff')
      }
    }
  })

  return (
    <>
      <fog attach="fog" args={['#87CEEB', 20, 500]} />
      <ambientLight ref={ambientLightRef} intensity={1.5} />
      <directionalLight 
        ref={dirLightRef}
        position={[100, 100, -100]} 
        intensity={2.5} 
        castShadow 
        shadow-mapSize={[2048, 2048]} 
        shadow-camera-left={-200}
        shadow-camera-right={200}
        shadow-camera-top={200}
        shadow-camera-bottom={-200}
        shadow-camera-near={0.1}
        shadow-camera-far={1000}
      />
    </>
  )
}
