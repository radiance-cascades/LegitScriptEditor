# LegitScriptEditor

An editor for [LegitScript](https://github.com/Raikiri/LegitScript) with WebGL output.

## Development

After cloning the repo, cd into it and run

```
npm i
npm run dev
```

it should print out a localhost url that you can visit in your browser.


### Updating LegitScript

Follow the build instructions over at https://github.com/Raikiri/LegitScript?tab=readme-ov-file#running-the-web-demo and then

```
cp -rv web/dist/LegitScriptWasm.* /path/to/LegitScriptEditor/src/LegitScript/
```