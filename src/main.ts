import './style.css'
import * as monaco from 'monaco-editor'

self.MonacoEnvironment = {
	getWorkerUrl: function (moduleId, label) {
		if (label === 'json') {
			return './json.worker.bundle.js';
		}
		if (label === 'css' || label === 'scss' || label === 'less') {
			return './css.worker.bundle.js';
		}
		if (label === 'html' || label === 'handlebars' || label === 'razor') {
			return './html.worker.bundle.js';
		}
		if (label === 'typescript' || label === 'javascript') {
			return './ts.worker.bundle.js';
		}
		return './editor.worker.bundle.js';
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

const editorEl = document.getElementById('editor');
if (editorEl) {
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
  editor.focus()
}
