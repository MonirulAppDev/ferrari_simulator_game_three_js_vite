import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const MAX_PARTICLES = 300

export function SmokeParticles({ smokeState, carRef }: { smokeState: React.MutableRefObject<{active: boolean}>, carRef: React.RefObject<any> }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  
  const particles = useMemo(() => {
    return Array.from({ length: MAX_PARTICLES }).map(() => ({
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      scale: 0,
      life: 0,
      maxLife: Math.random() * 0.5 + 0.5
    }))
  }, [])

  const dummy = useMemo(() => new THREE.Object3D(), [])
  const colorDummy = useMemo(() => new THREE.Color(), [])
  
  const particleIndexRef = useRef(0)

  // IMPORTANT: Initialize colors once so the buffer attribute is created
  useEffect(() => {
    if (meshRef.current) {
      const initColor = new THREE.Color(0, 0, 0)
      for (let i = 0; i < MAX_PARTICLES; i++) {
        meshRef.current.setColorAt(i, initColor)
      }
      if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true
    }
  }, [])

  useFrame((_, delta) => {
    if (!meshRef.current) return

    // Spawn new particles if active
    if (smokeState.current.active && carRef.current) {
      // Get world position of rear wheels roughly
      const translation = carRef.current.translation()
      const rotation = carRef.current.rotation()
      
      // Calculate rear wheel positions (approx 1.5m behind center)
      const fw = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w))
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w))
      
      const rearLeft = new THREE.Vector3(translation.x, translation.y - 0.2, translation.z)
        .addScaledVector(fw, 1.5) // Rear
        .addScaledVector(right, -0.8) // Left
        
      const rearRight = new THREE.Vector3(translation.x, translation.y - 0.2, translation.z)
        .addScaledVector(fw, 1.5) // Rear
        .addScaledVector(right, 0.8) // Right

      // Spawn 2 particles per frame
      for (let i = 0; i < 2; i++) {
        const p = particles[particleIndexRef.current]
        p.position.copy(i === 0 ? rearLeft : rearRight)
        
        // Add random scatter
        p.position.x += (Math.random() - 0.5) * 0.5
        p.position.y += Math.random() * 0.2
        p.position.z += (Math.random() - 0.5) * 0.5
        
        // Velocity upwards and slightly scattered
        p.velocity.set(
          (Math.random() - 0.5) * 1.5,
          Math.random() * 1.5 + 0.5,
          (Math.random() - 0.5) * 1.5
        )
        p.scale = 0.5
        p.life = p.maxLife
        
        particleIndexRef.current = (particleIndexRef.current + 1) % MAX_PARTICLES
      }
    }

    // Update all particles
    particles.forEach((p, i) => {
      if (p.life > 0) {
        p.life -= delta
        p.position.addScaledVector(p.velocity, delta)
        p.scale += delta * 1.5 // Grow over time
        
        dummy.position.copy(p.position)
        
        // Make the plane always face the camera
        dummy.rotation.x = -Math.PI / 2 // Or just keep it as a box or sphere for simplicity
        
        dummy.scale.setScalar(p.scale)
        dummy.updateMatrix()
        meshRef.current!.setMatrixAt(i, dummy.matrix)
        
        // Fade out color (Additive blending means black = invisible)
        const intensity = Math.max(0, p.life / p.maxLife) * 0.3 // max 0.3 brightness
        colorDummy.setRGB(intensity, intensity, intensity)
        meshRef.current!.setColorAt(i, colorDummy)
      } else {
        dummy.position.set(0, -1000, 0)
        dummy.scale.setScalar(0)
        dummy.updateMatrix()
        meshRef.current!.setMatrixAt(i, dummy.matrix)
        colorDummy.setRGB(0, 0, 0)
        meshRef.current!.setColorAt(i, colorDummy)
      }
    })
    
    meshRef.current.instanceMatrix.needsUpdate = true
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true
  })

  // We use a simple icosahedron or sphere to represent smoke puffs so they look volumetric
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, MAX_PARTICLES]}>
      <icosahedronGeometry args={[1, 1]} />
      <meshBasicMaterial color="white" transparent blending={THREE.AdditiveBlending} depthWrite={false} />
    </instancedMesh>
  )
}
