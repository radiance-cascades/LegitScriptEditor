export function BindPlayerControls(
  el: HTMLElement,
  fns: {
    playPauseFn: () => boolean
    restartFn: () => void
    buildFn: () => void
  }
) {
  const playButton = el.querySelector('button[name="play-pause"]')
  if (playButton) {
    playButton.addEventListener("click", () => {
      if (fns.playPauseFn()) {
        playButton.classList.add("playing")
      } else {
        playButton.classList.remove("playing")
      }
    })
  }

  const restartButton = el.querySelector('button[name="restart"]')
  if (restartButton) {
    restartButton.addEventListener("click", fns.restartFn)
  }

  const buildButton = el.querySelector('button[name="build"]')
  if (buildButton) {
    buildButton.addEventListener("click", fns.buildFn)
  }
}