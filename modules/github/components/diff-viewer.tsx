"use client"
import { useEffect, useState, useRef } from "react"
import { X, GitCompare, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { computeDiff, groupDiffBlocks, getDiffStats, DiffLine, DiffBlock } from "../lib/diff-utils"


interface DiffViewerProps{
    originalContent:string,
    modifiedContent:string,
    filepath:string,
    onClose:()=>void
}

export function DiffViewer({originalContent,modifiedContent,filepath,onClose}:DiffViewerProps){
    const [diff,setDiff] = useState<DiffLine[]>([])
    const [block,setBlocks] = useState<DiffBlock[]>([])
    const [collapsedBlocks,setCollapsedBlocks] = useState<Set<number>>(new Set())
    const leftScrollRef = useRef<HTMLDivElement>(null)
    const rightScrollRef = useRef<HTMLAnchorElement>(null)
    const isScrolling = useRef(false)

    useEffect(()=>{
        const computed = computeDiff(originalContent,modifiedContent)
        const grouped = groupDiffBlocks(computed,3)
        setDiff(computed)
        setBlocks(grouped)
    },[originalContent,modifiedContent])

    const handleScroll = (source:'left'|'right') => {
        if(isScrolling.current)return;
        isScrolling.current = true;
        const sourceRef = source === 'left'?leftScrollRef:rightScrollRef
        const targetRef = source === 'right'?rightScrollRef:leftScrollRef
        if(sourceRef.current && targetRef.current){
            targetRef.current.scrollTop = sourceRef.current.scrollTop
        }

        setTimeout(()=>{
            isScrolling.current = false
        },10)
    }

    const stats = getDiffStats(diff)
    const fileName = filepath.split('/').pop()
      return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="h-14 border-b flex items-center justify-between px-4 bg-muted/30">
        <div className="flex items-center gap-3">
          <GitCompare className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="font-medium text-sm">{fileName}</h3>
            <p className="text-xs text-muted-foreground">{filepath}</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Stats */}
          <div className="flex items-center gap-3 text-xs">
            {stats.additions > 0 && (
              <span className="text-green-600">+{stats.additions}</span>
            )}
            {stats.deletions > 0 && (
              <span className="text-red-600">-{stats.deletions}</span>
            )}
            {stats.modifications > 0 && (
              <span className="text-yellow-600">~{stats.modifications}</span>
            )}
          </div>

          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Column Headers */}
      <div className="flex border-b bg-muted/50">
        <div className="flex-1 px-4 py-2 border-r">
          <span className="text-xs font-medium text-muted-foreground">ORIGINAL</span>
        </div>
        <div className="flex-1 px-4 py-2">
          <span className="text-xs font-medium text-muted-foreground">MODIFIED</span>
        </div>
      </div>

      {/* Diff Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side - Original */}
        <div
          ref={leftScrollRef}
          className="flex-1 overflow-auto border-r"
          onScroll={() => handleScroll('left')}
        >
          {block.map((block, blockIdx) => (
            <DiffBlockView
              key={blockIdx}
              block={block}
              side="original"
              collapsed={collapsedBlocks.has(blockIdx)}
              onToggleCollapse={() => {
                setCollapsedBlocks(prev => {
                  const next = new Set(prev)
                  if (next.has(blockIdx)) {
                    next.delete(blockIdx)
                  } else {
                    next.add(blockIdx)
                  }
                  return next
                })
              }}
            />
          ))}
        </div>

        {/* Right Side - Modified */}
        <div
          ref={rightScrollRef}
          className="flex-1 overflow-auto"
          onScroll={() => handleScroll('right')}
        >
          {block.map((block, blockIdx) => (
            <DiffBlockView
              key={blockIdx}
              block={block}
              side="modified"
              collapsed={collapsedBlocks.has(blockIdx)}
              onToggleCollapse={() => {
                setCollapsedBlocks(prev => {
                  const next = new Set(prev)
                  if (next.has(blockIdx)) {
                    next.delete(blockIdx)
                  } else {
                    next.add(blockIdx)
                  }
                  return next
                })
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}


interface DiffBlockViewProps{
    block:DiffBlock,
    side:'original'|'modified',
    collapsed:boolean,
    onToggleCollapse:()=>void
}

function DiffBlockView({block,side,collapsed,onToggleCollapse}:DiffBlockViewProps){
    if(!block.hasChanges && collapsed){
        const unchangedCount = block.lines.length
        return (
      <div
        className="flex items-center justify-center py-3 bg-muted/30 border-y cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={onToggleCollapse}
      >
        <ChevronDown className="h-4 w-4 mr-2 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          {unchangedCount} unchanged lines
        </span>
      </div>
    )

    }

    if (!block.hasChanges && !collapsed) {
    return (
      <div>
        {block.lines.map((line, idx) => (
          <DiffLineView key={idx} line={line} side={side} />
        ))}
        <div
          className="flex items-center justify-center py-2 bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors"
          onClick={onToggleCollapse}
        >
          <ChevronUp className="h-4 w-4 mr-2 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Collapse unchanged</span>
        </div>
      </div>
    )
  }

  return (
    <div>
      {block.lines.map((line, idx) => (
        <DiffLineView key={idx} line={line} side={side} />
      ))}
    </div>
  )
    }


interface DiffLineViewProps {
    line:DiffLine,
    side:'original'|'modified'
}

function DiffLineView({ line, side }: DiffLineViewProps) {
  const isOriginal = side === 'original'
  const content = isOriginal ? line.original : line.modified
  const lineNum = isOriginal ? line.origLineNum : line.modLineNum

  // Determine styling based on line type
  let bgColor = ''
  let borderColor = ''
  let textColor = ''

  if (line.type === 'delete' && isOriginal) {
    bgColor = 'bg-red-500/10'
    borderColor = 'border-l-2 border-red-500'
    textColor = 'text-red-100'
  } else if (line.type === 'insert' && !isOriginal) {
    bgColor = 'bg-green-500/10'
    borderColor = 'border-l-2 border-green-500'
    textColor = 'text-green-100'
  } else if (line.type === 'modify') {
    bgColor = 'bg-yellow-500/10'
    borderColor = 'border-l-2 border-yellow-500'
    textColor = 'text-yellow-100'
  }

  // Empty line placeholder
  if (content === null) {
    return (
      <div className="flex h-6 bg-muted/20">
        <div className="w-12 flex-shrink-0 text-muted-foreground text-right pr-2 select-none"></div>
        <div className="flex-1"></div>
      </div>
    )
  }

  return (
    <div className={`flex h-6 ${bgColor} ${borderColor} hover:bg-opacity-70 transition-colors`}>
      <div className="w-12 flex-shrink-0 text-muted-foreground text-right pr-2 text-xs font-mono leading-6 select-none">
        {lineNum}
      </div>
      <div className={`flex-1 px-2 text-xs font-mono leading-6 whitespace-pre overflow-x-auto ${textColor}`}>
        {content || '\u00A0'}
      </div>
    </div>
  )
}