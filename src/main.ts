import "./style.css"
import * as monaco from "monaco-editor"
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker"

// @ts-ignore
import { initialContent } from "./initial-content.js"

import { UIState } from "./immediate-ui.js"
import { BindPlayerControls } from "./controls.js"
import {
  CoreState,
  CompileLegitScript,
  UpdateFramegraph,
  InitCoreState,
  ExecuteFrame } from "./core/legit-core.js"

import {
  LegitScriptContextInput,
  LegitScriptContextRequest,
} from "./core/types.js"
  
export type State = {
  editor:any
  coreState: CoreState
  uiState: UIState
  playerState: {
    playing: boolean
    startTime: number

    // let a single frame through on rebuild or reset
    reset: boolean
  }
}

self.MonacoEnvironment = {
  getWorker: function (_moduleId: string, _label: string) {
    return new editorWorker()
  },
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

function SetEditorSquiggies(
  decorations: monaco.editor.IEditorDecorationsCollection,
  editor: monaco.editor.IStandaloneCodeEditor,
  line: number,
  column: number,
  desc: string
) {
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
      //this feels very bad when you change the number of arguments to a pass and it immediately jumps you to the call site of that pass that now contains an error
      //if(line > 0) //line = 0 usually means we failed to find it
      //  editor.revealLineInCenter(line)
    }
  }
}
function UnsetEditorSquiggies(
  decorations: monaco.editor.IEditorDecorationsCollection,
  editor: monaco.editor.IStandaloneCodeEditor
) {
  const model = editor.getModel()
  if (model) {
    monaco.editor.setModelMarkers(model, "legitscript", [])
    decorations.set([])
  }
}

function BuildFramegraph(
  state: State,
  decorations: monaco.editor.IEditorDecorationsCollection
) {
  const content = state.editor.getModel()?.createSnapshot().read() || "";
  const compileResult = CompileLegitScript(
    state.coreState.legitScriptCompiler,
    content
  )
  if (compileResult) {
    if (compileResult.error) {
      console.error("compileResult", compileResult)
      const { line, column, desc } = compileResult.error
      SetEditorSquiggies(decorations, state.editor, line, column, 'Render graph compilation failed: ' + desc)
    } else {
      const model = state.editor.getModel()
      if (model) {
        monaco.editor.setModelMarkers(model, "legitscript", [])
        decorations.set([])
      }
      const err = UpdateFramegraph(state.coreState.gpu, state.coreState.framegraph, compileResult)
      if (err) {
        SetEditorSquiggies(decorations, state.editor, err.line, 0, err.msg)
      } else {
        state.coreState.hasCompiledOnce = true
        UnsetEditorSquiggies(decorations, state.editor)
      }
    }
  }
}

async function Init(
  editorEl: HTMLElement | null,
  canvasEl: HTMLElement | null,
  controlsEl: HTMLElement | null,
  draggerEl: HTMLElement | null,
  playerControlEl: HTMLElement | null
) {
  if (!editorEl || !canvasEl || !controlsEl || !draggerEl) {
    throw new Error("please provide an editor element and canvas element")
  }

  const coreState = await InitCoreState(canvasEl as HTMLCanvasElement)

  const editor = await InitEditor(editorEl)
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

  const state: State = {
    editor,
    coreState,
    uiState: new UIState(controlsEl),
    playerState: {
      playing: true,
      startTime: performance.now(),
      reset: false,
    },
  }

  const decorations = editor.createDecorationsCollection([])

  // Wire up the renderer controls (play/pause, restart, build)
  if (playerControlEl) {
    BindPlayerControls(playerControlEl, {
      playPauseFn: () => {
        state.playerState.playing = !state.playerState.playing
        return state.playerState.playing
      },
      restartFn: () => {
        state.playerState.reset = true
      },
      buildFn: () => {
        BuildFramegraph(state, decorations)
      },
    })
  }

  // initial content upon loading the page
  BuildFramegraph(state, decorations)

  // handle keybinds
  window.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey || e.altKey)) {
      BuildFramegraph(state, decorations)
    }
  })
  requestAnimationFrame((currTime) => ExecuteFrameLoop(currTime, state))
}


export function ProcessScriptUIRequests(
  uiState : UIState,
  contextRequests : LegitScriptContextRequest[]) : LegitScriptContextInput[]
{
  var contextInputs : LegitScriptContextInput[] = [];

  for(const request of contextRequests){
    if(request.type == 'FloatRequest'){
      contextInputs.push({
        name : request.name,
        type : 'float',
        value : uiState.floatSlider(request.name, request.def_val, request.min_val, request.max_val)
      });
    }
    if(request.type == 'IntRequest'){
      contextInputs.push({
        name : request.name,
        type : 'int',
        value : uiState.intSlider(request.name, request.def_val, request.min_val, request.max_val)
      });
    }
    if(request.type == 'TextRequest'){
      uiState.text(request.text)
    }
    if(request.type == 'BoolRequest'){
      contextInputs.push({
        name : request.name,
        type : 'int',
        value : 1 //TODO: actually make a checkbox
      });
    }
  }
  return contextInputs;
}

function ExecuteFrameLoop(currTime: number, state: State) {
  state.uiState.filterControls()
  if (state.playerState.reset) {
    state.playerState.reset = false
    state.playerState.startTime = currTime
  }
  const currFrameTime = currTime - state.playerState.startTime;
  ExecuteFrame(currFrameTime, state.coreState, (contextRequests) => {return ProcessScriptUIRequests(state.uiState, contextRequests)}, state.playerState.playing);
  
  requestAnimationFrame((currTime) => ExecuteFrameLoop(currTime, state))
}

async function InitEditor(editorEl: HTMLElement) {
  if (!editorEl) {
    return
  }
  const editor = monaco.editor.create(editorEl, {
    value: await initialContent(),
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
  document.querySelector("divider"),
  document.querySelector("player-controls")
)
