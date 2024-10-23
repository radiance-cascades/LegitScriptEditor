export type ImmediateModeControlType = 'float' | 'int' | 'text'

type ImmediateModeControl = {
  type: ImmediateModeControlType
  name: string | null
  el?: HTMLElement
  // track whether this control was used in the last frame
  // if it was not, then it gets removed
  isAlive?: boolean
}


function SliderControlCreate(
  name: string,
  value: string,
  lo: string,
  hi: string,
  is_int: boolean
): HTMLElement {
  const el = document.createElement("control")

  const nameEl = document.createElement("span")
  nameEl.setAttribute("class", "name")
  nameEl.innerText = ` ${name} `
  el.append(nameEl)

  const inputEl = document.createElement("input")
  inputEl.setAttribute("type", "range")
  inputEl.setAttribute("min", lo)
  inputEl.setAttribute("max", hi)
  const step = is_int ? 1.0 : 0.001
  inputEl.setAttribute("step", step + "")
  inputEl.setAttribute("value", value)
  // TODO: compute this based on slider width
  el.append(inputEl)

  const labelEl = document.createElement("span")
  labelEl.setAttribute("class", "value")
  labelEl.innerText = ` (${value}) `
  el.append(labelEl)
  return el
}

export class UIState{
  constructor(controlsEl : HTMLElement)
  {
    this.controlsEl = controlsEl
    this.controls = []
    this.frameControlIndex = 0
  }
  
  filterControls()
  {
    
    // remove dead controls
    this.controls = this.controls.filter((control) => {
      if (control.isAlive) {
        control.isAlive = false
        return true
      }

      if (control.el) {
        console.log("remove control", control)
        control.el.remove()
      }
      return false
    })
    this.frameControlIndex = 0
  }
  
    
  floatSlider(name: string, prevValue: number, lo: number, hi: number) : number {
    const control = this.control("float", name)
    if (!control.el) {
      control.el = SliderControlCreate(name, prevValue + "", lo + "", hi + "", false)
      this.controlsEl.append(control.el)
    }

    let value = prevValue
    const valueDisplayEl = control.el.querySelector(".value") as HTMLElement
    const inputEl = control.el.querySelector("input")
    if (valueDisplayEl && inputEl) {
      value = parseFloat(inputEl.value)
      valueDisplayEl.innerText = ` (${value})`
    }
    return value
  }
  intSlider(name: string, prevValue: number, lo: number, hi: number) : number {
    const control = this.control("float", name)
    if (!control.el) {
      control.el = SliderControlCreate(name, prevValue + "", lo + "", hi + "", true)
      this.controlsEl.append(control.el)
    }

    let value = prevValue
    const valueDisplayEl = control.el.querySelector(".value") as HTMLElement
    const inputEl = control.el.querySelector("input")
    if (valueDisplayEl && inputEl) {
      value = parseFloat(inputEl.value)
      valueDisplayEl.innerText = ` (${value})`
    }
    return value
  }
  text(value: string) {
    const control = this.control("float", null)
    if (!control.el) {
      control.el = document.createElement("control")
      this.controlsEl.append(control.el)
    }

    control.el.innerText = value
  }

  private control(
    type: ImmediateModeControlType,
    name: string | null
  ): ImmediateModeControl {
    if (this.frameControlIndex < this.controls.length) {
      const currentControl = this.controls[this.frameControlIndex]
      if (currentControl && currentControl.type === type) {
        if (currentControl.name === name || type === "text") {
          this.frameControlIndex++
          currentControl.isAlive = true
          return currentControl
        }
      }
    }
    this.frameControlIndex++
  
    const currentControl: ImmediateModeControl = {
      type,
      name,
      isAlive: true,
    }
  
    this.controls.push(currentControl)
    return currentControl
  }
  
  private controlsEl: HTMLElement
  private controls: ImmediateModeControl[]
  private frameControlIndex: 0
}

