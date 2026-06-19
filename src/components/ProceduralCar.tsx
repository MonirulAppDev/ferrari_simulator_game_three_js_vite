import { PerspectiveCamera, useGLTF, useKeyboardControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RapierRigidBody, RigidBody } from '@react-three/rapier'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { useCarAudio } from '../hooks/useCarAudio'
import { SmokeParticles } from './SmokeParticles'

interface ProceduralCarProps {
  color?: string;
  cameraView?: 'BACK' | 'BACK_UP' | 'SIDE' | 'FRONT';
}

export function ProceduralCar({ color = '#ef4444', cameraView = 'BACK' }: ProceduralCarProps) {
  const rb = useRef<RapierRigidBody>(null)
  const chassisRef = useRef<THREE.Group>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera>(null)
  const { scene } = useGLTF('/ferrari.glb')
  const audio = useCarAudio()

  const cameraTargetLocal = useRef(new THREE.Vector3(0, 1.0, 0))
  const cameraDriftOffsetRef = useRef(0)
  const wheels = useRef<THREE.Object3D[]>([])
  const frontWheels = useRef<THREE.Object3D[]>([])
  const taillightMats = useRef<THREE.MeshStandardMaterial[]>([])
  const headlightMats = useRef<THREE.MeshStandardMaterial[]>([])

  const gearbox = useRef({
    gear: 1, // -1 = R, 0 = N, 1-6 = Forward
    rpm: 1000,
    ratios: { '-1': 560, '0': 0, '1': 560, '2': 280, '3': 180, '4': 132, '5': 105, '6': 90 },
    idleRpm: 1000,
    maxRpm: 8000,
    shiftUpRpm: 6800,
    shiftDownRpm: 3500
  })

  const nitroState = useRef({ amount: 100 })
  const lightsState = useRef({
    headlights: false,
    leftInd: false,
    rightInd: false,
    hazard: false,
    blinkTimer: 0
  })
  const smokeState = useRef({ active: false })
  const lastKeys = useRef<{ [key: string]: boolean }>({})

  const headlightRefs = useRef<THREE.SpotLight[]>([])
  const leftIndRefs = useRef<THREE.PointLight[]>([])
  const rightIndRefs = useRef<THREE.PointLight[]>([])

  const throttleState = useRef({
    current: 0,
    nitroMult: 1.0,
    shiftTimer: 0,
    displaySpeed: 0
  })

  const driftState = useRef({
    active: false,
    angle: 0,
    grip: 1.0
  })

  const [modelConfig, setModelConfig] = useState({
    scale: 1,
    yOffset: 0
  })

  const [, getKeys] = useKeyboardControls()

  useEffect(() => {
    if (!scene) return

    // Clear wheels array on hot-reload
    wheels.current = []
    frontWheels.current = []

    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true
        child.receiveShadow = true

        // Ferrari paint material enhancement
        if (child.material && child.name.toLowerCase().includes('body')) {
          child.material = child.material.clone()
          child.material.color = new THREE.Color(color)
          child.material.metalness = 0.8
          child.material.roughness = 0.2
        }

        // Helper to safely clone and modify materials (handles arrays of materials)
        const modifyMaterial = (mesh: THREE.Mesh, colorHex: string, metalness?: number, roughness?: number) => {
          if (!mesh.material) return;
          const applyProps = (mat: any) => {
            mat.color = new THREE.Color(colorHex)
            if (metalness !== undefined) mat.metalness = metalness
            if (roughness !== undefined) mat.roughness = roughness
            return mat
          }
          if (Array.isArray(mesh.material)) {
            mesh.material = mesh.material.map(m => applyProps(m.clone()))
          } else {
            mesh.material = applyProps((mesh.material as THREE.Material).clone())
          }
        }

        // Custom Wheels (Gold/Bronze Rims, Yellow Brakes, Black Centers)
        const meshName = child.name.toLowerCase()
        if (meshName.startsWith('rim_')) {
          modifyMaterial(child, '#cfa874', 0.9, 0.2) // Gold/Bronze
        }
        if (meshName.includes('brake') && !meshName.includes('brakes')) {
          modifyMaterial(child, '#ffcc00', 0.3, 0.4) // Ferrari Yellow
        }
        if (meshName === 'centre') {
          modifyMaterial(child, '#111111', 0.5, 0.5) // Black center caps
        }

        // Find exact taillights meshes to make them glow when braking
        const matName = child.material?.name || ''

        if (matName === 'Taillight_Glass') {
          child.material = child.material.clone()
          child.material.emissive = new THREE.Color(0xff0000)
          child.material.toneMapped = false
          taillightMats.current.push(child.material as THREE.MeshStandardMaterial)
        }

        if (matName.includes('projector') || matName.includes('leds') || meshName.includes('headlight') || matName.includes('headlight')) {
          child.material = child.material.clone()
          child.material.emissive = new THREE.Color(0xffffff)
          child.material.toneMapped = false
          headlightMats.current.push(child.material as THREE.MeshStandardMaterial)
        }
      }

      const name = child.name.toLowerCase()
      if (name === 'wheel_fl' || name === 'wheel_fr') {
        frontWheels.current.push(child)
        wheels.current.push(child)
      } else if (name === 'wheel_rl' || name === 'wheel_rr') {
        wheels.current.push(child)
      }
    })

    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())

    // Scale car to roughly 4.5 meters long
    const scale = size.z > 0 ? 4.5 / size.z : 1

    setModelConfig({
      scale,
      yOffset: -box.min.y * scale
    })

    // Center locally
    scene.position.set(-center.x * scale, 0, -center.z * scale)

  }, [scene, color])

  useFrame((_, rawDelta) => {
    if (!rb.current || !chassisRef.current) return
    const delta = Math.min(rawDelta, 0.05) // Clamp delta to prevent physics explosions on lag spikes

    const keys = getKeys()

    // Get current physics state
    const velocity = rb.current.linvel()
    const rotation = rb.current.rotation()

    // Failsafe: Catch any NaN or Infinity physics states and recover instantly
    if (!isFinite(velocity.x) || !isFinite(rotation.w)) {
      console.warn("Physics NaN detected. Resetting car.")
      rb.current.setTranslation({ x: 0, y: 2, z: 0 }, true)
      rb.current.setLinvel({ x: 0, y: 0, z: 0 }, true)
      rb.current.setAngvel({ x: 0, y: 0, z: 0 }, true)

      // Cure infected useRef states
      throttleState.current = { current: 0, nitroMult: 1.0, shiftTimer: 0, displaySpeed: 0 }
      driftState.current = { active: false, angle: 0, grip: 1.0 }
      gearbox.current.rpm = 1000
      gearbox.current.gear = 1
      cameraTargetLocal.current.set(0, 1.0, 0)

      return
    }

    const currentSpeed = Math.sqrt(velocity.x ** 2 + velocity.z ** 2)
    const speedKmH = currentSpeed * 3.6
    const fw = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w))
    const forwardSpeed = velocity.x * fw.x + velocity.z * fw.z // Dot product

    // Local velocity for drift calculation
    const threeQuat = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)
    const localVel = new THREE.Vector3(velocity.x, velocity.y, velocity.z).applyQuaternion(threeQuat.invert())
    driftState.current.angle = Math.abs(Math.atan2(localVel.x, localVel.z)) * (180 / Math.PI)

    // --- Gearbox & Engine Physics ---
    const gb = gearbox.current

    // Edge detection for Light Toggles
    if (keys.headlights && !lastKeys.current.headlights) lightsState.current.headlights = !lightsState.current.headlights
    if (keys.indicatorLeft && !lastKeys.current.indicatorLeft) { lightsState.current.leftInd = !lightsState.current.leftInd; lightsState.current.rightInd = false; lightsState.current.hazard = false }
    if (keys.indicatorRight && !lastKeys.current.indicatorRight) { lightsState.current.rightInd = !lightsState.current.rightInd; lightsState.current.leftInd = false; lightsState.current.hazard = false }
    if (keys.hazard && !lastKeys.current.hazard) { lightsState.current.hazard = !lightsState.current.hazard; lightsState.current.leftInd = false; lightsState.current.rightInd = false }
    lastKeys.current = { ...keys }

    // --- Smooth Throttle & Nitro ---
    const ts = throttleState.current
    const inputThrottle = keys.forward ? 1 : 0
    const throttleResponseSpeed = 2.0 // Lowered from 3.5 for a heavier, smoother launch
    ts.current = THREE.MathUtils.lerp(ts.current, inputThrottle, 1.0 - Math.exp(-throttleResponseSpeed * delta))

    // Nitro Logic
    const isNitroActive = keys.nitro && nitroState.current.amount > 0 && currentSpeed > 5 && gb.gear > 0
    const targetNitroMult = isNitroActive ? 1.5 : 1.0 // 1.5x max torque boost
    ts.nitroMult = THREE.MathUtils.lerp(ts.nitroMult, targetNitroMult, 1.0 - Math.exp(-5.0 * delta))

    if (isNitroActive) {
      nitroState.current.amount = Math.max(0, nitroState.current.amount - 20 * delta)
    } else {
      nitroState.current.amount = Math.min(100, nitroState.current.amount + 5 * delta)
    }
    audio.updateNitro()

    // Shift Delay Timer
    if (ts.shiftTimer > 0) ts.shiftTimer -= delta

    // Auto-Shifting Logic (R <-> 1)
    if (keys.back || keys.brake) {
      if (currentSpeed < 1 && forwardSpeed <= 0.1) gb.gear = -1
    } else if (keys.forward) {
      if (gb.gear === -1 && currentSpeed < 1) gb.gear = 1
    }

    // RPM Calculation
    type GearKey = keyof typeof gb.ratios
    let ratio = gb.ratios[gb.gear.toString() as GearKey] || 0
    if (gb.gear === 0) ratio = 0

    const speedForRpm = gb.gear === -1 ? Math.abs(forwardSpeed) : Math.max(0, forwardSpeed)
    let targetRpm = gb.idleRpm + (speedForRpm * ratio)

    // Clutch slip simulation for launching
    if (keys.forward && gb.gear > 0 && targetRpm < 2500) {
      targetRpm = THREE.MathUtils.lerp(targetRpm, 3500, 0.5)
    } else if ((keys.back || keys.brake) && gb.gear === -1 && targetRpm < 2500) {
      targetRpm = THREE.MathUtils.lerp(targetRpm, 3500, 0.5)
    }

    gb.rpm = THREE.MathUtils.lerp(gb.rpm, targetRpm, 0.2) // Smooth RPM gauge
    if (gb.rpm > gb.maxRpm) gb.rpm = gb.maxRpm - 200 // Redline bounce

    // Auto Shift Up & Down
    if (gb.rpm > gb.shiftUpRpm && gb.gear > 0 && gb.gear < 6) {
      gb.gear++
      gb.rpm -= 2000 // RPM drop on upshift
      ts.shiftTimer = 0.2 // Clutch delay
      audio.triggerShift()
    } else if (gb.rpm < gb.shiftDownRpm && gb.gear > 1) {
      gb.gear--
      gb.rpm += 1500 // RPM spike on downshift
      ts.shiftTimer = 0.2 // Clutch delay
      audio.triggerShift()
    }

    // Torque Curve Calculation
    const getTorqueMultiplier = (rpm: number) => {
      if (rpm < 1000) return 0.5;
      if (rpm < 5000) return THREE.MathUtils.lerp(0.5, 1.0, (rpm - 1000) / 4000);
      if (rpm < 8000) return THREE.MathUtils.lerp(1.0, 0.6, (rpm - 5000) / 3000);
      return 0.1;
    }

    const maxEngineForce = 22000 // Realism: 22,000 N thrust gives ~1.5G acceleration for a 1500kg car
    const torqueMultiplier = getTorqueMultiplier(gb.rpm)
    const mechanicalAdvantage = Math.pow(ratio / gb.ratios['6'], 0.5)

    // Strict Per-Gear Speed Limiter
    const gearMaxSpeeds: { [key: string]: number } = {
      '-1': 20,
      '0': 0,
      '1': 45,
      '2': 90,
      '3': 140,
      '4': 190,
      '5': 240,
      '6': 280
    }
    const currentGearMaxSpeedMs = (gearMaxSpeeds[gb.gear.toString()] || 280) / 3.6

    // Fix NaN crash: if max speed is 0 (Neutral), force speedRatio to 1 so falloff becomes 0.
    const speedRatio = currentGearMaxSpeedMs > 0 ? Math.max(0, Math.min(1, currentSpeed / currentGearMaxSpeedMs)) : 1
    const speedFalloff = 1 - Math.pow(speedRatio, 5)

    // Apply clutch disengagement during shifts
    const clutchEngaged = ts.shiftTimer <= 0 ? 1 : 0

    // Final force output
    const currentEngineForce = maxEngineForce * torqueMultiplier * mechanicalAdvantage * ts.nitroMult * ts.current * clutchEngaged * speedFalloff * delta

    // Air resistance (Drag) - squares with speed
    const dragForce = 0.05 * currentSpeed * currentSpeed * delta

    // Smoothed Speedometer UI (Stable framerate independent)
    ts.displaySpeed = THREE.MathUtils.lerp(ts.displaySpeed, speedKmH, 1.0 - Math.exp(-10.0 * delta))

    // Telemetry HUD Update
    const speedEl = document.getElementById('hud-speed')
    const gearEl = document.getElementById('hud-gear')
    const rpmEl = document.getElementById('hud-rpm')
    const nitroBar = document.getElementById('hud-nitro-bar')
    const nitroText = document.getElementById('hud-nitro-text')

    if (speedEl) speedEl.innerText = Math.round(ts.displaySpeed).toString()
    if (gearEl) gearEl.innerText = gb.gear === -1 ? 'R' : gb.gear === 0 ? 'N' : gb.gear.toString()
    if (rpmEl) rpmEl.innerText = Math.round(gb.rpm).toString()
    if (nitroBar) nitroBar.style.width = `${nitroState.current.amount}%`
    if (nitroText) nitroText.innerText = `${Math.round(nitroState.current.amount)}%`

    // Light HUD & Visuals Update
    lightsState.current.blinkTimer += delta * 6
    const isBlinkOn = Math.sin(lightsState.current.blinkTimer) > 0
    const leftOn = lightsState.current.hazard || lightsState.current.leftInd
    const rightOn = lightsState.current.hazard || lightsState.current.rightInd

    const hudHeadlights = document.getElementById('hud-headlights')
    const hudIndLeft = document.getElementById('hud-ind-left')
    const hudIndRight = document.getElementById('hud-ind-right')
    if (hudHeadlights) hudHeadlights.style.backgroundColor = lightsState.current.headlights ? '#facc15' : 'rgba(148, 163, 184, 0.5)'
    if (hudIndLeft) hudIndLeft.style.backgroundColor = (leftOn && isBlinkOn) ? '#f97316' : 'rgba(148, 163, 184, 0.5)'
    if (hudIndRight) hudIndRight.style.backgroundColor = (rightOn && isBlinkOn) ? '#f97316' : 'rgba(148, 163, 184, 0.5)'

    // Update Light Meshes
    headlightRefs.current.forEach(light => {
      light.intensity = THREE.MathUtils.lerp(light.intensity, lightsState.current.headlights ? 2000 : 0, 0.2)
    })
    headlightMats.current.forEach(mat => {
      mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, lightsState.current.headlights ? 5 : 0, 0.2)
    })
    leftIndRefs.current.forEach(light => light.intensity = (leftOn && isBlinkOn) ? 100 : 0)
    rightIndRefs.current.forEach(light => light.intensity = (rightOn && isBlinkOn) ? 100 : 0)

    let targetPitch = keys.forward && gb.gear > 0 ? -0.015 * ts.current : 0
    let targetRoll = 0

    let slipAmount = 0

    // Forward / Acceleration
    if (keys.forward) {
      if (forwardSpeed < -0.1) {
        // Braking while rolling backward
        const brakeForce = 45000
        rb.current.applyImpulse({ x: fw.x * brakeForce * delta, y: 0, z: fw.z * brakeForce * delta }, true)
        targetPitch = -0.03 // Pitch UP
        slipAmount = Math.max(slipAmount, currentSpeed / 50)
      } else if (currentEngineForce > 0 && gb.gear > 0) {
        // Normal Acceleration
        rb.current.applyImpulse({ x: fw.x * currentEngineForce, y: 0, z: fw.z * currentEngineForce }, true)
      }
    }

    // Braking, Reverse & Screech
    if (keys.back || keys.brake) {
      if (forwardSpeed > 0.1 && gb.gear > 0) {
        // Braking
        const brakeForce = 45000
        rb.current.applyImpulse({ x: -fw.x * brakeForce * delta, y: 0, z: -fw.z * brakeForce * delta }, true)
        targetPitch = 0.03 // Pitch DOWN
        slipAmount = Math.max(slipAmount, currentSpeed / 50) // Brake squeal at high speed
      } else if (gb.gear === -1) {
        // Accelerate in Reverse (smoothly capped at 20 km/h)
        const maxReverseSpeedMs = 20 / 3.6
        const reverseFalloff = Math.max(0, 1 - Math.pow(currentSpeed / maxReverseSpeedMs, 2))
        const reverseForce = 15000 * reverseFalloff
        rb.current.applyImpulse({ x: -fw.x * reverseForce * delta, y: 0, z: -fw.z * reverseForce * delta }, true)
      }
    }

    // --- Drift & Lateral Physics ---
    const isHandbrake = keys.handbrake
    let steerAngle = 0
    if (keys.left) steerAngle = 0.4
    if (keys.right) steerAngle = -0.4

    const isSharpTurn = Math.abs(steerAngle) > 0.3 && currentSpeed > 15

    if ((isHandbrake || isSharpTurn) && currentSpeed > 10) {
      driftState.current.active = true
      const targetGrip = isHandbrake ? 0.15 : 0.45 // Handbrake drops grip heavily
      driftState.current.grip = THREE.MathUtils.lerp(driftState.current.grip, targetGrip, 1.0 - Math.exp(-5.0 * delta))
    } else {
      driftState.current.active = false
      driftState.current.grip = THREE.MathUtils.lerp(driftState.current.grip, 1.0, 1.0 - Math.exp(-3.0 * delta))
    }

    // Apply Custom Lateral Friction (Anti-slip / Drift control)
    // High grip = kill lateral velocity fast. Low grip = kill it slowly (sliding).
    const velocityToKill = localVel.x * (1.0 - Math.exp(-15.0 * driftState.current.grip * delta))
    const lateralImpulse = -velocityToKill * 1500
    const lateralImpulseWorld = new THREE.Vector3(lateralImpulse, 0, 0).applyQuaternion(new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w))
    rb.current.applyImpulse(lateralImpulseWorld, true)

    // Handbrake drags car down smoothly and strongly
    if (isHandbrake && Math.abs(forwardSpeed) > 0.5) {
      const sign = Math.sign(forwardSpeed)
      // Brake hard at 40 m/s^2 (arcade style)
      const maxHandbrakeVelocityToKill = Math.min(Math.abs(forwardSpeed), 40.0 * delta)
      const handbrakeImpulse = maxHandbrakeVelocityToKill * (rb.current.mass() || 1500)
      rb.current.applyImpulse({ x: -fw.x * handbrakeImpulse * sign, y: 0, z: -fw.z * handbrakeImpulse * sign }, true)
      targetPitch = sign * 0.04 // Strong nose dive
    }

    // Drift Speed Loss (speed naturally bleeds off when sideways)
    if (driftState.current.angle > 10 && currentSpeed > 5 && forwardSpeed > 0) {
      const driftSpeedLoss = driftState.current.angle * 200 * delta
      rb.current.applyImpulse({ x: -fw.x * driftSpeedLoss, y: 0, z: -fw.z * driftSpeedLoss }, true)
    }

    // Tire Screech Sound based on Drift Angle
    if (driftState.current.angle > 15 && currentSpeed > 10) {
      slipAmount = Math.max(slipAmount, Math.min(1.0, (driftState.current.angle - 15) / 30))
    }
    
    // Burnout / Hard Launch Smoke
    if (keys.forward && gb.gear === 1 && currentSpeed < 10 && ts.current > 0.8) {
      slipAmount = Math.max(slipAmount, 0.8 * (1 - currentSpeed / 10))
    }
    
    audio.updateScreech(slipAmount)
    
    // Update smoke particles state
    smokeState.current.active = slipAmount > 0.1

    // Apply Air Drag (Slows car naturally when coasting)
    if (currentSpeed > 0.1) {
      const dragDir = new THREE.Vector3(-velocity.x, 0, -velocity.z).normalize()
      rb.current.applyImpulse({ x: dragDir.x * dragForce, y: 0, z: dragDir.z * dragForce }, true)
    }

    // Steering logic
    if (currentSpeed > 0.5 || keys.forward || keys.back) {
      // Turn direction: if moving backwards, reverse the steering
      const turnDir = forwardSpeed < -0.5 ? -1 : 1

      // Counter-steer assist during drift
      let assistTorque = 0
      const currentMass = rb.current.mass() || 1500
      if (driftState.current.angle > 15 && currentSpeed > 15) {
        const isCounterSteeringLeft = localVel.x > 0 && keys.left
        const isCounterSteeringRight = localVel.x < 0 && keys.right
        if (isCounterSteeringLeft || isCounterSteeringRight) {
          assistTorque = 1500 * currentMass * delta // Give the player a boost to snap out of the drift
        }
      }

      // Realistic steering responsiveness (angular acceleration in rad/s^2 roughly)
      const steeringResponsiveness = THREE.MathUtils.lerp(12, 3, Math.min(currentSpeed / 50, 1.0))
      const turnTorque = (steeringResponsiveness * currentMass * delta) + assistTorque

      if (keys.left) {
        rb.current.applyTorqueImpulse({ x: 0, y: turnDir * turnTorque, z: 0 }, true) // Positive Y = Left
        targetRoll = -Math.min(currentSpeed / 50, 1.0) * 0.05 // Dynamic roll based on speed
      }
      if (keys.right) {
        rb.current.applyTorqueImpulse({ x: 0, y: -turnDir * turnTorque, z: 0 }, true) // Negative Y = Right
        targetRoll = Math.min(currentSpeed / 50, 1.0) * 0.05 // Dynamic roll based on speed
      }
    }

    // High-Speed Aerodynamic Stability (Virtual Rudder)
    // Prevents the car from doing donuts or spinning out uncontrollably at high speeds
    if (currentSpeed > 5) {
      const angVel = rb.current.angvel()
      const speedFactor = Math.min(currentSpeed / 40, 1.0) // Max stability at 144 km/h

      // Mathematically stable exponential decay of angular velocity
      // Removes up to 22% of angular velocity per frame at 60fps without overshooting
      const angVelToKill = angVel.y * (1.0 - Math.exp(-5.0 * speedFactor * delta))

      // Moment of Inertia (Iy) for a 1x2.2 box is roughly mass * 2.0
      const stabilityImpulse = -angVelToKill * ((rb.current.mass() || 1500) * 2.0)
      rb.current.applyTorqueImpulse({ x: 0, y: stabilityImpulse, z: 0 }, true)
    }

    // Suspension (Chassis Leaning / Lateral G-Force Simulation)
    chassisRef.current.rotation.x = THREE.MathUtils.lerp(chassisRef.current.rotation.x, targetPitch, 0.1)
    chassisRef.current.rotation.z = THREE.MathUtils.lerp(chassisRef.current.rotation.z, targetRoll, 0.1)

    // Spin wheels
    wheels.current.forEach(wheel => {
      // Avoid micro-jitter when perfectly stopped
      if (Math.abs(forwardSpeed) > 0.1) {
        wheel.rotation.x -= (forwardSpeed * delta) / 0.3 // Negative sign to fix backward spinning
      }
    })

    // Steer front wheels
    frontWheels.current.forEach(wheel => {
      wheel.rotation.order = 'YXZ' // Fix Euler gimbal lock wobble
      wheel.rotation.y = THREE.MathUtils.lerp(wheel.rotation.y, steerAngle, 0.15)
    })

    // Emissive Glow Logic for Taillights (Braking or Handbrake)
    const isBraking = keys.back || keys.brake || keys.handbrake
    const targetTaillightGlow = isBraking ? 10 : 0
    taillightMats.current.forEach(mat => {
      mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, targetTaillightGlow, 0.2)
    })

    // Cinematic Drift Camera Offset
    if (driftState.current.angle > 10) {
      cameraDriftOffsetRef.current = THREE.MathUtils.lerp(cameraDriftOffsetRef.current, (localVel.x > 0 ? -1.5 : 1.5), 0.05)
    } else {
      cameraDriftOffsetRef.current = THREE.MathUtils.lerp(cameraDriftOffsetRef.current, 0, 0.05)
    }

    // Flawless Child-Camera Logic
    if (cameraRef.current && cameraRef.current.parent) {
      let baseOffset = new THREE.Vector3(cameraDriftOffsetRef.current, 2.5, -7)
      let baseLookAt = new THREE.Vector3(0, 1.0, 0)

      switch (cameraView) {
        case 'FRONT':
          baseOffset.set(0, 1.5, 6)
          baseLookAt.set(0, 1.0, 0)
          break
        case 'SIDE':
          baseOffset.set(7, 1.5, 0)
          baseLookAt.set(0, 0.5, 0)
          break
        case 'BACK_UP':
          baseOffset.set(0, 6, -6)
          baseLookAt.set(0, 0, 0)
          break
        case 'BACK':
        default:
          baseOffset.set(0, 2.5, -7)
          baseLookAt.set(0, 1.0, 0)
          break
      }

      // Dynamic FOV for Nitro sense of speed
      const targetFov = isNitroActive ? 75 : 60
      cameraRef.current.fov = THREE.MathUtils.lerp(cameraRef.current.fov, targetFov, 0.1)
      cameraRef.current.updateProjectionMatrix()

      // Smoothly lerp LOCAL position to slide between views (Fixed lerp to prevent jitter)
      const lerpFactor = 0.1
      cameraRef.current.position.lerp(baseOffset, lerpFactor)

      // Smoothly lerp LOCAL look target
      cameraTargetLocal.current.lerp(baseLookAt, lerpFactor)

      // Fix R3F Sync Jitter: Calculate local rotation without relying on world matrices!
      // This prevents the screen from "blinking" or jumping when physics transforms update.
      const m = new THREE.Matrix4()
      m.lookAt(cameraRef.current.position, cameraTargetLocal.current, new THREE.Vector3(0, 1, 0))
      cameraRef.current.quaternion.setFromRotationMatrix(m)
    }

    // Update Engine Audio (Called at end to capture final state)
    // If in reverse, use an arbitrary positive RPM for sound
    const engineRpmForSound = gb.gear === -1 ? 3000 + (Math.abs(forwardSpeed) * 50) : gb.rpm
    const engineThrottleForSound = (gb.gear === -1 && (keys.back || keys.brake)) ? 0.8 : ts.current
    audio.updateEngineSound(engineRpmForSound, gb.maxRpm, engineThrottleForSound)

  })

  // Crash Handler
  const handleCollision = () => {
    if (!rb.current) return
    const velocity = rb.current.linvel()
    const currentSpeed = Math.sqrt(velocity.x ** 2 + velocity.y ** 2 + velocity.z ** 2)
    if (currentSpeed > 5) {
      audio.triggerCrash(currentSpeed)
    }
  }

  return (
    <>
    <RigidBody
      ref={rb}
      position={[0, 2, 0]}
      type="dynamic"
      colliders={false}
      mass={1500}
      linearDamping={0.5}
      angularDamping={10}
      onCollisionEnter={handleCollision}
    >
      <CuboidCollider args={[1.0, 0.5, 2.2]} position={[0, 0.5, 0]} density={170.45} friction={0} frictionCombineRule={1} restitution={0} restitutionCombineRule={1} />
      <group>
        <PerspectiveCamera ref={cameraRef} makeDefault fov={60} />
      </group>

      {/* Headlights */}
      <spotLight ref={el => el && !headlightRefs.current.includes(el) && headlightRefs.current.push(el)} position={[-0.8, 0.6, -2.3]} angle={0.5} penumbra={0.5} intensity={0} distance={100} color="white">
        <primitive object={new THREE.Object3D()} position={[0, 0, -10]} attach="target" />
      </spotLight>
      <spotLight ref={el => el && !headlightRefs.current.includes(el) && headlightRefs.current.push(el)} position={[0.8, 0.6, -2.3]} angle={0.5} penumbra={0.5} intensity={0} distance={100} color="white">
        <primitive object={new THREE.Object3D()} position={[0, 0, -10]} attach="target" />
      </spotLight>

      {/* Blinker Indicators */}
      <pointLight ref={el => el && !leftIndRefs.current.includes(el) && leftIndRefs.current.push(el)} position={[-1.0, 0.6, 2.3]} intensity={0} distance={3} color="#f97316" />
      <pointLight ref={el => el && !leftIndRefs.current.includes(el) && leftIndRefs.current.push(el)} position={[-1.0, 0.7, -2.4]} intensity={0} distance={3} color="#f97316" />

      <pointLight ref={el => el && !rightIndRefs.current.includes(el) && rightIndRefs.current.push(el)} position={[1.0, 0.6, 2.3]} intensity={0} distance={3} color="#f97316" />
      <pointLight ref={el => el && !rightIndRefs.current.includes(el) && rightIndRefs.current.push(el)} position={[1.0, 0.7, -2.4]} intensity={0} distance={3} color="#f97316" />

      <CuboidCollider args={[1.0, 0.5, 2.2]} position={[0, 0.5, 0]} friction={0} restitution={0} />
      <group ref={chassisRef}>
        <group position={[0, modelConfig.yOffset, 0]} scale={modelConfig.scale}>
          <primitive object={scene} rotation={[0, Math.PI, 0]} />
        </group>
      </group>
    </RigidBody>
    <SmokeParticles smokeState={smokeState} carRef={rb} />
    </>
  )
}
