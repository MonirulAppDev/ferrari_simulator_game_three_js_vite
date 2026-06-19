import { useEffect, useRef, useState, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF, useKeyboardControls, SpotLight } from '@react-three/drei'
import { RigidBody, RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'

interface CarProps {
  url: string;
  color?: string;
  livery?: string;
}

// Global cache for procedurally generated livery textures
const liveryTextures: Record<string, THREE.Texture> = {}

function getLiveryTexture(livery: string): THREE.Texture | null {
  if (!livery || livery === 'none') return null
  if (liveryTextures[livery]) return liveryTextures[livery]

  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  // Base white so the material color multiplies properly
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 512, 512)

  if (livery === 'stripes') {
    ctx.fillStyle = '#111111' // Dark racing stripes
    ctx.fillRect(180, 0, 40, 512)
    ctx.fillRect(292, 0, 40, 512)
  } else if (livery === 'checkers') {
    ctx.fillStyle = '#111111'
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        if ((i + j) % 2 === 0) ctx.fillRect(i * 64, j * 64, 64, 64)
      }
    }
  } else if (livery === 'carbon') {
    ctx.fillStyle = '#333333'
    ctx.fillRect(0, 0, 512, 512)
    ctx.fillStyle = '#111111'
    for(let i = 0; i < 512; i += 8) {
      for(let j = 0; j < 512; j += 8) {
        if((i / 8 + j / 8) % 2 === 0) ctx.fillRect(i, j, 4, 4)
        else ctx.fillRect(i + 4, j + 4, 4, 4)
      }
    }
  } else if (livery === 'text-vdrive') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, 512, 512)
    ctx.fillStyle = '#111111'
    ctx.font = 'bold 80px "Inter", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('V-DRIVE', 256, 256)
  } else if (livery === 'hazard') {
    ctx.fillStyle = '#111111' // Dark base
    ctx.fillRect(0, 0, 512, 512)
    ctx.fillStyle = '#ffffff' // We use white so the base car color multiplies it!
    for (let i = -512; i < 1024; i += 80) {
      ctx.beginPath()
      ctx.moveTo(i, 0)
      ctx.lineTo(i + 40, 0)
      ctx.lineTo(i - 512 + 40, 512)
      ctx.lineTo(i - 512, 512)
      ctx.fill()
    }
  } else if (livery === 'camo') {
    ctx.fillStyle = '#4b5563' // Dark blobs
    // Procedural random-looking blobs (pseudo-random for consistency)
    const seed = [10, 45, 120, 300, 410, 250, 80, 480, 200, 350]
    for (let i = 0; i < 10; i++) {
      ctx.beginPath()
      ctx.arc(seed[i], seed[(i+3)%10], seed[(i+5)%10] * 0.5 + 40, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  
  if (livery === 'carbon') tex.repeat.set(10, 10)
  else if (livery === 'checkers') tex.repeat.set(4, 4)
  else if (livery === 'text-vdrive') tex.repeat.set(15, 15) // Tile text heavily like a wrap
  else if (livery === 'hazard') tex.repeat.set(3, 3)
  else tex.repeat.set(2, 2)

  tex.needsUpdate = true
  liveryTextures[livery] = tex
  return tex
}

export function Car({ url, color, livery = 'none' }: CarProps) {
  const rb = useRef<RapierRigidBody>(null)
  const leftTaillight = useRef<THREE.PointLight>(null)
  const rightTaillight = useRef<THREE.PointLight>(null)
  const [, getKeys] = useKeyboardControls()
  
  const { scene } = useGLTF(url)

  const [modelConfig, setModelConfig] = useState({
    scale: 1,
    position: new THREE.Vector3(0, 0, 0)
  })

  // Clone the scene so we don't accidentally mutate the cached version
  const clonedScene = useMemo(() => scene.clone(), [scene])

  useEffect(() => {
    if (!clonedScene) return

    const liveryTex = getLiveryTexture(livery)
    const materialNames = new Set<string>()

    // Enable shadows and apply color/stickers for the loaded 3D model
    clonedScene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true
        child.receiveShadow = true

        if (child.material) {
          const matName = child.material.name || 'Unnamed Material'
          materialNames.add(matName)

          const matNameLower = matName.toLowerCase()
          // Heuristic to find the car body paint
          if (
            matNameLower.includes('paint') || 
            matNameLower.includes('body') || 
            matNameLower.includes('shell') ||
            matNameLower.includes('exterior') ||
            matNameLower.includes('color')
          ) {
            if (!child.userData.originalMaterial) {
               child.userData.originalMaterial = child.material.clone()
            }
            child.material = child.userData.originalMaterial.clone()
            
            // Apply Color
            if (color) {
              child.material.color = new THREE.Color(color)
            }
            
            // Apply Sticker / Livery
            if (liveryTex) {
              child.material.map = liveryTex
              child.material.needsUpdate = true
            } else {
              child.material.map = child.userData.originalMaterial.map
              child.material.needsUpdate = true
            }
          }
        }
      }
    })

    console.log(`[V-DRIVE PRO] Materials found in ${url}:`, Array.from(materialNames))

    // --- AUTO-SCALING LOGIC ---
    const box = new THREE.Box3().setFromObject(clonedScene)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    
    const maxDim = Math.max(size.x, size.y, size.z)
    const targetSize = 4.5
    const scale = maxDim > 0 ? targetSize / maxDim : 1

    setModelConfig({
      scale,
      position: new THREE.Vector3(
        -center.x * scale,
        -box.min.y * scale,
        -center.z * scale
      )
    })
  }, [clonedScene, color, livery, url])

  // Arcade Physics & Lighting Controller
  useFrame((_state, delta) => {
    if (!rb.current) return
    const keys = getKeys()
    
    // Physics Logic
    const rotation = rb.current.rotation()
    const fw = new THREE.Vector3(0, 0, 1).applyQuaternion(rotation)

    // Base acceleration and turn powers
    const acceleration = 25000 * delta
    const turnSpeed = 1500 * delta

    if (keys.forward) {
      rb.current.applyImpulse({ x: fw.x * acceleration, y: 0, z: fw.z * acceleration }, true)
    }
    if (keys.back || keys.brake) {
      rb.current.applyImpulse({ x: -fw.x * acceleration * 0.8, y: 0, z: -fw.z * acceleration * 0.8 }, true)
    }

    const linvel = rb.current.linvel()
    const speed = Math.sqrt(linvel.x ** 2 + linvel.z ** 2)
    
    // Steering
    if (speed > 1) { 
      const movingForward = (linvel.x * fw.x + linvel.z * fw.z) > 0
      const turnDir = movingForward ? -1 : 1

      if (keys.left) {
        rb.current.applyTorqueImpulse({ x: 0, y: turnDir * turnSpeed, z: 0 }, true)
      }
      if (keys.right) {
        rb.current.applyTorqueImpulse({ x: 0, y: -turnDir * turnSpeed, z: 0 }, true)
      }
    }

    // Taillight Brake Logic
    if (leftTaillight.current && rightTaillight.current) {
      const targetIntensity = keys.back || keys.brake ? 25 : 2
      leftTaillight.current.intensity = THREE.MathUtils.lerp(leftTaillight.current.intensity, targetIntensity, 0.2)
      rightTaillight.current.intensity = THREE.MathUtils.lerp(rightTaillight.current.intensity, targetIntensity, 0.2)
    }
  })

  // We place the car 2 units in the air initially so it drops down onto the physics floor
  return (
    <RigidBody 
      ref={rb} 
      position={[0, 2, 0]} 
      type="dynamic" 
      colliders="cuboid" 
      mass={1500} 
      linearDamping={1.5} 
      angularDamping={3}
    >
      <group position={modelConfig.position} scale={modelConfig.scale}>
        <primitive object={clonedScene} />
      </group>

      {/* Headlights (Pointed Forward +Z axis since rotation is 0 by default) */}
      <SpotLight position={[0.8, 0.6, 2.3]} angle={0.4} penumbra={0.5} intensity={50} distance={50} castShadow color="#fef08a" target-position={[0.8, 0, 10]} />
      <SpotLight position={[-0.8, 0.6, 2.3]} angle={0.4} penumbra={0.5} intensity={50} distance={50} castShadow color="#fef08a" target-position={[-0.8, 0, 10]} />
      
      {/* Taillights (Red) */}
      <pointLight ref={leftTaillight} position={[0.8, 0.6, -2.4]} intensity={2} color="#ef4444" distance={5} />
      <pointLight ref={rightTaillight} position={[-0.8, 0.6, -2.4]} intensity={2} color="#ef4444" distance={5} />
    </RigidBody>
  )
}
