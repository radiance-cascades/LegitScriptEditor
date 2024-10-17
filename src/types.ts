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
}

export type FramegraphPasses = {
  [PassName: string]: FramegraphPass
}

export type Framegraph = {
  passes: FramegraphPasses
  executionOrder: string[]
}

export type State = {
  editor: any
  gpu: GPUState
  framegraph: Framegraph
  legitScriptCompiler: any
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

export type LegitScriptShaderDesc = {
  body: string
  name: string
  outs: LegitScriptShaderOutput[]
  uniforms: LegitScriptShaderUniform[]
}

export type LegitScriptLoadResult = {
  shader_descs: LegitScriptShaderDesc[]
}

export type RaisesErrorFN = (err: string) => void
