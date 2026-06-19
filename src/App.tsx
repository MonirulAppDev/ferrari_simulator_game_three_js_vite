import { Suspense, useMemo, useState, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { Physics, RigidBody } from '@react-three/rapier'
import { Environment, KeyboardControls, useKeyboardControls } from '@react-three/drei'
import type { KeyboardControlsEntry } from '@react-three/drei'
import { ProceduralCar } from './components/ProceduralCar'
import { motion, AnimatePresence } from 'framer-motion'

export const Controls = {
  forward: 'forward',
  back: 'back',
  left: 'left',
  right: 'right',
  brake: 'brake',
  handbrake: 'handbrake',
  camera: 'camera',
  nitro: 'nitro',
  headlights: 'headlights',
  indicatorLeft: 'indicatorLeft',
  indicatorRight: 'indicatorRight',
  hazard: 'hazard'
} as const;

export type Controls = keyof typeof Controls;

export type CameraViewType = 'BACK' | 'BACK_UP' | 'SIDE' | 'FRONT'
const CAMERA_VIEWS: CameraViewType[] = ['BACK', 'BACK_UP', 'SIDE', 'FRONT']

function CameraController({ onToggle }: { onToggle: React.Dispatch<React.SetStateAction<CameraViewType>> }) {
  const [sub] = useKeyboardControls()
  useEffect(() => {
    return sub(
      (state) => state.camera,
      (pressed) => {
        if (pressed) {
          onToggle(current => {
            const nextIdx = (CAMERA_VIEWS.indexOf(current) + 1) % CAMERA_VIEWS.length
            return CAMERA_VIEWS[nextIdx]
          })
        }
      }
    )
  }, [sub, onToggle])
  return null
}

function ControlItem({ keys, desc }: { keys: string[], desc: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 pb-3">
      <span className="font-medium text-sm text-slate-300">{desc}</span>
      <div className="flex gap-2">
        {keys.map((k, i) => (
          <span key={i} className="px-2 py-1 bg-white/10 rounded-md text-xs font-mono font-bold text-white shadow-inner border border-white/10">{k}</span>
        ))}
      </div>
    </div>
  )
}

function App() {
  const [cameraView, setCameraView] = useState<CameraViewType>('BACK')
  const [showControlsModal, setShowControlsModal] = useState(false)
  const [showDocsModal, setShowDocsModal] = useState(false)
  const [gameStarted, setGameStarted] = useState(false)
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowControlsModal(false)
        setShowDocsModal(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const controlMap = useMemo<KeyboardControlsEntry<Controls>[]>(() => [
    { name: Controls.forward, keys: ['ArrowUp', 'KeyW'] },
    { name: Controls.back, keys: ['ArrowDown', 'KeyS'] },
    { name: Controls.left, keys: ['ArrowLeft', 'KeyA'] },
    { name: Controls.right, keys: ['ArrowRight', 'KeyD'] },
    { name: Controls.brake, keys: ['ArrowDown', 'KeyS'] },
    { name: Controls.handbrake, keys: ['Space'] },
    { name: Controls.camera, keys: ['KeyV', 'KeyC'] },
    { name: Controls.nitro, keys: ['ShiftLeft', 'ShiftRight'] },
    { name: Controls.headlights, keys: ['KeyH'] },
    { name: Controls.indicatorLeft, keys: ['KeyQ'] },
    { name: Controls.indicatorRight, keys: ['KeyE'] },
    { name: Controls.hazard, keys: ['KeyZ'] },
  ], [])

  return (
    <div className="w-full h-screen bg-black relative overflow-hidden flex">
      {/* HUD Overlay - Centered Headline */}
      <div className="absolute top-8 w-full text-center pointer-events-none z-10 flex flex-col items-center">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
        >
          <h1 className="text-5xl font-black text-white tracking-tighter italic">V-DRIVE<span className="text-red-500">PRO</span></h1>
          <p className="text-slate-400 mt-2 font-mono text-sm tracking-widest uppercase">Ferrari Driving Simulator</p>
        </motion.div>
      </div>

      {/* Top Right Floating Buttons */}
      <div className="absolute top-8 right-8 z-20 flex gap-4">
        <button 
          onClick={() => setShowDocsModal(true)}
          className="p-3 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full border border-white/20 text-white transition-all shadow-lg hover:scale-105"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
        </button>

        <button 
          onClick={() => setShowControlsModal(true)}
          className="p-3 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full border border-white/20 text-white transition-all shadow-lg hover:scale-105"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2" ry="2"/><path d="M6 8h.001"/><path d="M10 8h.001"/><path d="M14 8h.001"/><path d="M18 8h.001"/><path d="M8 12h.001"/><path d="M12 12h.001"/><path d="M16 12h.001"/><path d="M7 16h10"/></svg>
        </button>
      </div>

      {/* Controls Modal */}
      <AnimatePresence>
        {showControlsModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md"
            onClick={() => setShowControlsModal(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900/80 backdrop-blur-xl border border-white/10 p-10 rounded-3xl shadow-2xl max-w-2xl w-full mx-4"
            >
              <div className="flex justify-between items-center mb-8 border-b border-white/10 pb-4">
                <h2 className="text-2xl font-black text-white tracking-widest">CONTROLS</h2>
                <button onClick={() => setShowControlsModal(false)} className="text-slate-400 hover:text-white transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                <ControlItem keys={['W', 'A', 'S', 'D']} desc="Drive / Steer" />
                <ControlItem keys={['SPACE']} desc="Hard Brake" />
                <ControlItem keys={['SHIFT']} desc="Nitro Boost" />
                <ControlItem keys={['V']} desc="Change Camera View" />
                <ControlItem keys={['H']} desc="Toggle Headlights" />
                <ControlItem keys={['Q', 'E']} desc="Left / Right Indicators" />
                <ControlItem keys={['Z']} desc="Hazard Lights" />
                <ControlItem keys={['ESC']} desc="Close Menu" />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Start Screen Overlay */}
      <AnimatePresence>
        {!gameStarted && (
          <motion.div 
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/95 backdrop-blur-md"
          >
            <div className="text-center">
              <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-red-700 tracking-tighter mb-4 italic">
                V-DRIVE<span className="text-white">PRO</span>
              </h1>
              <p className="text-slate-400 mb-8 tracking-widest text-sm">CLICK TO INITIALIZE AUDIO ENGINE</p>
              <button 
                onClick={() => setGameStarted(true)}
                className="px-8 py-4 bg-red-600 hover:bg-red-500 text-white font-black tracking-widest rounded-xl transition-all hover:scale-105 active:scale-95 shadow-[0_0_40px_rgba(220,38,38,0.4)]"
              >
                START ENGINE
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Docs Modal */}
      <AnimatePresence>
        {showDocsModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md py-10"
            onClick={() => setShowDocsModal(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900/90 backdrop-blur-xl border border-white/10 p-10 rounded-3xl shadow-2xl max-w-4xl w-full mx-4 max-h-full overflow-y-auto overflow-x-hidden custom-scrollbar"
            >
              <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
                <h2 className="text-2xl font-black text-white tracking-widest">PREMIUM CONTROLLER DOCS</h2>
                <button onClick={() => setShowDocsModal(false)} className="text-slate-400 hover:text-white transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
              </div>

              <div className="text-slate-300 space-y-8">
                 <section>
                   <h3 className="text-lg font-bold text-white mb-3 border-b border-white/10 pb-1">Gear Shifting Logic</h3>
                   <div className="grid grid-cols-5 gap-2 text-sm font-mono bg-white/5 p-4 rounded-lg">
                     <span className="font-bold text-slate-400">Gear</span><span className="font-bold text-slate-400">Ratio</span><span className="font-bold text-slate-400">Max Speed</span><span className="font-bold text-slate-400">Shift Up</span><span className="font-bold text-slate-400">Shift Down</span>
                     <span className="text-red-400">R</span><span>420</span><span>~60 km/h</span><span>-</span><span>-</span>
                     <span className="text-white">1st</span><span>420</span><span>~60 km/h</span><span className="text-blue-300">7500 RPM</span><span>-</span>
                     <span className="text-white">2nd</span><span>250</span><span>~100 km/h</span><span className="text-blue-300">7500 RPM</span><span className="text-red-300">3000 RPM</span>
                     <span className="text-white">3rd</span><span>166</span><span>~150 km/h</span><span className="text-blue-300">7500 RPM</span><span className="text-red-300">3000 RPM</span>
                     <span className="text-white">4th</span><span>113</span><span>~220 km/h</span><span className="text-blue-300">7500 RPM</span><span className="text-red-300">3000 RPM</span>
                     <span className="text-white">5th</span><span>74</span><span>~330 km/h</span><span className="text-blue-300">7500 RPM</span><span className="text-red-300">3000 RPM</span>
                     <span className="text-white">6th</span><span>45</span><span>~450 km/h</span><span>-</span><span className="text-red-300">3000 RPM</span>
                   </div>
                 </section>

                 <section>
                   <h3 className="text-lg font-bold text-white mb-3 border-b border-white/10 pb-1">Light On/Off Rules</h3>
                   <ul className="list-disc pl-5 space-y-2 text-sm">
                     <li><strong className="text-white">Headlights (H):</strong> Toggles front spotlights for night driving.</li>
                     <li><strong className="text-white">Brake Lights (Space):</strong> Glows bright red instantly when braking or reversing.</li>
                     <li><strong className="text-white">Reverse Lights:</strong> Turns white automatically when in Reverse gear.</li>
                     <li><strong className="text-white">Indicators (Q/E):</strong> Blinks orange. Automatically disables the opposite side indicator.</li>
                     <li><strong className="text-white">Hazards (Z):</strong> Blinks both sides simultaneously. Overrides indicators.</li>
                   </ul>
                 </section>

                 <section>
                   <h3 className="text-lg font-bold text-white mb-3 border-b border-white/10 pb-1">Physics & Camera</h3>
                   <ul className="list-disc pl-5 space-y-2 text-sm">
                     <li><strong className="text-white">Torque Curves:</strong> Engine power scales realistically, peaking at 5000 RPM and dropping near redline to force shifts.</li>
                     <li><strong className="text-white">G-Forces:</strong> Chassis dynamically rolls (leans) based on current speed and steering angle.</li>
                     <li><strong className="text-white">Anti-Judder Camera:</strong> Camera is parented to the interpolated RigidBody mesh to completely eliminate 144Hz vs 60Hz physics stutter.</li>
                     <li><strong className="text-white">Nitro FOV:</strong> Activating Nitro physically widens the camera field-of-view for an intense tunnel-vision speed sensation.</li>
                   </ul>
                 </section>
               </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute bottom-10 left-10 pointer-events-none z-10 text-left font-mono bg-white/50 backdrop-blur-md p-5 rounded-xl shadow-2xl border border-white/20 w-64">
        <p className="text-slate-700 font-black text-xs tracking-[0.2em] mb-3 border-b border-slate-400/30 pb-2">VEHICLE TELEMETRY</p>
        
        <div className="flex items-end gap-2 mb-2">
          <span id="hud-speed" className="text-slate-900 font-black text-4xl leading-none">0</span>
          <span className="text-slate-700 font-bold text-sm mb-1">KM/H</span>
        </div>
        
        <div className="flex justify-between items-center mb-1">
          <p className="text-slate-700 font-bold text-sm">GEAR</p>
          <span id="hud-gear" className="text-red-600 font-black text-xl">N</span>
        </div>
        
        <div className="flex justify-between items-center mb-4">
          <p className="text-slate-700 font-bold text-sm">RPM</p>
          <span id="hud-rpm" className="text-slate-900 font-bold text-md">1000</span>
        </div>

        {/* Nitro Bar */}
        <div className="mt-3">
          <div className="flex justify-between items-center mb-1">
            <p className="text-slate-700 font-bold text-xs tracking-widest">NITRO</p>
            <span id="hud-nitro-text" className="text-blue-600 font-bold text-xs">100%</span>
          </div>
          <div className="w-full bg-slate-300 rounded-full h-1.5 overflow-hidden">
            <div id="hud-nitro-bar" className="bg-blue-600 h-1.5 w-full transition-all duration-75"></div>
          </div>
        </div>

        {/* Light Indicators */}
        <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-400/30">
          <div className="flex gap-2">
            <div id="hud-ind-left" className="w-3 h-3 rounded-full bg-slate-400/50"></div>
            <div id="hud-headlights" className="w-3 h-3 rounded-full bg-slate-400/50"></div>
            <div id="hud-ind-right" className="w-3 h-3 rounded-full bg-slate-400/50"></div>
          </div>
          <p className="text-slate-600 font-bold text-xs">CAMERA: <span className="text-blue-700">{cameraView.replace('_', ' ')}</span></p>
        </div>
      </div>

      {/* 3D Scene */}
      <div className="flex-1 h-full relative">
        <KeyboardControls map={controlMap}>
          <CameraController onToggle={setCameraView} />
          <Canvas shadows camera={{ position: [0, 5, -10], fov: 60 }}>
            {/* Daytime Environment */}
            <color attach="background" args={['#87CEEB']} />
            <fog attach="fog" args={['#87CEEB', 20, 150]} />
            
            <ambientLight intensity={1.5} />
            <directionalLight 
              position={[100, 100, -100]} 
              intensity={2.5} 
              castShadow 
              shadow-mapSize={[2048, 2048]} 
            >
              <orthographicCamera attach="shadow-camera" args={[-150, 150, 150, -150, 0.1, 500]} />
            </directionalLight>
            
            <Suspense fallback={null}>
              <Physics>
                {gameStarted && <ProceduralCar color="#ef4444" cameraView={cameraView} />}

                {/* Massive Asphalt Ground */}
                <RigidBody type="fixed" colliders="cuboid" restitution={0.2} friction={0}>
                  <mesh position={[0, -5, 0]} receiveShadow>
                    <boxGeometry args={[2000, 10, 2000]} />
                    <meshStandardMaterial color="#333333" roughness={0.9} metalness={0.1} />
                  </mesh>
                  {/* Grid overlay for speed sensation */}
                  <gridHelper args={[2000, 200, '#555555', '#444444']} position={[0, 0.01, 0]} />
                </RigidBody>
              </Physics>

              <Environment preset="night" />
              
            </Suspense>
          </Canvas>
        </KeyboardControls>
      </div>
    </div>
  )
}

export default App
