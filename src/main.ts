import "./style.css"
import * as monaco from "monaco-editor"
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker"
import {
  Framegraph,
  FramegraphPass,
  GPUState,
  ImmediateModeControl,
  ImmediateModeControlType,
  LegitScriptFrameResult,
  LegitScriptImmediateModeControlCallbacks,
  LegitScriptLoadResult,
  RaisesErrorFN,
} from "./types"

// @ts-ignore
import LegitScriptCompiler from "./LegitScript/LegitScriptWasm.js"
import {
  ImageCache,
  ImageCacheAllocatedImage,
  ImageCacheGetImage,
  ImageCacheProcessRequests,
} from "./image-cache.js"

export type State = {
  editor: any
  gpu: GPUState
  framegraph: Framegraph
  legitScriptCompiler: any
  controls: ImmediateModeControl[]
  frameControlIndex: 0
  imageCache: ImageCache
  hasCompiledOnce: boolean
}

self.MonacoEnvironment = {
  getWorker: function (_moduleId: string, _label: string) {
    return new editorWorker()
  },
}

const initialContent = `void ColorPass(in float r, in float g, in float b, in float p, in int width, in int height, sampler2D background, out vec4 out_color)
{{
  vec2 complex_sqr(vec2 z) { return vec2(z[0] * z[0] - z[1] * z[1], z[1] * z[0] * 2.); }
  void main()
  {
    vec2 res = vec2(width, height);
    vec2 uv = gl_FragCoord.xy / res.xy;
    float i = gl_FragCoord.x;
    float j = gl_FragCoord.y;
    vec2 s = res;
    int n = int(s.x * 0.5);
    vec2 c = vec2(-0.8, cos(2. * p));
    vec2 z = vec2(i / float(n) - 1., j / float(n) - 1.) * 2.;
    int iterations = 0;
    while (sqrt(dot(z, z)) < 20. && iterations < 50) {
      z = complex_sqr(z) + c;
      iterations = iterations + 1;
    }
    vec4 fractal = vec4(float(iterations) - log2(0.5 * log(dot(z, z)) / log(20.0))) * 0.02;
    fractal.a = 1.;
    out_color.rgb = fractal.xyz * vec3(r, g, b);
    out_color.rgb = mix(out_color.rgb , texture(background, uv).rgb, 1.0 - length(out_color.rgb));
    out_color.a = 1.;
  }
}}

void DEBUGPassUV(in int width, in int height, out vec4 out_color)
{{
  vec2 complex_sqr(vec2 z) { return vec2(z[0] * z[0] - z[1] * z[1], z[1] * z[0] * 2.); }
  void main()
  {
    vec2 res = vec2(width, height);
    vec2 uv = gl_FragCoord.xy / res.xy;
    out_color = vec4(uv, 0.0, 1.0);
  }
}}

[declaration: "smoothing"]
{{
  float SmoothOverTime(float val, string name, float ratio = 0.95)
  {
    ContextVec2(name) = ContextVec2(name) * ratio + vec2(val, 1) * (1.0 - ratio);
    return ContextVec2(name).x / (1e-7f + ContextVec2(name).y);
  }
}}

[rendergraph]
[include: "smoothing"]
void RenderGraphMain()
{{
  void main()
  {
    Image img = GetImage(ivec2(128, 128), rgba8);
    Image sc = GetSwapchainImage();
    int a = SliderInt("Int param", -42, 42, 7);
    float b = SliderFloat("Float param", -42.0f, 42.0f);
    int frame_idx = ContextInt("frame_idx")++;

    Image uvImage = GetImage(sc.GetSize(), rgba8);

    DEBUGPassUV(
      uvImage.GetSize().x,
      uvImage.GetSize().y,
      uvImage
    );

    ColorPass(
      SliderFloat("R", 0.0f, 1.0f, 0.5f),
      SliderFloat("G", 0.0f, 1.0f, 0.5f),
      SliderFloat("B", 0.0f, 1.0f, 0.5f),
      SliderFloat("P", 0.0f, 2.0f, 0.7f) + frame_idx * 1e-2,
      sc.GetSize().x,
      sc.GetSize().y,
      uvImage,
      sc
    );


    float dt = GetTime() - ContextFloat("prev_time");
    ContextFloat("prev_time") = GetTime();
    Text("Fps: " + 1000.0 / SmoothOverTime(dt, "fps_count"));
    Text("dims: " + sc.GetSize().x + ", " + sc.GetSize().y);
  }
}}
`

