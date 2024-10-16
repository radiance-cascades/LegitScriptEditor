import "./style.css";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { Framegraph, FramegraphPass, GPUState, LegitScriptLoadResult, RaisesErrorFN, State } from "./types";

self.MonacoEnvironment = {
  getWorker: function (_moduleId: string, _label: string) {
    return new editorWorker();
  },
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
`;

async function CompileLegitScript(worker: Worker, editor: monaco.editor.ICodeEditor) {
  try {
    const content = editor.getModel()?.createSnapshot().read() || "";

    worker.postMessage(
      JSON.stringify({
        type: "compile",
        src: content,
      })
    );

    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

function CreateFullscreenRenderer(gl: WebGL2RenderingContext) {
  const vertexBuffer = new Float32Array([-1, -1, -1, 4, 4, -1]);
  const vao = gl.createVertexArray();

  gl.bindVertexArray(vao);
  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, vertexBuffer, gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);
  gl.bindVertexArray(null);
  return function RenderFullscreenTriangle() {
    gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
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
  `;

  const fragShader = gl.createShader(gl.FRAGMENT_SHADER);
  if (!fragShader) {
    console.error("failed to create frag shader");
    return;
  }

  gl.shaderSource(fragShader, frag);
  gl.compileShader(fragShader);
  if (!gl.getShaderParameter(fragShader, gl.COMPILE_STATUS)) {
    console.error("FRAGMENT SHADER", gl.getShaderInfoLog(fragShader));
    return;
  }

  const vertShader = gl.createShader(gl.VERTEX_SHADER);

  if (!vertShader) {
    console.error("failed to create vertex shader");
    return;
  }

  gl.shaderSource(vertShader, vert);
  gl.compileShader(vertShader);
  if (!gl.getShaderParameter(vertShader, gl.COMPILE_STATUS)) {
    console.error("VERTEX SHADER", gl.getShaderInfoLog(vertShader));
    return;
  }

  const program = gl.createProgram();
  if (!program) {
    console.error("failed to create webgl program");
    return;
  }

  gl.attachShader(program, fragShader);
  gl.attachShader(program, vertShader);
  gl.linkProgram(program);

  gl.deleteShader(fragShader);
  gl.deleteShader(vertShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    return;
  }

  return program;
}

function InitWebGL(canvas: HTMLCanvasElement): GPUState {
  const options = {
    premultipliedAlpha: true,
    alpha: true,
    antialias: true,
  };

  Object.assign(canvas.style, {
    left: 0,
    top: 0,
    margin: 0,
    padding: 0,
    "pointer-events": "none",
    position: "absolute",
  });

  const gl = canvas.getContext("webgl2", options) as WebGL2RenderingContext;
  // a reusable fbo
  const fbo = gl.createFramebuffer();
  if (!fbo) {
    throw new Error("could not create a single fbo")
  }
  const container = canvas.parentElement;

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
  };
}

function UpdateFramegraph(
  { gl }: GPUState,
  framegraph: Framegraph,
  result: LegitScriptLoadResult,
  raiseError: RaisesErrorFN
) {
  for (const desc of result.shader_descs) {
    const outputs = desc.outs.map(({ name, type }) => `out ${type} ${name};\n`);
    const uniforms = desc.uniforms.map(
      ({ name, type }) => `uniform ${type} ${name};\n`
    );

    const fragSource = `#version 300 es
      precision highp float;
      ${outputs.join("\n")}
      ${uniforms.join("\n")}
      ${desc.body}
    `;


    let pass: FramegraphPass = framegraph.passes[desc.name];
    if (pass) {
      if (pass.fragSource === fragSource) {
        continue;
      }
    }

    const program = CreateRasterProgram(gl, fragSource);
    if (!program) {
      raiseError("CreateRasterProgram returned an invalid program");
      continue;
    }

    if (pass?.program) {
      gl.deleteProgram(pass.program);
    }

    framegraph.passes[desc.name] = {
      fragSource,
      program
    }
  }

  console.log(framegraph);
}

function RaiseError(err: string) {
  console.error("RaiseError:", err);
}

