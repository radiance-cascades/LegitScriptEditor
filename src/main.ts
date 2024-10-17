import "./style.css"
import * as monaco from "monaco-editor"
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker"
import {
  Framegraph,
  FramegraphPass,
  GPUState,
  LegitScriptLoadResult,
  RaisesErrorFN,
  State,
} from "./types"

import LegitScriptCompiler from "./LegitScript/LegitScriptWasm.js"


self.MonacoEnvironment = {
  getWorker: function (_moduleId: string, _label: string) {
    return new editorWorker()
  },
}

const initialContent = `
void ColorPass(in float r, in float g, in float b, out vec4 out_color)
{{
  void main()
  {
    out_color = vec4(r, g, b + 0.5f, 1.0f);
  }
}}

[rendergraph]
void RenderGraphMain()
{{
  void main()
  {
    Image img = GetImage(ivec2(128, 128), rgba8);
    ColorPass(
      SliderFloat("R", 0.0f, 1.0f) + 0.5f,
      SliderFloat("G", 0.0f, 1.0f),
      SliderFloat("B", 0.0f, 1.0f),
      GetSwapchainImage());
    int a = SliderInt("Int param", -42, 42, 5);
    float b = SliderFloat("Float param", -42.0f, 42.0f);
    //float e = SliderFloat("Float param", -42.0f, 42.0f);
    Text("script int: " + formatInt(a) + " float: " + formatFloat(b));
  }
}}
`

function CompileLegitScript(
  legitScriptCompiler: LegitScriptCompiler,
  editor: monaco.editor.ICodeEditor
): LegitScriptLoadResult | false {

  const imControls = {
    floatSlider(name, value, lo, hi) {
      // TODO: wire me up
      return value
    },
    intSlider(name, value, lo, hi) {
      // TODO: wire me up
      return value
    },
    text(value) {
      // TODO: wire me up
    }
  }

  try {
    const content = editor.getModel()?.createSnapshot().read() || ""
    const r = JSON.parse(legitScriptCompiler.LegitScriptLoad(content, imControls))
    return r
  } catch (e) {
    console.error(e)
    return false
  }
}

function LegitScriptFrame(legitScriptCompiler: LegitScriptCompiler, width: number, height: number, time: number) {
  try {
    const raw = legitScriptCompiler.LegitScriptFrame(width, height, time)
    return JSON.parse(raw)
  } catch (e) {
    console.error(e)
    return false
  }
}

function createDebouncer(delay: number, fn: () => void) {
  let handle = setTimeout(fn, delay)
  return function() {
    handle && clearTimeout(handle)
    handle = setTimeout(fn, delay)
  }
}


function CreateFullscreenRenderer(gl: WebGL2RenderingContext) {
  const vertexBuffer = new Float32Array([-1, -1, -1, 4, 4, -1])
  const vao = gl.createVertexArray()

  gl.bindVertexArray(vao)
  var buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, vertexBuffer, gl.STATIC_DRAW)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  gl.enableVertexAttribArray(0)
  gl.bindVertexArray(null)
  return function RenderFullscreenTriangle() {
    gl.disable(gl.DEPTH_TEST)
    gl.bindVertexArray(vao)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
}

// TODO: we can probably reuse the vertex shader...
function CreateRasterProgram(
  gl: WebGL2RenderingContext,
  frag: string
): WebGLProgram | undefined {
  const vert = `#version 300 es
    layout (location=0) in vec2 position;
    out vec2 uv;
    void main() {
      uv = position.xy * 0.5 + 0.5;
      gl_Position = vec4(position, 0, 1.0);
    }
  `

  const fragShader = gl.createShader(gl.FRAGMENT_SHADER)
  if (!fragShader) {
    console.error("failed to create frag shader")
    return
  }

  gl.shaderSource(fragShader, frag)
  gl.compileShader(fragShader)
  if (!gl.getShaderParameter(fragShader, gl.COMPILE_STATUS)) {
    console.error("FRAGMENT SHADER", gl.getShaderInfoLog(fragShader))
    return
  }

  const vertShader = gl.createShader(gl.VERTEX_SHADER)

  if (!vertShader) {
    console.error("failed to create vertex shader")
    return
  }

  gl.shaderSource(vertShader, vert)
  gl.compileShader(vertShader)
  if (!gl.getShaderParameter(vertShader, gl.COMPILE_STATUS)) {
    console.error("VERTEX SHADER", gl.getShaderInfoLog(vertShader))
    return
  }

  const program = gl.createProgram()
  if (!program) {
    console.error("failed to create webgl program")
    return
  }

  gl.attachShader(program, fragShader)
  gl.attachShader(program, vertShader)
  gl.linkProgram(program)

  gl.deleteShader(fragShader)
  gl.deleteShader(vertShader)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program))
    return
  }

  return program
}

function InitWebGL(canvas: HTMLCanvasElement): GPUState {
  const options = {
    premultipliedAlpha: true,
    alpha: true,
    antialias: true,
  }

  Object.assign(canvas.style, {
    left: 0,
    top: 0,
    margin: 0,
    padding: 0,
    "pointer-events": "none",
    position: "absolute",
  })

  const gl = canvas.getContext("webgl2", options) as WebGL2RenderingContext
  // a reusable fbo
  const fbo = gl.createFramebuffer()
  if (!fbo) {
    throw new Error("could not create a single fbo")
  }
  const container = canvas.parentElement

  if (!container) {
    throw new Error("canvas must have a container")
  }

  return {
    container,
    canvas,
    dims: [0, 0],
    gl: gl,
    fbo,
    fullScreenRenderer: CreateFullscreenRenderer(gl),
  }
}

