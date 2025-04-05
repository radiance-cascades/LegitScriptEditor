import {
  Framegraph,
  FramegraphPass,
  GPUState,
  LegitScriptFrameResult,
  LegitScriptContextInput,
  LegitScriptContextRequest,
  LegitScriptShaderDesc,
  LegitScriptLoadResult,
  RaisesErrorFN,
  LegitScriptDeclaration,
} from "./types.js"

// @ts-ignore
import LegitScriptCompiler from "./LegitScript/LegitScriptWasm.js"
import {
  ImageCache,
  ImageCacheAllocatedImage,
  ImageCacheGetImage,
} from "./image-cache.js"

import {
  FailedCompilationResult,
  CreateRasterProgram,
} from "./webgl-shader-compiler.js"

import { SourceAssembler } from "./source-assembler.js"

import {
  ProcessScriptImageRequests,
  RunScriptInvocations,
  SetBlendMode,
} from "./legit-script-io.js"

export type CoreState = {
  gpu: GPUState
  framegraph: Framegraph
  legitScriptCompiler: any
  processedRequests: LegitScriptContextInput[]
  imageCache: ImageCache
  hasCompiledOnce: boolean
}


export function CompileLegitScript(
  legitScriptCompiler: LegitScriptCompiler,
  content: string
): LegitScriptLoadResult | false {
  try {
    const r = JSON.parse(legitScriptCompiler.LegitScriptLoad(content))
    return r
  } catch (e) {
    console.error(e)
    return false
  }
}