async function Init(
  editorEl: HTMLElement | null,
  canvasEl: HTMLCanvasElement | null
) {
  if (!editorEl || !canvasEl) {
    throw new Error("please provide an editor element and canvas element");
  }

  const compilerWorker = new Worker(
    new URL("./LegitScript/worker", import.meta.url),
    { type: "module" }
  );

  const editor = InitEditor(editorEl);
  if (!editor) {
    throw new Error("could not initialize monaco");
  }

  editor.focus();

  const state: State = {
    editor,
    gpu: InitWebGL(canvasEl),
    framegraph: {
      passes: {},
    },
  };

  compilerWorker.addEventListener("message", (event) => {
    try {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case "compile": {
          UpdateFramegraph(state.gpu, state.framegraph, msg.result, RaiseError);

          break;
        }

        case "error": {
          console.error("ERROR", msg);
          break;
        }
      }
    } catch (e: any) {
      console.error("failed to parse compiler message", e.stack);
    }
  });

  await CompileLegitScript(compilerWorker, editor);
  editor.getModel()?.onDidChangeContent(async () => {
    await CompileLegitScript(compilerWorker, editor);
  });

  requestAnimationFrame((dt) => ExecuteFrame(dt, state));
}

const Floor = Math.floor;
const v2scratch = [0, 0];
function ExecuteFrame(dt: number, state: State) {
  const gpu = state.gpu;
  // Ensure we're sized properly w.r.t. pixel ratio
  const rect = gpu.container.getBoundingClientRect();

  if (gpu.dims[0] !== rect.width || gpu.dims[1] !== rect.height) {
    gpu.dims[0] = rect.width;
    gpu.dims[1] = rect.height;

    const width = Floor(rect.width * window.devicePixelRatio);
    const height = Floor(rect.height * window.devicePixelRatio);

    gpu.canvas.width = width;
    gpu.canvas.height = height;

    gpu.canvas.style.width = `${rect.width}px`;
    gpu.canvas.style.height = `${rect.height}px`;
  }

  const gl = gpu.gl;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, gpu.canvas.width, gpu.canvas.height);
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  if (!state.framegraph) {
    return;
  }

  // for (const passName of state.framegraph?.executionOrder ?? []) {
  //   console.log("passName", passName);
  //   const pass = state.passes[passName];
  //   gl.useProgram(pass.program);
  //   gl.uniform1f(gl.getUniformLocation(pass.program, "time"), dt * 0.001);

  //   const mouseLoc = gl.getUniformLocation(pass.program, "mouse");
  //   if (mouseLoc) {
  //     const x = rect.width - (state.rawMouse[0] - rect.left);
  //     const y = state.rawMouse[1] - rect.top;
  //     gl.uniform4f(mouseLoc, x, y, 0.0, 0.0);
  //   }

  //   if (pass.texture) {
  //     v2scratch[0] = gpu.canvas.width;
  //     v2scratch[1] = gpu.canvas.height;
  //     if (pass.size) {
  //       pass.size(v2scratch, v2scratch);
  //     }

  //     gl.bindFramebuffer(gl.FRAMEBUFFER, state.gpu.fbo);
  //     gl.viewport(0, 0, v2scratch[0], v2scratch[1]);
  //     gl.bindTexture(gl.TEXTURE_2D, pass.texture);
  //     gl.texImage2D(
  //       gl.TEXTURE_2D,
  //       0,
  //       gl.RGBA,
  //       v2scratch[0],
  //       v2scratch[1],
  //       0,
  //       // TODO: allow format changes
  //       gl.RGBA,
  //       gl.UNSIGNED_BYTE,
  //       null
  //     );

  //     gl.framebufferTexture2D(
  //       gl.FRAMEBUFFER,
  //       // TODO: pull this from the preprocessor, based on the number of outputs
  //       gl.COLOR_ATTACHMENT0,
  //       gl.TEXTURE_2D,
  //       pass.texture,
  //       0
  //     );
  //   } else {
  //     gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  //     gl.viewport(0, 0, gpu.canvas.width, gpu.canvas.height);
  //   }
  //   gpu.fullScreenRenderer();
  // }
  requestAnimationFrame((dt) => ExecuteFrame(dt, state));
}

function InitEditor(editorEl: HTMLElement) {
  if (!editorEl) {
    return;
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
  });

  return editor;
}

Init(document.getElementById("editor"), document.getElementById("output") as HTMLCanvasElement);
