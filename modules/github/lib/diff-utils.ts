import { start } from "node:repl";

export interface DiffLine{
    type:'equal' | 'insert' | 'delete' | 'modify';
    original:string | null;
    modified :string | null;
    originalLineNum:number | null;
    modLineNum:number |null;
}

export interface DiffBlock{
    startIndex:number ;
    lines:DiffLine[];
    hasChanges:boolean;
}

export function computeDiff(original:string,modified:string):DiffLine[]{
    const origLines = original.split('\n')
    const modLines = modified.split('\n')

    const diff : DiffLine[] = [];
    let i = 0;
    let j = 0;
    while(i<origLines.length || j<modLines.length){
        if(i<origLines.length && j<modLines.length && origLines[i] === modLines[j]){
            diff.push({
                type:'equal',
                original:origLines[i],
                modified:modLines[j],
                originalLineNum:i+1,
                modLineNum:j+1
            });
            i++;
            j++;
            continue;

        }

        let foundMatch = false;
        let lookAhead = 1;
        while(lookAhead<=5 && !foundMatch){
            if(i + lookAhead < origLines.length && origLines[i+lookAhead] === modLines[j]){
                for(let k = 0;k<lookAhead;k++){
                    diff.push({
                        type:'delete',
                        original:origLines[i+k],
                        modified:null,
                        originalLineNum:i+k+1,
                        modLineNum:null

                    });
                    
                    
                }
                i+=lookAhead;
                foundMatch = true;
            }else if(j+lookAhead<modified.length && origLines[i] === modLines[j+lookAhead]){
                for(let k = 0;k<lookAhead;k++){
                    diff.push({
                        type:'insert',
                        original:null,
                        modified:modLines[j+k],
                        originalLineNum:null,
                        modLineNum:j+k+1
                    });

                }
                j+=lookAhead;
                foundMatch = true;
            }
            lookAhead++;
        }

        if(!foundMatch){
            if(i<origLines.length && j<modLines.length){
                diff.push({
                    type:'modify',
                    original:origLines[i],
                    modified:modLines[j],
                    originalLineNum:i+1,
                    modLineNum:j+1
                });
                i++;
                j++;
            }else if (i < origLines.length) {
        diff.push({
          type: 'delete',
          original: origLines[i],
          modified: null,
          originalLineNum: i + 1,
          modLineNum: null
        });
        i++;
      } else {
        diff.push({
          type: 'insert',
          original: null,
          modified: modLines[j],
          originalLineNum: null,
          modLineNum: j + 1
        });
        j++;
      }
        }

    
    }

    return diff;
}


export function groupDiffBlocks(diff:DiffLine[],contextLines:number=3):DiffBlock[]{
    const blocks :  DiffBlock[] = []
    let currentBlock:DiffBlock|null = null;
    diff.forEach((line,index)=>{
        if(line.type!=='equal'){
            if(!currentBlock){
                const startIndex = Math.max(0,index-contextLines);
                currentBlock = {
                    startIndex,
                    lines:diff.slice(startIndex,index+1),
                    hasChanges:true

                }
            }else{
                currentBlock.lines.push(line);
            }
        }else if(currentBlock){
            const changedLines = currentBlock.lines.filter(l=>l.type!=='equal').length;
            const contextAfter = currentBlock.lines.length - currentBlock.lines.lastIndexOf(currentBlock.lines.find(l=>l.type !== 'equal')!);
            if(contextAfter<contextLines){
                currentBlock.lines.push(line);
            }else{
                blocks.push(currentBlock);
                currentBlock = null;
            }
        }
    });
    if(currentBlock){
        blocks.push(currentBlock);
    }

    return blocks.length>0?blocks:[{
        startIndex:0,
        lines:diff,
        hasChanges:false
    }]
}

export function getDiffStats(Diff:DiffLine[]){
    return {
        additions: Diff.filter(d=>d.type === 'insert').length,
        deletions: Diff.filter(d=>d.type === 'delete').length,
        modifications: Diff.filter(d=>d.type === 'modify').length,
        total: Diff.length,
        
    }
}