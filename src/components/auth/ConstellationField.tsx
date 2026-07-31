'use client'

import { useEffect, useRef } from 'react'

/**
 * The product's own metaphor as atmosphere: a slow-drifting field of nodes
 * and edges — a knowledge graph — rendered behind the auth scene. Gold points
 * on ink, links fading with distance, a faint pulse travelling the network.
 *
 * Cheap by design (~46 nodes), pauses when the tab is hidden, and collapses to
 * a static frame under prefers-reduced-motion.
 */
export function ConstellationField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let width = 0
    let height = 0
    let dpr = Math.min(window.devicePixelRatio || 1, 2)

    type Node = { x: number; y: number; vx: number; vy: number; r: number; hot: number }
    let nodes: Node[] = []

    const LINK_DIST = 170

    function seed() {
      const count = Math.round(Math.min(52, Math.max(26, (width * height) / 26000)))
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.16,
        vy: (Math.random() - 0.5) * 0.16,
        r: Math.random() * 1.6 + 0.8,
        hot: Math.random(),
      }))
    }

    function resize() {
      const parent = canvas!.parentElement
      width = parent?.clientWidth ?? window.innerWidth
      height = parent?.clientHeight ?? window.innerHeight
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas!.width = width * dpr
      canvas!.height = height * dpr
      canvas!.style.width = `${width}px`
      canvas!.style.height = `${height}px`
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      seed()
    }

    let t = 0

    function frame() {
      t += 0.006
      ctx!.clearRect(0, 0, width, height)

      // edges
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j]
          const dx = a.x - b.x
          const dy = a.y - b.y
          const d = Math.hypot(dx, dy)
          if (d < LINK_DIST) {
            const strength = 1 - d / LINK_DIST
            ctx!.strokeStyle = `rgba(214, 184, 122, ${strength * 0.16})`
            ctx!.lineWidth = 0.6
            ctx!.beginPath()
            ctx!.moveTo(a.x, a.y)
            ctx!.lineTo(b.x, b.y)
            ctx!.stroke()
          }
        }
      }

      // nodes
      for (const n of nodes) {
        if (!reduced) {
          n.x += n.vx
          n.y += n.vy
          if (n.x < 0 || n.x > width) n.vx *= -1
          if (n.y < 0 || n.y > height) n.vy *= -1
        }
        const pulse = 0.55 + 0.45 * Math.sin(t * 2 + n.hot * 7)
        const glow = n.r * (2.6 + pulse * 1.4)
        const g = ctx!.createRadialGradient(n.x, n.y, 0, n.x, n.y, glow)
        g.addColorStop(0, `rgba(226, 198, 138, ${0.5 + pulse * 0.4})`)
        g.addColorStop(1, 'rgba(226, 198, 138, 0)')
        ctx!.fillStyle = g
        ctx!.beginPath()
        ctx!.arc(n.x, n.y, glow, 0, Math.PI * 2)
        ctx!.fill()

        ctx!.fillStyle = `rgba(244, 226, 178, ${0.75 + pulse * 0.2})`
        ctx!.beginPath()
        ctx!.arc(n.x, n.y, n.r, 0, Math.PI * 2)
        ctx!.fill()
      }

      if (reduced) return
      raf = requestAnimationFrame(frame)
    }

    let raf = 0
    resize()
    frame()

    const onResize = () => resize()
    window.addEventListener('resize', onResize)

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf)
      } else if (!reduced) {
        raf = requestAnimationFrame(frame)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  )
}
