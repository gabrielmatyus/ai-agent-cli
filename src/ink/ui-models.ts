import { Boxes, BoxStyle } from 'cli-boxes'
import { AssistantRolesEnum } from './models.js'
import { ReactNode } from 'react'
export type RenderContext = {
  paddingLeft?: number
  backgroundColor?: string
  borderStyle?: keyof Boxes | BoxStyle | undefined
  borderLeft?: boolean
  borderTop?: boolean
  borderBottom?: boolean
  borderRight?: boolean
  borderLeftColor?: string
  color?: string
  height?: number
  minHeight?: number
  maxHeight?: number
}

export type RenderColumn = RenderContext & {
  type: 'text'
  key?: string
  value?: string
  highlight?: string
  collapsible?: boolean
}

export type RenderContentBox = {
  type: 'box'
  flexDirection?: 'row' | 'column'
  collapsible?: boolean
  children: Node[]
  content: string
}

export type Node = RenderContext & (RenderColumn | RenderContentBox)

export type RenderRow = RenderContext & {
  key: string
  columns: RenderColumn[]
  item?: TreeItem
}

export interface TreeItem {
  role: AssistantRolesEnum //'user' | 'assistant' | 'toolCall'
  from: number //start index in renderRows
  userPromptBox?: RenderColumn
  reasoningContentBox?: RenderContentBox
  contentBox?: RenderContentBox
  toolCallsBox?: RenderContentBox
  toolCallsResponseBox?: RenderContentBox
  node: Node
  rows: RenderRow[] //rendered node in lines
  selected: boolean
}
export type TreeHolder = {
  node: Node //tree of elements
  uniqueId: number //used for keys
  items: TreeItem[] //node tree types and offsets
  columns: number //available width per line (terminal cols - side panel)
  rows: RenderRow[] //rendered node in lines
  reactNodes: ReactNode[]
  visibleHeight: number
  rendererRowView: ({ row }: { row: RenderRow }) => ReactNode
}
