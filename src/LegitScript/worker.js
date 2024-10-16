import Module from './LegitScriptWasm.js'

;(async () => {
  const legitScriptCompiler = await Module();

  self.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(event.data)
      if (!msg) {
        console.warn("LegitScript worker recieved invalid message")
        return
      }

      if (msg.type === 'compile') {
        try {
          const result = JSON.parse(legitScriptCompiler.LegitScriptLoad(msg.src))
console.log('result', result)
          self.postMessage(JSON.stringify({
            type: msg.type,
            result
          }))
        } catch (e) {

          console.error('Caught exception emitted from LegitScript', e)

          self.postMessage({
            type: "error",
            result: e
          })
        }
      }
    } catch (e) {
      console.error(event, e)
    }
  })
})()