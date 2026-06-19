import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { environmentState } from './DayNightCycle'

const ROAD_LENGTH = 20000 // 20 km
const ROAD_WIDTH = 30 // 4 lanes
const STREETLIGHT_SPACING = 60

export function CityStreet() {
  const roadTexture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 1024
    const ctx = canvas.getContext('2d')!
    
    // Asphalt base
    ctx.fillStyle = '#1a1a1a'
    ctx.fillRect(0, 0, 1024, 1024)
    
    // Add some noise to asphalt
    for (let i = 0; i < 20000; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? '#252525' : '#111111'
      ctx.fillRect(Math.random() * 1024, Math.random() * 1024, 4, 4)
    }

    // Outer solid lines
    ctx.fillStyle = '#e5e7eb' // off-white
    ctx.fillRect(40, 0, 20, 1024)
    ctx.fillRect(1024 - 60, 0, 20, 1024)
    
    // Inner dashed lines (3 dividers for 4 lanes)
    const laneWidth = (1024 - 80) / 4
    for (let i = 1; i <= 3; i++) {
      const x = 40 + i * laneWidth
      ctx.fillRect(x - 10, 0, 20, 600) // dash length 600, gap 424
    }
    
    const tex = new THREE.CanvasTexture(canvas)
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(1, ROAD_LENGTH / 20) // Tile every 20 meters
    tex.anisotropy = 16
    return tex
  }, [])

  // Instanced Meshes for Streetlights & Guardrails
  const streetlightCount = Math.floor(ROAD_LENGTH / STREETLIGHT_SPACING) * 2
  
  const poleMatrices = useMemo(() => {
    const matrices = new Float32Array(streetlightCount * 16)
    const dummy = new THREE.Object3D()
    
    let idx = 0
    for (let z = -ROAD_LENGTH / 2; z < ROAD_LENGTH / 2; z += STREETLIGHT_SPACING) {
      // Left pole
      dummy.position.set(-ROAD_WIDTH / 2 - 1, 4, z) // 4m tall
      dummy.scale.setScalar(1)
      dummy.updateMatrix()
      dummy.matrix.toArray(matrices, idx * 16)
      idx++
      
      // Right pole
      dummy.position.set(ROAD_WIDTH / 2 + 1, 4, z)
      dummy.updateMatrix()
      dummy.matrix.toArray(matrices, idx * 16)
      idx++
    }
    return matrices
  }, [])

  // Guardrails
  const guardrailCount = Math.floor(ROAD_LENGTH / 10) * 2 // 10m segments
  const guardrailMatrices = useMemo(() => {
    const matrices = new Float32Array(guardrailCount * 16)
    const dummy = new THREE.Object3D()
    let idx = 0
    for (let z = -ROAD_LENGTH / 2; z < ROAD_LENGTH / 2; z += 10) {
      // Left
      dummy.position.set(-ROAD_WIDTH / 2 - 0.5, 0.5, z)
      dummy.scale.setScalar(1)
      dummy.updateMatrix()
      dummy.matrix.toArray(matrices, idx * 16)
      idx++
      // Right
      dummy.position.set(ROAD_WIDTH / 2 + 0.5, 0.5, z)
      dummy.updateMatrix()
      dummy.matrix.toArray(matrices, idx * 16)
      idx++
    }
    return matrices
  }, [])

  const bulbMaterialRef = useRef<THREE.MeshBasicMaterial>(null)

  useFrame(() => {
    if (bulbMaterialRef.current) {
      if (environmentState.isNight) {
        bulbMaterialRef.current.color.set('#fde047') // Bright yellow glow
      } else {
        bulbMaterialRef.current.color.set('#555555') // Off
      }
    }
  })

  return (
    <group>
      {/* Road Physics & Visual */}
      <RigidBody type="fixed" colliders="cuboid" restitution={0.2} friction={1.0}>
        <mesh position={[0, -0.5, 0]} receiveShadow>
          <boxGeometry args={[ROAD_WIDTH, 1, ROAD_LENGTH]} />
          <meshStandardMaterial map={roadTexture} roughness={0.8} metalness={0.1} />
        </mesh>

        {/* Grass / Ground surrounding the road */}
        <mesh position={[0, -0.6, 0]} receiveShadow>
          <boxGeometry args={[2000, 1, ROAD_LENGTH]} />
          <meshStandardMaterial color="#064e3b" roughness={1.0} />
        </mesh>
      </RigidBody>

      {/* Guardrails */}
      <instancedMesh args={[undefined, undefined, guardrailCount]}>
        <boxGeometry args={[0.5, 1.0, 10]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.4} />
        <instancedBufferAttribute attach="instanceMatrix" args={[guardrailMatrices, 16]} />
      </instancedMesh>

      {/* Streetlight Poles */}
      <instancedMesh args={[undefined, undefined, streetlightCount]} castShadow>
        <cylinderGeometry args={[0.2, 0.3, 8, 8]} />
        <meshStandardMaterial color="#333333" metalness={0.8} roughness={0.2} />
        <instancedBufferAttribute attach="instanceMatrix" args={[poleMatrices, 16]} />
      </instancedMesh>

      {/* Streetlight Bulbs (Top of poles) */}
      <instancedMesh args={[undefined, undefined, streetlightCount]}>
        <sphereGeometry args={[0.4, 8, 8]} />
        <meshBasicMaterial ref={bulbMaterialRef} color="#fde047" />
        <instancedBufferAttribute attach="instanceMatrix" args={[
          // Offset the matrices so bulbs are at the top of the poles
          useMemo(() => {
            const mats = new Float32Array(poleMatrices.length)
            const mat = new THREE.Matrix4()
            const pos = new THREE.Vector3()
            const quat = new THREE.Quaternion()
            const scale = new THREE.Vector3()
            for (let i = 0; i < streetlightCount; i++) {
              mat.fromArray(poleMatrices, i * 16)
              mat.decompose(pos, quat, scale)
              pos.y += 4 // Move to top of 8m pole (center is at y=4, so top is y=8, offset from center is +4)
              mat.compose(pos, quat, scale)
              mat.toArray(mats, i * 16)
            }
            return mats
          }, [poleMatrices]), 16
        ]} />
      </instancedMesh>
    </group>
  )
}
