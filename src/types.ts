export type GPUState = {
  container: HTMLElement
  canvas: HTMLCanvasElement
  dims: number[]
  copyProgram : WebGLProgram | null
  gl: WebGL2RenderingContext
  fullScreenRenderer: () => void
}

export type FramegraphPass = {
  fragSource: string
  program: WebGLProgram
  fbo: WebGLFramebuffer | null
  blendMode : LegitScriptBlendModes
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

export type LegitScriptBlendModes = 'opaque' | 'alphablend' | 'additive' | 'multiplicative';
export type LegitScriptShaderDesc = {
  body: LegitScriptBlockBody
  name: string
  blend_mode: LegitScriptBlendModes
  includes: string[]
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



export type LegitScriptOptFloat = {
  type : 'float'
  name : string
  value : number
}
export type LegitScriptOptVec2 = {
  type : 'vec2'
  name : string
  value : vec2
}
export type LegitScriptOptVec3 = {
  type : 'vec3'
  name : string
  value : vec3
}
export type LegitScriptOptVec4 = {
  type : 'vec4'
  name : string
  value : vec4
}
export type LegitScriptOptInt = {
  type : 'int'
  name : string
  value : number
}
export type LegitScriptOptIVec2 = {
  type : 'ivec2'
  name : string
  value : ivec2
}
export type LegitScriptOptIVec3 = {
  type : 'ivec3'
  name : string
  value : ivec3
}
export type LegitScriptOptIVec4 = {
  type : 'ivec4'
  name : string
  value : ivec4
}
export type LegitScriptOptUInt = {
  type : 'uint'
  name : string
  value : number
}
export type LegitScriptOptUVec2 = {
  type : 'uvec2'
  name : string
  value : uvec2
}
export type LegitScriptOptUVec3 = {
  type : 'uvec3'
  name : string
  value : uvec3
}
export type LegitScriptOptUVec4 = {
  type : 'uvec4'
  name : string
  value : uvec4
}

export type LegitScriptShaderInvocationUniform = 
LegitScriptOptFloat |
LegitScriptOptVec2 |
LegitScriptOptVec3 |
LegitScriptOptVec4 |
LegitScriptOptInt |
LegitScriptOptIVec2 |
LegitScriptOptIVec3 |
LegitScriptOptIVec4 |
LegitScriptOptUInt |
LegitScriptOptUVec2 |
LegitScriptOptUVec3 |
LegitScriptOptUVec4


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
export type uvec2 = {x : number, y : number}
export type uvec3 = {x : number, y : number, z : number}
export type uvec4 = {x : number, y : number, z : number, w : number}
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
  size : uvec2
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

export type LegitScriptContextInput = 
  LegitScriptOptFloat |
  LegitScriptOptVec2 |
  LegitScriptOptVec3 |
  LegitScriptOptVec4 |
  LegitScriptOptInt |
  LegitScriptOptIVec2 |
  LegitScriptOptIVec3 |
  LegitScriptOptIVec4 |
  LegitScriptOptUInt |
  LegitScriptOptUVec2 |
  LegitScriptOptUVec3 |
  LegitScriptOptUVec4


export type LegitScriptFrameResult = {
  context_requests: LegitScriptContextRequest[]
  shader_invocations: LegitScriptShaderInvocation[]
}

export type RaisesErrorFN = (err: string) => void
