import { useEffect, useRef } from 'react'
import { presets, vertexShader, type PresetShader } from './shaders'

/**
 * LE FOND ANIME — un quad plein ecran en WebGL2, un fragment shader, zero asset et zero
 * dependance. Repris des briques de da-kit (`ShaderBackground.tsx`, lock 23) et adapte a ce
 * depot sur trois points :
 *
 *   1. LE REPLI. Le template retombait sur une classe `bg-gradient-animated` qui n'existe pas
 *      ici — et un degrade est interdit par la charte. Sans WebGL2, sans GPU, ou si le GLSL ne
 *      compile pas, le canevas est simplement retire : le damier CSS de `index.css` reste, et
 *      la page est complete. Un fond qui manque ne doit jamais laisser un trou.
 *   2. LE MOUVEMENT REDUIT. Le template dessinait une frame figee a t=0 ; ici on ne monte meme
 *      pas le contexte WebGL. Rien a animer, rien a payer.
 *   3. LE COUT. `scale` plafonne la resolution de rendu sous celle de l'ecran : un fragment
 *      shader plein ecran se paie au pixel, et personne ne lit un fond a la loupe.
 *
 * Il se met en pause hors ecran et quand l'onglet est cache, et il rend tout au demontage.
 */
export function FondShader({
  preset,
  bg,
  c1,
  c2,
  scale = 0.7,
}: {
  preset: PresetShader
  /** Les trois couleurs, en hex. Elles viennent des jetons, jamais d'une valeur en dur ici. */
  bg: string
  c1: string
  c2: string
  scale?: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const hex = (h: string): [number, number, number] => {
      const v = h.trim().replace('#', '')
      const n = parseInt(v.length === 3 ? v.split('').map((c) => c + c).join('') : v, 16)
      return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
    }

    const gl = canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      powerPreference: 'low-power',
    })
    if (!gl) return

    const compiler = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('[FondShader]', gl.getShaderInfoLog(s))
        return null
      }
      return s
    }
    const vs = compiler(gl.VERTEX_SHADER, vertexShader)
    const fs = compiler(gl.FRAGMENT_SHADER, presets[preset])
    if (!vs || !fs) return
    const prog = gl.createProgram()!
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[FondShader]', gl.getProgramInfoLog(prog))
      return
    }
    gl.useProgram(prog)
    canvas.style.opacity = '1'

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'a_pos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const u = {
      time: gl.getUniformLocation(prog, 'u_time'),
      res: gl.getUniformLocation(prog, 'u_res'),
      bg: gl.getUniformLocation(prog, 'u_bg'),
      c1: gl.getUniformLocation(prog, 'u_c1'),
      c2: gl.getUniformLocation(prog, 'u_c2'),
      mouse: gl.getUniformLocation(prog, 'u_mouse'),
    }
    gl.uniform3fv(u.bg, hex(bg))
    gl.uniform3fv(u.c1, hex(c1))
    gl.uniform3fv(u.c2, hex(c2))

    // La souris deplace le terrain, et elle le fait AVEC INERTIE : la cible est lue a
    // l'evenement, la valeur la rejoint d'un vingtieme par frame. Un suivi sec donnerait une
    // carte qui sursaute.
    const souris = { x: 0.5, y: 0.5, cx: 0.5, cy: 0.5 }
    const surMouvement = (e: PointerEvent) => {
      souris.cx = e.clientX / window.innerWidth
      souris.cy = 1 - e.clientY / window.innerHeight
    }
    window.addEventListener('pointermove', surMouvement, { passive: true })

    const redimensionner = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2) * scale
      const w = Math.max(1, Math.floor(window.innerWidth * dpr))
      const h = Math.max(1, Math.floor(window.innerHeight * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        gl.viewport(0, 0, w, h)
      }
    }
    redimensionner()
    window.addEventListener('resize', redimensionner)

    let visible = !document.hidden
    const surVisibilite = () => {
      visible = !document.hidden
    }
    document.addEventListener('visibilitychange', surVisibilite)

    let trame = 0
    const depart = performance.now()
    const frame = () => {
      trame = requestAnimationFrame(frame)
      if (!visible) return
      souris.x += (souris.cx - souris.x) * 0.05
      souris.y += (souris.cy - souris.y) * 0.05
      gl.uniform1f(u.time, (performance.now() - depart) / 1000)
      gl.uniform2f(u.res, canvas.width, canvas.height)
      gl.uniform2f(u.mouse, souris.x, souris.y)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    frame()

    return () => {
      cancelAnimationFrame(trame)
      window.removeEventListener('resize', redimensionner)
      window.removeEventListener('pointermove', surMouvement)
      document.removeEventListener('visibilitychange', surVisibilite)
      gl.deleteProgram(prog)
      gl.deleteBuffer(buf)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
    }
  }, [preset, bg, c1, c2, scale])

  // `opacity: 0` tant que le programme n'a pas lie : si quoi que ce soit echoue, le canevas
  // reste invisible et le damier CSS tient la page tout seul.
  return <canvas ref={ref} className="fond-shader" aria-hidden="true" style={{ opacity: 0 }} />
}