function LegitScriptFrame(
  legitScriptCompiler: LegitScriptCompiler,
  processedRequests: LegitScriptContextInput[]
): LegitScriptFrameResult | false {
  try {
    const raw = legitScriptCompiler.LegitScriptFrame(
      JSON.stringify(processedRequests)
    )
    return JSON.parse(raw)
  } catch (e) {
    console.error(e)
    return false
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

  const extensions = [
    "EXT_color_buffer_float", //for fp32 rendertargets
    "EXT_color_buffer_half_float", //for fp16 rendertargets
    "OES_texture_float", //intended to have fp32 sampled textures but looks like it doesn't work
    "EXT_float_blend" //fixes a firefox warning when rendering into fp textures
  ]
  for (const extensionName of extensions) {
    const extension = gl.getExtension(extensionName)
    if (!extension) {
      raiseError(`${extensionName} could not be loaded`)
    }
  }


  const res = CreateRasterProgram(
    gl,
    `#version 300 es
    precision highp float;
    precision highp sampler2D;
    uniform sampler2D tex;
    out vec4 out_color;
    void main()
    {
      //out_color = vec4(texelFetch(tex, ivec2(gl_FragCoord.xy), 0).rgb, 1.0);
      out_color = vec4(pow(clamp(texelFetch(tex, ivec2(gl_FragCoord.xy), 0).rgb, vec3(0.0), vec3(1.0)), vec3(1.0 / 2.2)), 1.0);
    }`
  )

  return {
    copyProgram: res.type === "success" ? res.program : null,
    canvas,
    dims: [0, 0],
    gl: gl,
    fullScreenRenderer: CreateFullscreenRenderer(gl),
  }
}

function AssembleShader(
  declarations: LegitScriptDeclaration[],
  shaderDesc: LegitScriptShaderDesc
): SourceAssembler {
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

  var source_assembler = new SourceAssembler()
  source_assembler.addNonSourceBlock(
    `#version 300 es
    precision highp float;
    precision highp sampler2D;\n`
  )

  for (const include of shaderDesc.includes) {
    for (const decl of declarations) {
      if (decl.name == include) {
        source_assembler.addSourceBlock(decl.body.text, decl.body.start)
        break
      }
    }
  }

  source_assembler.addNonSourceBlock(
    `${outputs.join("\n")}
    ${uniforms.join("\n")}
    ${samplers.join("\n")}`
  )
  source_assembler.addNonSourceBlock(`void main(){\n`)
  source_assembler.addSourceBlock(
    `${shaderDesc.body.text}`,
    shaderDesc.body.start
  )
  source_assembler.addNonSourceBlock(`}\n`)
  return source_assembler
}

function CreatePass(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  fragSource: string,
  desc: LegitScriptShaderDesc
): FramegraphPass {
  return {
    fragSource: fragSource,
    blendMode: desc.blend_mode,
    program: program,
    fbo: gl.createFramebuffer(),
    uniforms: desc.uniforms.map(({ name }) => {
      return gl.getUniformLocation(program, name)
    }),
    samplers: desc.samplers.map(({ name }) => {
      return gl.getUniformLocation(program, name)
    }),
    fboAttachmentIds: desc.outs.map((_, i) => gl.COLOR_ATTACHMENT0 + i),
  }
}

export function UpdateFramegraph(
  { gl }: GPUState,
  framegraph: Framegraph,
  result: LegitScriptLoadResult | undefined
): FailedCompilationResult | null {
  if (!result) {
    return null
  }

  for (const desc of result.shader_descs || []) {
    const sourceAssembler = AssembleShader(result.declarations, desc)
    const fragSource = sourceAssembler.getResultText()
    let pass: FramegraphPass = framegraph.passes[desc.name]
    if (pass) {
      if (pass.fragSource === fragSource) {
        continue
      }
    }

    const res = CreateRasterProgram(gl, fragSource)
    if (res.type === "fail") {
      const src_line = sourceAssembler.getSourceLine(res.line)
      return {
        line: src_line ? src_line : 0,
        msg: 'Pass ' + desc.name + ' failed: ' + res.msg,
        type: "fail",
      }
    }
    if (res.type === "success") {
      if (pass?.program) {
        gl.deleteProgram(pass.program)
      }

      framegraph.passes[desc.name] = CreatePass(
        gl,
        res.program,
        fragSource,
        desc
      )
    }
  }
  return null
}

export async function InitCoreState(canvasEl: HTMLCanvasElement) : Promise<CoreState>
{
  const legitScriptCompiler = await LegitScriptCompiler()

  return {
    gpu: InitWebGL(canvasEl, console.error),
    framegraph: {
      passes: {},
    },
    legitScriptCompiler,
    processedRequests: [],
    imageCache: {
      id: 0,
      allocatedImages: new Map<string, ImageCacheAllocatedImage>(),
      requestIdToAllocatedImage: new Map<number, ImageCacheAllocatedImage>(),
    },
    hasCompiledOnce: false
  };
}
//there's no way in gles 3.0 to attach the backbuffer as part of an fbo. so we have to crate a temporary texture instead of the back buffer
//and at the end of the frame copy it onto the back buffer
function CopyTexToSwapchain(gpu: GPUState, tex: WebGLTexture | null) {
  const gl = gpu.gl
  SetBlendMode(gl, "opaque")
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.viewport(0, 0, gpu.canvas.width, gpu.canvas.height)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.useProgram(gpu.copyProgram)
  gpu.fullScreenRenderer()
}

interface ProcessScriptUIRequestsCallback {
  (contextRequests : LegitScriptContextRequest[]) : LegitScriptContextInput[];
}

export function ExecuteFrame(currTime: number, state: CoreState, uiCallback: ProcessScriptUIRequestsCallback, isPlaying: boolean){
  //  state.uiState.filterControls()

  if (!state.hasCompiledOnce) {
    return
  }
  
  if (!isPlaying) {
    return
  }
  const gpu = state.gpu

  // Ensure we're sized properly w.r.t. pixel ratio
  const container = gpu.canvas.parentElement;

  if (!container) {
    throw new Error("canvas must have a container")
  }

  const rect = container.getBoundingClientRect()
  if (gpu.dims[0] !== rect.width || gpu.dims[1] !== rect.height) {
    gpu.dims[0] = rect.width
    gpu.dims[1] = rect.height

    //high DPI multiplier causes texture to fail to create when size is > 2048
    //const width = Math.floor(rect.width * window.devicePixelRatio)
    //const height = Math.floor(rect.height * window.devicePixelRatio)
    const width = rect.width
    const height = rect.height

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

  state.processedRequests.push({
    name: "@swapchain_size",
    type: "uvec2",
    value: { x: gpu.canvas.width, y: gpu.canvas.height },
  })
  state.processedRequests.push({
    name: "@time",
    type: "float",
    value: currTime,
  })

  const legitFrame = LegitScriptFrame(
    state.legitScriptCompiler,
    state.processedRequests
  )
  state.processedRequests = []

  if (legitFrame) {
    try {
      state.processedRequests = uiCallback(legitFrame.context_requests);
      ProcessScriptImageRequests(
        state.imageCache,
        { x: gpu.canvas.width, y: gpu.canvas.height },
        gl,
        legitFrame.context_requests
      )
      RunScriptInvocations(
        state.imageCache,
        state.gpu,
        state.framegraph.passes,
        legitFrame.shader_invocations
      )
      CopyTexToSwapchain(gpu, ImageCacheGetImage(state.imageCache, 0))
    } catch (e) {
      // can console.log/console.error this, but it'll stuck in a busy loop until error resolves
    }
  }
}


export let contextValues: Map<string, any> = new Map();

export let contextDefsFloat:        Set<string> = new Set();
export let contextDefsInt:          Set<string> = new Set();
export let contextDefsBool:         Set<string> = new Set();
export let contextDefsText:         Set<string> = new Set();

export let activeContextVarNames:   Set<string> = new Set();

export function ProcessScriptRequests(
  contextRequests : LegitScriptContextRequest[]) : LegitScriptContextInput[]
{
  var contextInputs : LegitScriptContextInput[] = [];

  contextDefsFloat.clear();
  contextDefsInt.clear();
  contextDefsBool.clear();
  contextDefsText.clear();

  activeContextVarNames.clear();
  let sortIdx = 0;
  for(const request of contextRequests){
    switch(request.type) {
      case 'TextRequest':
        contextDefsText.add(JSON.stringify({...request, sort_idx: sortIdx}));
        sortIdx++;
        break;
      case 'FloatRequest':
        contextInputs.push({
          name : request.name,
          type : 'float',
          value : contextValues.get(request.name) ?? request.def_val
        });
        contextDefsFloat.add(JSON.stringify({...request, sort_idx: sortIdx}));
        activeContextVarNames.add(request.name);
        sortIdx++;
        break;
      case 'IntRequest':
        contextInputs.push({
          name : request.name,
          type : 'int',
          value : contextValues.get(request.name) ?? request.def_val
        });
        contextDefsInt.add(JSON.stringify({...request, sort_idx: sortIdx}));
        activeContextVarNames.add(request.name);
        sortIdx++;
        break;
      case 'BoolRequest':
        contextInputs.push({
          name : request.name,
          type : 'int',
          value : contextValues.get(request.name) ?? request.def_val
        });
        contextDefsBool.add(JSON.stringify({...request, sort_idx: sortIdx}));
        activeContextVarNames.add(request.name);
        sortIdx++;
        break;
    }
  }
  return contextInputs;
}