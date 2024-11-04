# LegitScriptEditor
Accessible directly from your web browser! https://radiance-cascades.github.io/LegitScriptEditor/
We support loading scripts directly from github in the format: `https://radiance-cascades.github.io/LegitScriptEditor/?gh=<user>/<repo>/<path_to_file>`, for example: https://radiance-cascades.github.io/LegitScriptEditor/?gh=Raikiri/LegitCascades/Scaling.ls

An optional flag `&ref=...` is also supported which can be a sha/tag but will default to master, for example: https://radiance-cascades.github.io/LegitScriptEditor/?gh=Raikiri/LegitCascades/Scaling.ls&rev=master

An editor for [LegitScript](https://github.com/Raikiri/LegitScript) with WebGL output.

## Development

After cloning the repo, cd into it and run

```
nix-shell
npm i
npm run dev
```

it should print out a localhost url that you can visit in your browser.


### Updating LegitScript

Follow the build instructions over at https://github.com/Raikiri/LegitScript?tab=readme-ov-file#running-the-web-demo and then

```
cp -rv web/dist/LegitScriptWasm.* /path/to/LegitScriptEditor/src/LegitScript/
```
