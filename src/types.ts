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
  fboAttachmentIds: number[]
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

export type ivec2 = {x : number, y : number}
export type ivec3 = {x : number, y : number, z : number}
export type ivec4 = {x : number, y : number, z : number, w : number}
export type vec2 = {x : number, y : number}
export type vec3 = {x : number, y : number, z : number}
export type vec4 = {x : number, y : number, z : number, w : number}

export type LegitScriptFloatRequest = {
  name : string
  type : 'FloatRequest'
  min_val : number
  max_val : number
  def_val : number
}
export type LegitScriptIntRequest = {
  name : string
  type : 'IntRequest'
  min_val : number
  max_val : number
  def_val : number
}
export type LegitScriptBoolRequest = {
  name : string
  type : 'BoolRequest'
  def_val : boolean
}
export type LegitScriptTextRequest = {
  text : string
  type : 'TextRequest'
}
export type LegitScriptCachedImageRequest = {
  id: number
  type : 'CachedImageRequest'
  pixel_format: string
  size : ivec2
}
export type LegitScriptLoadedImageRequest = {
  filename : string
  type : 'LoadedImageRequest'
  id : number
}
export type LegitScriptContextRequest = 
  LegitScriptFloatRequest |
  LegitScriptIntRequest |
  LegitScriptBoolRequest |
  LegitScriptTextRequest |
  LegitScriptCachedImageRequest |
  LegitScriptLoadedImageRequest

export type LegitScriptContextInputFloat = {
  type : 'float'
  name : string
  value : number
}
export type LegitScriptContextInputVec2 = {
  type : 'vec2'
  name : string
  value : vec2
}
export type LegitScriptContextInputVec3 = {
  type : 'vec3'
  name : string
  value : vec3
}
export type LegitScriptContextInputVec4 = {
  type : 'vec4'
  name : string
  value : vec4
}
export type LegitScriptContextInputInt = {
  type : 'int'
  name : string
  value : number
}
export type LegitScriptContextInputIVec2 = {
  type : 'ivec2'
  name : string
  value : ivec2
}
export type LegitScriptContextInputIVec3 = {
  type : 'ivec3'
  name : string
  value : ivec3
}
export type LegitScriptContextInputIVec4 = {
  type : 'ivec4'
  name : string
  value : ivec4
}
export type LegitScriptContextInput = 
  LegitScriptContextInputFloat |
  LegitScriptContextInputVec2 |
  LegitScriptContextInputVec3 |
  LegitScriptContextInputVec4 |
  LegitScriptContextInputInt |
  LegitScriptContextInputIVec2 |
  LegitScriptContextInputIVec3 |
  LegitScriptContextInputIVec4


export type LegitScriptFrameResult = {
  context_requests: LegitScriptContextRequest[]
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
