type ScriptBlock = {
  startLine : number | null
  lineCount : number
}

function countLines(str : string) : number
{
  var count = 0
  for(const c of str)
  {
    if(c == '\n')
      count++
  }
  return count
}

export class SourceAssembler{
  
  constructor() {}
  addSourceBlock(text : string, startLine : number)
  {
    this.resultText = this.resultText.concat(text)
    this.blocks.push({startLine, lineCount : countLines(text)});
  }
  addNonSourceBlock(text : string)
  {
    this.resultText = this.resultText.concat(text)
    this.blocks.push({startLine: null, lineCount : countLines(text)});
  }
  
  getSourceLine(resultLine : number) : number | null
  {
    var currBlockStart : number = 1
    
    for(const block of this.blocks)
    {
      if(resultLine < currBlockStart + block.lineCount)
      {
        if(block.startLine)
          return block.startLine + (resultLine - currBlockStart)
        else
          return null
      }
      currBlockStart += block.lineCount;
    }
    return null
  }
  
  getResultText() : string {
    return this.resultText
  }
  
  private blocks : ScriptBlock[] = []
  private resultText : string = ''
}