function CompileLegitScript(
  legitScriptCompiler: LegitScriptCompiler,
  editor: monaco.editor.ICodeEditor,
  imControls: LegitScriptImmediateModeControlCallbacks
): LegitScriptLoadResult | false {
  try {
    const content = editor.getModel()?.createSnapshot().read() || ""
    const r = JSON.parse(
      legitScriptCompiler.LegitScriptLoad(content, imControls)
    )
    return r
  } catch (e) {
    console.error(e)
    return false
  }
}

function LegitScriptFrame(
  legitScriptCompiler: LegitScriptCompiler,
  width: number,
  height: number,
  time: number
): LegitScriptFrameResult | false {
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
  return function () {
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
  result: LegitScriptLoadResult | undefined,
  raiseError: RaisesErrorFN
) {
  if (!result) {
    return
  }

  for (const desc of result.shader_descs || []) {
    const outputs = desc.outs.map(({ name, type }) => `out ${type} ${name};\n`)
    const uniforms = desc.uniforms.map(
      ({ name, type }) => `uniform ${type} ${name};\n`
    )
    const samplers = desc.samplers.map(
      ({ name, type }) => `uniform ${type} ${name};`
    )

    const fragSource = `#version 300 es
      precision highp float;
      precision highp sampler2D;
      ${outputs.join("\n")}
      ${uniforms.join("\n")}
      ${samplers.join("\n")}
      ${desc.body.text}
    `

    let pass: FramegraphPass = framegraph.passes[desc.name]
    if (pass) {
      if (pass.fragSource === fragSource) {
        continue
      }
    }

    const program = CreateRasterProgram(gl, fragSource)
    if (!program) {
      raiseError(
        `CreateRasterProgram returned an invalid program\nsource:\n${fragSource}`
      )

      continue
    }

    if (pass?.program) {
      gl.deleteProgram(pass.program)
    }

    framegraph.passes[desc.name] = {
      fragSource,
      program,
      uniforms: desc.uniforms.map(({ name }) => {
        return gl.getUniformLocation(program, name)
      }),
      samplers: desc.samplers.map(({ name }) => {
        return gl.getUniformLocation(program, name)
      }),
    }
  }
}

function RaiseError(err: string) {
  console.error("RaiseError:", err)
}

function SliderControlCreate(
  name: string,
  value: string,
  lo: string,
  hi: string
): HTMLElement {
  const el = document.createElement("control")

  const nameEl = document.createElement("span")
  nameEl.setAttribute("class", "name")
  nameEl.innerText = ` ${name} `
  el.append(nameEl)

  const inputEl = document.createElement("input")
  inputEl.setAttribute("type", "range")
  inputEl.setAttribute("min", lo)
  inputEl.setAttribute("max", hi)
  inputEl.setAttribute("value", value)
  // TODO: compute this based on slider width
  const step = 0.001
  inputEl.setAttribute("step", step + "")
  el.append(inputEl)

  const labelEl = document.createElement("span")
  labelEl.setAttribute("class", "value")
  labelEl.innerText = ` (${value}) `
  el.append(labelEl)
  return el
}

async function Init(
  editorEl: HTMLElement | null,
  canvasEl: HTMLElement | null,
  controlsEl: HTMLElement | null
) {
  if (!editorEl || !canvasEl || !controlsEl) {
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
    gpu: InitWebGL(canvasEl as HTMLCanvasElement),
    framegraph: {
      passes: {},
    },
    legitScriptCompiler,
    controls: [],
    frameControlIndex: 0,
    imageCache: {
      id: 0,
      allocatedImages: new Map<string, ImageCacheAllocatedImage>(),
      requestIdToAllocatedImage: new Map<number, ImageCacheAllocatedImage>(),
    },
    hasCompiledOnce: false,
  }

  function Control(
    type: ImmediateModeControlType,
    name: string | null
  ): ImmediateModeControl {
    if (state.frameControlIndex < state.controls.length) {
      const currentControl = state.controls[state.frameControlIndex]
      if (currentControl && currentControl.type === type) {
        if (currentControl.name === name || type === "text") {
          state.frameControlIndex++
          currentControl.isAlive = true
          return currentControl
        }
      }
    }

    const currentControl: ImmediateModeControl = {
      type,
      name,
      isAlive: true,
    }

    state.controls.push(currentControl)
    return currentControl
  }

  const imControls = {
    floatSlider(name: string, prevValue: number, lo: number, hi: number) {
      const control = Control("float", name)
      if (!control.el) {
        control.el = SliderControlCreate(name, prevValue + "", lo + "", hi + "")
        controlsEl.append(control.el)
      }

      let value = prevValue
      const valueDisplayEl = control.el.querySelector(".value") as HTMLElement
      const inputEl = control.el.querySelector("input")
      if (valueDisplayEl && inputEl) {
        value = parseFloat(inputEl.value)
        valueDisplayEl.innerText = ` (${value})`
      }
      return value
    },
    intSlider(name: string, prevValue: number, lo: number, hi: number) {
      const control = Control("float", name)
      if (!control.el) {
        control.el = SliderControlCreate(name, prevValue + "", lo + "", hi + "")
        controlsEl.append(control.el)
      }

      let value = prevValue
      const valueDisplayEl = control.el.querySelector(".value") as HTMLElement
      const inputEl = control.el.querySelector("input")
      if (valueDisplayEl && inputEl) {
        value = parseFloat(inputEl.value)
        valueDisplayEl.innerText = ` (${value})`
      }
      return value
    },
    text(value: string) {
      const control = Control("float", null)
      if (!control.el) {
        control.el = document.createElement("control")
        controlsEl.append(control.el)
      }

      control.el.innerText = value
    },
  }

  const decorations = editor.createDecorationsCollection([])
  const typingDebouncer = createDebouncer(100, () => {
    const compileResult = CompileLegitScript(
      legitScriptCompiler,
      editor,
      imControls
    )
    if (compileResult) {
      if (compileResult.error) {
        console.error("compileResult", compileResult)
        const { line, column, desc } = compileResult.error

        decorations.set([
          {
            range: new monaco.Range(line, 1, line, 1),
            options: {
              isWholeLine: true,
              className: "compileErrorGlyph",
              glyphMarginClassName: "compileErrorBackground",
            },
          },
        ])

        const markers = [
          {
            message: desc,
            severity: monaco.MarkerSeverity.Error,
            startLineNumber: line,
            startColumn: column,
            endLineNumber: line,
            endColumn: column + 1,
          },
        ]

        const model = editor.getModel()
        if (model) {
          monaco.editor.setModelMarkers(model, "legitscript", markers)
          const visibleRange = editor.getVisibleRanges()[0]
          if (
            !visibleRange ||
            visibleRange.startLineNumber > line ||
            visibleRange.endLineNumber < line
          ) {
            editor.revealLineInCenter(line)
          }
        }
      } else {
        state.hasCompiledOnce = true
        const model = editor.getModel()
        if (model) {
          monaco.editor.setModelMarkers(model, "legitscript", [])
          decorations.set([])
        }
        UpdateFramegraph(state.gpu, state.framegraph, compileResult, RaiseError)
      }
    }
  })

  editor.getModel()?.onDidChangeContent(typingDebouncer)
  requestAnimationFrame((dt) => ExecuteFrame(dt, state))
}

function ExecuteFrame(dt: number, state: State) {
  if (!state.hasCompiledOnce) {
    // TODO: render a placeholder image "sorry, the shader didn't compile" or something
    requestAnimationFrame((dt) => ExecuteFrame(dt, state))
    return
  }

  const gpu = state.gpu

  // TODO: fix this, position:relative causes pain w.r.t. flexbox
  // Ensure we're sized properly w.r.t. pixel ratio
  const rect = gpu.container.getBoundingClientRect()
  if (gpu.dims[0] !== rect.width || gpu.dims[1] !== rect.height) {
    gpu.dims[0] = rect.width
    gpu.dims[1] = rect.height

    const width = Math.floor(rect.width * window.devicePixelRatio)
    const height = Math.floor(rect.height * window.devicePixelRatio)

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

  // remove dead controls
  state.controls = state.controls.filter((control) => {
    if (control.isAlive) {
      control.isAlive = false
      return true
    }

    if (control.el) {
      console.log("remove control", control)
      control.el.remove()
    }
    return false
  })
  state.frameControlIndex = 0

  const legitFrame = LegitScriptFrame(
    state.legitScriptCompiler,
    gpu.canvas.width,
    gpu.canvas.height,
    dt
  )

  if (legitFrame) {
    try {
      ImageCacheProcessRequests(
        state.gpu.gl,
        state.imageCache,
        legitFrame.cached_img_requests,
        console.error
      )
      for (const invocation of legitFrame.shader_invocations) {
        const pass = state.framegraph.passes[invocation.shader_name]
        gl.useProgram(pass.program)

        for (
          let uniformIndex = 0;
          uniformIndex < invocation.uniforms.length;
          uniformIndex++
        ) {
          const uniform = invocation.uniforms[uniformIndex]
          if (!uniform) {
            continue
          }

          switch (uniform.type) {
            case "float": {
              gl.uniform1f(pass.uniforms[uniformIndex], uniform.val)
              break
            }
            case "int": {
              gl.uniform1i(pass.uniforms[uniformIndex], uniform.val)
              break
            }
            default: {
              console.error("ERROR: unhandled uniform type '%s'", uniform.type)
            }
          }
        }

        for (
          let samplerIndex = 0;
          samplerIndex < invocation.image_sampler_bindings.length;
          samplerIndex++
        ) {
          const sampler = invocation.image_sampler_bindings[samplerIndex]
          const handle = ImageCacheGetImage(state.imageCache, sampler.id)
          if (!handle) {
            console.error("missing image from image cache %s", sampler)
          }

          gl.activeTexture(gl.TEXTURE0 + samplerIndex)
          gl.bindTexture(gl.TEXTURE_2D, handle)
          gl.uniform1i(pass.samplers[samplerIndex], samplerIndex)
          gl.bindTexture(gl.TEXTURE_2D, handle)
        }

        // special case for swapchain image
        if (invocation.color_attachments[0].id === 0) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        } else {
          // TODO: bind more than one output
          gl.bindFramebuffer(gl.FRAMEBUFFER, state.gpu.fbo)
          const target = ImageCacheGetImage(
            state.imageCache,
            invocation.color_attachments[0].id
          )
          gl.framebufferTexture2D(
            gl.FRAMEBUFFER,
            // TODO: MRT
            gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D,
            target,
            0
          )
        }

        gl.viewport(0, 0, gpu.canvas.width, gpu.canvas.height)
        gpu.fullScreenRenderer()
      }
    } catch (e) {
      // can console.log/console.error this, but it'll stuck in a busy loop until error resolves
    }
  }

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
    glyphMargin: true,
  })

  return editor
}

Init(
  document.querySelector("#editor"),
  document.querySelector("output canvas"),
  document.querySelector("controls")
)
