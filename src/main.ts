import './style.css'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'


self.MonacoEnvironment = {
  getWorker: function (moduleId, label) {
    return new editorWorker();
  }
};


const initialContent = `
void ColorPass(in float r, in float g, in float b, out vec4 out_color)
{{
  void main()
  {
    out_color = vec4(r, g, b + 0.5f, 1.0f);
  }
}}
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


async function CompileLegitScript(worker: Worker, editor) {
  try {
    const content = editor.getModel().createSnapshot().read() || ''

    worker.postMessage(JSON.stringify({
      type: "compile",
      src: content,
      id: worker.transactionId++
    }))


    return true
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
    gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(vao)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
}

function CreateRasterProgram(gl, frag) {
  const vert = `#version 300 es
    layout (location=0) in vec2 position;
    out vec2 uv;
    void main() {
      uv = position.xy * 0.5 + 0.5;
      gl_Position = vec4(position, 0, 1.0);
    }
  `

  const fragShader = gl.createShader(gl.FRAGMENT_SHADER)
  gl.shaderSource(fragShader, frag)
  gl.compileShader(fragShader)
  if (!gl.getShaderParameter(fragShader, gl.COMPILE_STATUS)) {
    console.error('FRAGMENT SHADER', gl.getShaderInfoLog(fragShader))
    return
  }

  const vertShader = gl.createShader(gl.VERTEX_SHADER)
  gl.shaderSource(vertShader, vert)
  gl.compileShader(vertShader)
  if (!gl.getShaderParameter(vertShader, gl.COMPILE_STATUS)) {
    console.error('VERTEX SHADER', gl.getShaderInfoLog(vertShader))
    return
  }

  const program = gl.createProgram()
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

function InitWebGL(canvas) {
  const options = {
    premultipliedAlpha: true,
    alpha: true,
    antialias: true
  }

  Object.assign(canvas.style, {
    left: 0,
    top: 0,
    margin: 0,
    padding: 0,
    'pointer-events': 'none',
    position: 'absolute'
  })

  const gl = canvas.getContext('webgl2', options)
  // a reusable fbo
  const fbo = gl.createFramebuffer()
  const container = canvas.parentElement

  return {
    container,
    canvas,
    dims: [0, 0],
    gl: gl,
    fbo,
    fullscreenRenderer: CreateFullscreenRenderer(gl)
  }
}

async function Init(editorEl, canvasEl) {

  const compilerWorker = new Worker(
    new URL('./LegitScript/worker', import.meta.url),
    {type: 'module'}
  );

  compilerWorker.addEventListener('message', (event) => {
    try {
      console.log(event.data)
      const msg = JSON.parse(event.data)
      console.log(msg)
    } catch (e) {
      console.error("failed to parse compiler message", e.stack)
    }
  })


  const editor = InitEditor(editorEl)
  editor.focus()

  const state = {
    editor,
    gpu: InitWebGL(canvasEl)
  }


  await CompileLegitScript(compilerWorker, editor)
  editor.getModel().onDidChangeContent(async () => {
    await CompileLegitScript(compilerWorker, editor)
  })

  requestAnimationFrame((dt) => ExecuteFrame(dt, state))
}

const Floor = Math.floor
const v2scratch = [0, 0]
function ExecuteFrame(dt, state) {
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

    gpu.canvas.style.width = `${rect.width}px`;
    gpu.canvas.style.height = `${rect.height}px`;
  }

  const gl = gpu.gl;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.viewport(0, 0, gpu.canvas.width, gpu.canvas.height)
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  if (!state.framegraph) {
    return;
  }

  for (const passName of state.framegraph.executionOrder) {
    const pass = state.passes[passName]
    gl.useProgram(pass.program)
    gl.uniform1f(gl.getUniformLocation(pass.program, 'time'), dt * 0.001)

    const mouseLoc = gl.getUniformLocation(pass.program, 'mouse')
    if (mouseLoc) {
      const x = rect.width - (state.rawMouse[0] - rect.left)
      const y = state.rawMouse[1] - rect.top
      gl.uniform4f(mouseLoc, x, y, 0.0, 0.0);
    }

    if (pass.texture) {
      v2scratch[0] = gpu.canvas.width
      v2scratch[1] = gpu.canvas.height
      if (pass.size) {
        pass.size(v2scratch, v2scratch)
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, state.gpu.fbo)
      gl.viewport(0, 0, v2scratch[0], v2scratch[1])
      gl.bindTexture(gl.TEXTURE_2D, pass.texture)
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        v2scratch[0],
        v2scratch[1],
        0,
        // TODO: allow format changes
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null);

      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        // TODO: pull this from the preprocessor, based on the number of outputs
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        pass.texture,
        0
      )
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, gpu.canvas.width, gpu.canvas.height)
    }
    gpu.fullscreenRenderer()
  }
  requestAnimationFrame((dt) => ExecuteFrame(dt, state))
}

function InitEditor(editorEl) {
  if (!editorEl) {
    return
  }
  const editor = monaco.editor.create(editorEl, {
    value: initialContent || '',
    language: 'c',
    minimap: {
      enabled: false
    },
    tabSize: 2,
    automaticLayout: true,
    theme: 'vs-dark'
  })

  return editor;
}

Init(
  document.getElementById('editor'),
  document.getElementById('output')
)