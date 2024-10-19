export type GPUState = {
  container: HTMLElement
  canvas: HTMLCanvasElement
  dims: number[]
  gl: WebGL2RenderingContext
  fbo: WebGLFramebuffer
  fullScreenRenderer: () => void
}

export type FramegraphPass = {
  fragSource: string
  program: WebGLProgram
  uniforms: (WebGLUniformLocation | null)[]
  samplers: (WebGLUniformLocation | null)[]
}

export type FramegraphPasses = {
  [PassName: string]: FramegraphPass
}

export type Framegraph = {
  passes: FramegraphPasses
}

export type LegitScriptNameTypePair = {
  name: string
  type: string
}

export type LegitScriptCompiler = {
  LegitScriptFrame: (width: number, height: number, time: number) => void
}

export type LegitScriptShaderOutput = LegitScriptNameTypePair
export type LegitScriptShaderUniform = LegitScriptNameTypePair

export type LegitScriptBlockBody = {
  text: string
  start: number
}

export type LegitScriptDeclaration = {
  name: string
  body: LegitScriptBlockBody
}

export type LegitScriptShaderSampler = {
  name: string
  type: 'sampler2D'
}

export type LegitScriptShaderDesc = {
  body: LegitScriptBlockBody
  name: string
  outs: LegitScriptShaderOutput[]
  uniforms: LegitScriptShaderUniform[]
  samplers: LegitScriptShaderSampler[]
}

export type LegitScriptLoadResult = {
  shader_descs: LegitScriptShaderDesc[]
  declarations: LegitScriptDeclaration[]
  error: {
    line: number
    column: number
    desc: string
  }
}

export type LegitScriptImageRequest = {
  id: number
  pixel_format: string
  size_x: number
  size_y: number
}

export type LegitScriptShaderInvocationColorAttachment = {
  id: number
  mip_start: number
  mip_end: number
}

export type LegitScriptShaderInvocationUniform = {
  type: string
  val: number
}

export type LegitScriptShaderInvocationSamplerBinding = {
  id: number
  // TODO: mip_start, mip_end
};

export type LegitScriptShaderInvocation = {
  color_attachments: LegitScriptShaderInvocationColorAttachment[]
  // unavailable in webgl: image_sampler_bindings
  uniforms: LegitScriptShaderInvocationUniform[]
  image_sampler_bindings: LegitScriptShaderInvocationSamplerBinding[]
  shader_name: string
}

export type LegitScriptFrameResult = {
  cached_img_requests: LegitScriptImageRequest[]
  loaded_img_requests: LegitScriptImageRequest[]
  shader_invocations: LegitScriptShaderInvocation[]
}

export type LegitScriptImmediateModeControlCallbacks = {
  floatSlider: (name: string, prevValue: number, minValue: number, maxValue: number) => number
  intSlider: (name: string, prevValue: number, minValue: number, maxValue: number) => number
  text: (value: string) => void
}

export type ImmediateModeControlType = 'float' | 'int' | 'text'
export type ImmediateModeControl = {
  type: ImmediateModeControlType
  name: string | null
  el?: HTMLElement
  // track whether this control was used in the last frame
  // if it was not, then it gets removed
  isAlive?: boolean
}

export type RaisesErrorFN = (err: string) => void
