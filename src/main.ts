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
  LegitScriptContextInput,
  LegitScriptShaderDesc,
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
  ImageCacheStartFrame,
  ImageCacheProcessRequest,
} from "./image-cache.js"

import {
  FailedCompilationResult,
  CreateRasterProgram
} from "./webgl-shader-compiler.js"

import * as SourceAssembler from "./source-assembler.js"


export type State = {
  editor: any
  gpu: GPUState
  framegraph: Framegraph
  legitScriptCompiler: any
  processedRequests : LegitScriptContextInput[]
  imControlsCallbacks : LegitScriptImmediateModeControlCallbacks
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

const initialContent = `void ColorPass(
  in float r,
  in float g,
  in float b,
  in float p,
  in int width,
  in int height,
  sampler2D background,
  sampler2D tex1,
  sampler2D tex2,
  out vec4 out_color
)
{{
  vec2 complex_sqr(vec2 z) { return vec2(z[0] * z[0] - z[1] * z[1], z[1] * z[0] * 2.); }
  void main()
  {
    vec2 res = vec2(width, height);
    if (gl_FragCoord.x > res.x - 200.0 && gl_FragCoord.y > res.y - 200.0) {

      float mult = 0.2;
      vec2 rel = gl_FragCoord.xy - (res - 200.0);
      vec2 checkerboard = round(fract(rel * mult));
      vec4 a = texelFetch(tex1, ivec2(rel.xy), 0);
      vec4 b = texelFetch(tex2, ivec2(rel.xy), 0);

      out_color = mix(a, b,  checkerboard.x * checkerboard.y);
      return;
    }

    vec2 uv = gl_FragCoord.xy / res.xy;
    float i = gl_FragCoord.x;
    float j = gl_FragCoord.y;
    vec2 s = res;
    int n = int(s.x * 0.5);
    vec2 c = vec2(-0.8, cos(2. * p));
    vec2 z = vec2(i / float(n) - 1., j / float(n) - 1.0) * 2.;
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

void TwoOutputsShader(out vec4 out_color1, out vec4 out_color2)
{{
  void main()
  {
    out_color1 = vec4(1.0f, 0.5f, 0.0f, 1.0f);
    out_color2 = vec4(0.0f, 0.5f, 1.0f, 1.0f);
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


    Image img1 = GetImage(GetSwapchainImage().GetSize(), rgba16f);
    Image img2 = GetImage(GetSwapchainImage().GetSize(), rgba16f);
    TwoOutputsShader(
      img1,
      img2
    );

    ColorPass(
      SliderFloat("R", 0.0f, 1.0f, 0.5f),
      SliderFloat("G", 0.0f, 1.0f, 0.5f),
      SliderFloat("B", 0.0f, 1.0f, 0.5f),
      SliderFloat("P", 0.0f, 2.0f, 0.7f) + frame_idx * 1e-2,
      sc.GetSize().x,
      sc.GetSize().y,
      uvImage,
      img1,
      img2,
      sc
    );


    float dt = GetTime() - ContextFloat("prev_time");
    ContextFloat("prev_time") = GetTime();
    Text("Fps: " + 1000.0 / (1e-7f + SmoothOverTime(dt, "fps_count")));
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
  processedRequests : LegitScriptContextInput[]
): LegitScriptFrameResult | false {
  try {
    const raw = legitScriptCompiler.LegitScriptFrame(JSON.stringify(processedRequests))
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



function InitWebGL(
  canvas: HTMLCanvasElement,
  raiseError: RaisesErrorFN
): GPUState {
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

  const extensions = ["EXT_color_buffer_float", "EXT_color_buffer_half_float"]
  for (const extensionName of extensions) {
    const extension = gl.getExtension(extensionName)
    if (!extension) {
      raiseError(`${extensionName} could not be loaded`)
    }
  }

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

function AssembleShader(shaderDesc : LegitScriptShaderDesc) : SourceAssembler.SourceAssembler
{
  const outputs = shaderDesc.outs.map(
    ({ name, type }, index) =>
      `layout(location=${index}) out ${type} ${name};\n`
  )
  const uniforms = shaderDesc.uniforms.map(
    ({ name, type }) => `uniform ${type} ${name};\n`
  )
  const samplers = shaderDesc.samplers.map(
    ({ name, type }) => `uniform ${type} ${name};`
  )

  var source_assembler = new SourceAssembler.SourceAssembler()
  source_assembler.addNonSourceBlock(
    `#version 300 es
    precision highp float;
    precision highp sampler2D;
    ${outputs.join("\n")}
    ${uniforms.join("\n")}
    ${samplers.join("\n")}`
  );
  source_assembler.addSourceBlock(`${shaderDesc.body.text}`, shaderDesc.body.start);  
  return source_assembler
}

function UpdateFramegraph(
  { gl }: GPUState,
  framegraph: Framegraph,
  result: LegitScriptLoadResult | undefined,
) : FailedCompilationResult | null {
  if (!result) {
    return null
  }

  for (const desc of result.shader_descs || []) {

    const sourceAssembler = AssembleShader(desc)
    const fragSource = sourceAssembler.getResultText()
    let pass: FramegraphPass = framegraph.passes[desc.name]
    if (pass) {
      if (pass.fragSource === fragSource) {
        continue
      }
    }

    const res = CreateRasterProgram(gl, fragSource)
    if (res.type === 'fail') {
      const src_line = sourceAssembler.getSourceLine(res.line);
      return {
        line : src_line ? src_line : 0,
        msg : res.msg,
        type: 'fail'
      }
      /*raiseError(
        `Compilation of ${desc.name} failed at line ${src_line} with error ${res.msg}`
      )*/

      continue
    }
    if(res.type === 'success')
    {
      if (pass?.program) {
        gl.deleteProgram(pass.program)
      }

      framegraph.passes[desc.name] = {
        fragSource,
        program : res.program,
        uniforms: desc.uniforms.map(({ name }) => {
          return gl.getUniformLocation(res.program, name)
        }),
        samplers: desc.samplers.map(({ name }) => {
          return gl.getUniformLocation(res.program, name)
        }),
        fboAttachmentIds: desc.outs.map((_, i) => gl.COLOR_ATTACHMENT0 + i),
      }
    }
  }
  return null
}


function AttachDragger(
  dragEl: HTMLElement,
  resizeTarget: HTMLElement,
  cb: (rect: DOMRect) => void
) {

  const dragWidth = dragEl.getBoundingClientRect().width

  let down = false
  dragEl.addEventListener(
    "mousedown",
    (e) => {
      down = true
      e.preventDefault()
    },
    { passive: false }
  )
  window.addEventListener("mouseup", (_) => {
    down = false
  })
  window.addEventListener("mousemove", (e) => {
    const parentEl = dragEl.parentElement
    if (!down || !parentEl) {
      return
    }

    const parentRect = parentEl.getBoundingClientRect()
    const parentLeft = parentRect.left
    const newWidth = e.clientX - parentLeft - dragWidth / 2
    resizeTarget.style.width = `${newWidth.toFixed(0)}px`
    resizeTarget.style.flexGrow = "0"
    parentRect.width = newWidth
    cb(parentRect)
  })
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

function SetEditorSquiggies(
  decorations : monaco.editor.IEditorDecorationsCollection,
  editor : monaco.editor.IStandaloneCodeEditor,
  line : number,
  column : number,
  desc : string){
  
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
      if(line > 0) //line = 0 usually means we failed to find it
        editor.revealLineInCenter(line)
    }
  }
}
function UnsetEditorSquiggies(
  decorations : monaco.editor.IEditorDecorationsCollection,
  editor : monaco.editor.IStandaloneCodeEditor){
  const model = editor.getModel()
  if (model) {
    monaco.editor.setModelMarkers(model, "legitscript", [])
    decorations.set([])
  }
}


async function Init(
  editorEl: HTMLElement | null,
  canvasEl: HTMLElement | null,
  controlsEl: HTMLElement | null,
  draggerEl: HTMLElement | null
) {
  if (!editorEl || !canvasEl || !controlsEl || !draggerEl) {
    throw new Error("please provide an editor element and canvas element")
  }

  const legitScriptCompiler = await LegitScriptCompiler()

  const editor = InitEditor(editorEl)
  if (!editor) {
    throw new Error("could not initialize monaco")
  }

  const editorResizeHandler = CreateEditorResizeHandler(editor, editorEl)
  window.addEventListener("resize", editorResizeHandler)
  editorResizeHandler()

  AttachDragger(draggerEl, editorEl, (rect: DOMRect) => {
    editor.layout({ width: rect.width, height: rect.height })
  })

  editor.focus()

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

  var imControls = {
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

  const state: State = {
    editor,
    gpu: InitWebGL(canvasEl as HTMLCanvasElement, console.error),
    framegraph: {
      passes: {},
    },
    legitScriptCompiler,
    processedRequests: [],
    imControlsCallbacks : imControls,
    controls: [],
    frameControlIndex: 0,
    imageCache: {
      id: 0,
      allocatedImages: new Map<string, ImageCacheAllocatedImage>(),
      requestIdToAllocatedImage: new Map<number, ImageCacheAllocatedImage>(),
    },
    hasCompiledOnce: false,
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
        SetEditorSquiggies(decorations, editor, line, column, desc);
      } else {
        const model = editor.getModel()
        if (model) {
          monaco.editor.setModelMarkers(model, "legitscript", [])
          decorations.set([])
        }
        const err = UpdateFramegraph(state.gpu, state.framegraph, compileResult)
        if(err)
        {
          SetEditorSquiggies(decorations, editor, err.line, 0, err.msg);
        }else
        {
          state.hasCompiledOnce = true
          UnsetEditorSquiggies(decorations, editor);
        }
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

  state.processedRequests.push({
    name : '@swapchain_size',
    type : 'ivec2',
    value : {x : gpu.canvas.width, y: gpu.canvas.height}
  });
  state.processedRequests.push({
    name : '@time',
    type : 'float',
    value : dt
  });
  
  
  const legitFrame = LegitScriptFrame(
    state.legitScriptCompiler,
    state.processedRequests
  )
  state.processedRequests = []

  if (legitFrame) {
    try {
      ImageCacheStartFrame(
        state.gpu.gl,
        state.imageCache,
      )
      for(const request of legitFrame.context_requests){
        if(request.type === 'CachedImageRequest'){
          ImageCacheProcessRequest(
            state.gpu.gl,
            state.imageCache,
            request,
            console.error
          )
        }
        if(request.type == 'FloatRequest'){
          state.processedRequests.push({
            name : request.name,
            type : 'float',
            value : state.imControlsCallbacks.floatSlider(request.name, request.def_val, request.min_val, request.max_val)
          });
        }
        if(request.type == 'IntRequest'){
          state.processedRequests.push({
            name : request.name,
            type : 'int',
            value : state.imControlsCallbacks.intSlider(request.name, request.def_val, request.min_val, request.max_val)
          });
        }
        if(request.type == 'TextRequest'){
          state.imControlsCallbacks.text(request.text)
        }
        if(request.type == 'BoolRequest'){
          state.processedRequests.push({
            name : request.name,
            type : 'int',
            value : 1 //TODO: actually make a checkbox
          });
        }
        if(request.type == 'LoadedImageRequest'){
          //TODO: figure this out
        }
      }
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
          for (
            let attachmentIndex = 0;
            attachmentIndex < invocation.color_attachments.length;
            attachmentIndex++
          ) {
            const attachment = invocation.color_attachments[attachmentIndex]
            const target = ImageCacheGetImage(state.imageCache, attachment.id)
            gl.framebufferTexture2D(
              gl.FRAMEBUFFER,
              pass.fboAttachmentIds[attachmentIndex],
              gl.TEXTURE_2D,
              target,
              0
            )
          }
          // TODO: handle framebuffer completeness
          gl.drawBuffers(pass.fboAttachmentIds)
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
    automaticLayout: false,
    theme: "vs-dark",
    glyphMargin: false,
  })

  return editor
}

function CreateEditorResizeHandler(
  editor: monaco.editor.IStandaloneCodeEditor,
  editorEl: HTMLElement
) {
  return () => {
    // editor.layout({ width: 0, height: 0 })
    window.requestAnimationFrame(() => {
      const { width, height } = editorEl.getBoundingClientRect()
      editor.layout({ width, height })
    })
  }
}

Init(
  document.querySelector("#editor"),
  document.querySelector("output canvas"),
  document.querySelector("controls"),
  document.querySelector("divider")
)
