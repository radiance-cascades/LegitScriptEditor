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
  controls: ImmediateModeControl[]
  frameControlIndex: 0
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

export type LegitScriptShaderDesc = {
  body: LegitScriptBlockBody
  name: string
  outs: LegitScriptShaderOutput[]
  uniforms: LegitScriptShaderUniform[]
}

export type LegitScriptLoadResult = {
  shader_descs: LegitScriptShaderDesc[]
  declarations: LegitScriptDeclaration[]
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