function UpdateFramegraph(
  { gl }: GPUState,
  framegraph: Framegraph,
  result: LegitScriptLoadResult,
  raiseError: RaisesErrorFN
) {

  framegraph.executionOrder = []
  for (const desc of result.shader_descs) {
    // TODO: compute this via dependencies
    framegraph.executionOrder.push(desc.name)

    const outputs = desc.outs.map(({ name, type }) => `out ${type} ${name};\n`)
    const uniforms = desc.uniforms.map(
      ({ name, type }) => `uniform ${type} ${name};\n`
    )

    const fragSource = `#version 300 es
      precision highp float;
      ${outputs.join("\n")}
      ${uniforms.join("\n")}
      ${desc.body}
    `

    let pass: FramegraphPass = framegraph.passes[desc.name]
    if (pass) {
      if (pass.fragSource === fragSource) {
        continue
      }
    }

    const program = CreateRasterProgram(gl, fragSource)
    if (!program) {
      raiseError("CreateRasterProgram returned an invalid program")
      continue
    }

    if (pass?.program) {
      gl.deleteProgram(pass.program)
    }

    framegraph.passes[desc.name] = {
      fragSource,
      program,
    }
  }

  console.log(framegraph)
}

function RaiseError(err: string) {
  console.error("RaiseError:", err)
}

async function Init(
  editorEl: HTMLElement | null,
  canvasEl: HTMLCanvasElement | null
) {
  if (!editorEl || !canvasEl) {
    throw new Error("please provide an editor element and canvas element")
  }

  const legitScriptCompiler = await LegitScriptCompiler()

  const editor = InitEditor(editorEl)
  if (!editor) {
    throw new Error("could not initialize monaco")
  }

  editor.focus()

  const state: State = {
    editor,
    gpu: InitWebGL(canvasEl),
    framegraph: {
      passes: {},
      executionOrder: []
    },
    legitScriptCompiler
  }

  // Initial compilation
  {
    const compileResult = CompileLegitScript(legitScriptCompiler, editor)
    if (compileResult) {
      UpdateFramegraph(state.gpu, state.framegraph, compileResult, RaiseError)
    }
  }

  const typingDebouncer = createDebouncer(250, () => {
    const compileResult = CompileLegitScript(legitScriptCompiler, editor)
    if (compileResult) {
      UpdateFramegraph(state.gpu, state.framegraph, compileResult, RaiseError)
    }
  })

  editor.getModel()?.onDidChangeContent(typingDebouncer)

  requestAnimationFrame((dt) => ExecuteFrame(dt, state))
}

const Floor = Math.floor
function ExecuteFrame(dt: number, state: State) {
  const gpu = state.gpu
  // Ensure we're sized properly w.r.t. pixel ratio
  const rect = gpu.container.getBoundingClientRect()

  if (gpu.dims[0] !== rect.width || gpu.dims[1] !== rect.height) {
    gpu.dims[0] = rect.width
    gpu.dims[1] = rect.height

    const width = Floor(rect.width * window.devicePixelRatio)
    const height = Floor(rect.height * window.devicePixelRatio)

    gpu.canvas.width = width
    gpu.canvas.height = height

    gpu.canvas.style.width = `${rect.width}px`
    gpu.canvas.style.height = `${rect.height}px`
  }

  const gl = gpu.gl
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.viewport(0, 0, gpu.canvas.width, gpu.canvas.height)
  gl.clearColor(0.0, 0.0, 0.0, 1.0)
  gl.clear(gl.COLOR_BUFFER_BIT)

  if (!state.framegraph) {
    return
  }

  const legitFrame = LegitScriptFrame(state.legitScriptCompiler, gpu.canvas.width, gpu.canvas.height, dt)
  if (legitFrame) {
    console.log(legitFrame)
    for (const invocation of legitFrame.shader_invocations) {
      console.log(invocation)
    }
  }

  // for (const passName of state.framegraph?.executionOrder ?? []) {
  //   const pass = state.framegraph.passes[passName]
  //   gl.useProgram(pass.program)
  //   // gl.uniform1f(gl.getUniformLocation(pass.program, "time"), dt * 0.001)

  //   gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  //   gl.viewport(0, 0, gpu.canvas.width, gpu.canvas.height)
  //   gpu.fullScreenRenderer()
  // }
  requestAnimationFrame((dt) => ExecuteFrame(dt, state))
}

function InitEditor(editorEl: HTMLElement) {
  if (!editorEl) {
    return
  }
  const editor = monaco.editor.create(editorEl, {
    value: initialContent || "",
    language: "c",
    minimap: {
      enabled: false,
    },
    tabSize: 2,
    automaticLayout: true,
    theme: "vs-dark",
  })

  return editor
}

Init(
  document.getElementById("editor"),
  document.getElementById("output") as HTMLCanvasElement
)
