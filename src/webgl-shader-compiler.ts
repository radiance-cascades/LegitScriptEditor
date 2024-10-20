import { GlslSyntaxError, parser } from "@shaderfrog/glsl-parser"

export type SuccessfulCompilationResult = {
  program : WebGLProgram,
  type: 'success'
}
export type FailedCompilationResult = {
  line: number
  msg: string
  type: 'fail'
}

export type CompilationResult = SuccessfulCompilationResult | FailedCompilationResult

// TODO: we can probably reuse the vertex shader...
export function CreateRasterProgram(
  gl: WebGL2RenderingContext,
  frag: string
): CompilationResult {
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
    return {
      type : 'fail',
      msg : "failed to create frag shader",
      line: 0
    }
  }

  try {
    parser.parse(frag)
  } catch (e: any) {
    // Assume this is a syntax error
    if (e.location && e.message) {
      const syntaxError = e as GlslSyntaxError

      // TODO: remove me!
      console.log(syntaxError.message, syntaxError.location)

      return {
        type: "fail",
        msg: syntaxError.message,
        // TODO: this includes a range that will be useful to show in the editor
        line: syntaxError.location.start.line,
      }
    }
  }

  gl.shaderSource(fragShader, frag)
  gl.compileShader(fragShader)
  if (!gl.getShaderParameter(fragShader, gl.COMPILE_STATUS)) {
    const err = gl.getShaderInfoLog(fragShader);
    return {
      type : 'fail',
      msg : 'Failed to compile the fragment shader: '.concat(err ? err : 'no error, actually'),
      line: 0
    }
  }

  const vertShader = gl.createShader(gl.VERTEX_SHADER)

  if (!vertShader) {
    return {
      type : 'fail',
      msg : 'Failed to compile the vertex shader',
      line: 0
    }
  }

  gl.shaderSource(vertShader, vert)
  gl.compileShader(vertShader)
  if (!gl.getShaderParameter(vertShader, gl.COMPILE_STATUS)) {
    const err = gl.getShaderInfoLog(vertShader);
    return {
      type : 'fail',
      msg : 'Failed to compile the vertex shader: '.concat(err ? err : 'no error, actually'),
      line: 0
    }
  }

  const program = gl.createProgram()
  if (!program) {
    return {
      type : 'fail',
      msg : 'Failed to create a shader program',
      line: 0
    }
  }

  gl.attachShader(program, fragShader)
  gl.attachShader(program, vertShader)
  gl.linkProgram(program)

  gl.deleteShader(fragShader)
  gl.deleteShader(vertShader)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const err = gl.getProgramInfoLog(program);
    return {
      type : 'fail',
      msg : 'Failed to create a shader program: '.concat(err ? err : 'no error, actually'),
      line: 0
    }
  }

  return {
    type : 'success',
    program : program
  }
}