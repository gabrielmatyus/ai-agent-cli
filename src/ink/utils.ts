import { ReactNode } from 'react'
import { ChatMessage, AssistantRolesEnum, FunctionArguments } from './models.js'
import {
  Node,
  RenderContentBox,
  RenderContext,
  RenderRow,
  RenderColumn,
  TreeHolder,
  TreeItem
} from './ui-models.js'

export function toChatMessage(msg: ChatMessage): ChatMessage {
  return {
    role: msg.role,
    content: msg.content,
    ...(msg.tool_calls !== undefined && { tool_calls: msg.tool_calls }),
    ...(msg.tool_call_id !== undefined && { tool_call_id: msg.tool_call_id })
  }
}

export function render(
  tree: TreeHolder,
  node: Node,
  ctx: RenderContext,
  selected: boolean
): RenderRow[] {
  switch (node.type) {
    case 'text': {
      return [
        {
          key: `row-${tree.uniqueId++}`,
          ...ctx,
          columns: [
            {
              key: `col-${tree.uniqueId++}`,
              ...node
            }
          ]
        }
      ]
    }

    case 'box': {
      // 1. update context
      const nextCtx: RenderContext = {
        paddingLeft: (ctx.paddingLeft ?? 0) + (node.paddingLeft ?? 0),
        backgroundColor: node.backgroundColor ?? ctx.backgroundColor,
        borderStyle: node.borderStyle ?? ctx.borderStyle,
        borderLeft: node.borderLeft ?? ctx.borderLeft,
        borderTop: node.borderTop ?? ctx.borderTop,
        borderBottom: node.borderBottom ?? ctx.borderBottom,
        borderRight: node.borderRight ?? ctx.borderRight,
        borderLeftColor: node.borderLeftColor ?? ctx.borderLeftColor,
        color: node.color ?? ctx.color,
        height: node.height ?? ctx.height,
        minHeight: node.minHeight ?? ctx.minHeight,
        maxHeight: node.maxHeight ?? ctx.maxHeight
      }

      const rows: RenderRow[] = []
      if (node.flexDirection === 'row') {
        // 2. row layout = concat children horizontally
        let mainRow: RenderRow | null = null
        for (const child of node.children) {
          if (!mainRow) {
            mainRow = render(tree, child, nextCtx, selected)[0]
            rows.push(mainRow)
          } else {
            mainRow.columns.push({ key: `col-${tree.uniqueId++}`, ...(child as RenderColumn) })
          }
        }
      } else {
        // 2. column layout = concat children vertically
        for (const child of node.children) {
          if (!child.collapsible || selected) {
            const childRows = render(tree, child, nextCtx, selected)
            rows.push(...childRows)
          }
        }
      }

      return rows
    }
  }
}

type HighlightState = { inFence: boolean; language: string | undefined }

function normalizeHighlightLanguage(word: string | undefined): string | undefined {
  const token = (word ?? '').trim().toLowerCase()
  if (!token) return undefined
  if (token === 'sh' || token === 'shell' || token === 'bash') return 'bash'
  if (token === 'ts' || token === 'tsx' || token === 'typescript') return 'typescript'
  if (token === 'js' || token === 'jsx' || token === 'javascript') return 'javascript'
  if (token === 'diff') return 'diff'
  if (token === 'text' || token === 'plain' || token === 'plaintext' || token === 'txt')
    return undefined
  return token
}

/**
 * Scans lines for fenced code blocks, returning the per-line highlight and the
 * fence state left after the last line so a later segment can resume
 * incrementally (the streamed append path) instead of re-scanning all of the
 * already-rendered content on every token.
 */
function scanHighlightLines(
  lines: string[],
  initial: HighlightState = EMPTY_HIGHLIGHT_STATE
): { highlights: Array<string | undefined>; state: HighlightState } {
  const highlights: Array<string | undefined> = []
  const state: HighlightState = { ...initial }
  for (const line of lines) {
    const fenceIndex = line.indexOf('```')
    if (fenceIndex !== -1) {
      state.inFence = !state.inFence
      if (state.inFence) {
        const marker = line
          .slice(fenceIndex + 3)
          .trim()
          .split(/\s/)[0]
        state.language = normalizeHighlightLanguage(marker)
      } else {
        state.language = undefined
      }
      highlights.push(undefined)
    } else {
      highlights.push(state.inFence ? (state.language ?? 'plaintext') : undefined)
    }
  }
  return { highlights, state }
}

const EMPTY_HIGHLIGHT_STATE: HighlightState = { inFence: false, language: undefined }

export function highlightLineLanguages(lines: string[]): Array<string | undefined> {
  return scanHighlightLines(lines).highlights
}

// Running fence state per box for the streamed (token) append path. Keyed
// weakly so the metadata never keeps a box alive that would otherwise be GC'd.
const highlightStates = new WeakMap<RenderContentBox, HighlightState>()

function addNodeToTree(role: AssistantRolesEnum, tree: TreeHolder, node: RenderContentBox) {
  const treeItem: TreeItem = {
    role,
    from: tree.rows.length,
    node,
    rows: [],
    selected: false
  }
  tree.items.push(treeItem)
  switch (role) {
    case AssistantRolesEnum.user: {
      treeItem.userPromptBox = node.children[1] as RenderColumn
      break
    }
    case AssistantRolesEnum.assistant: {
      treeItem.reasoningContentBox = (node.children[2] as RenderContentBox)
        .children[1] as RenderContentBox
      treeItem.contentBox = node.children[4] as RenderContentBox
      break
    }
    case AssistantRolesEnum.tool: {
      treeItem.toolCallsBox = node.children[0] as RenderContentBox
      treeItem.toolCallsResponseBox = node.children[1] as RenderContentBox
      break
    }
    default:
      break
  }
  setNodeInTree(tree, treeItem)
}

function setTreeItemRows(tree: TreeHolder, treeItem: TreeItem) {
  treeItem.rows = render(tree, treeItem.node, tree.node, treeItem.selected)
  treeItem.rows.forEach((row) => {
    let strLength = 0
    row.columns.forEach((col) => (strLength += (col.value ?? '').length))
    const rowsCount = Math.ceil(
      strLength / (tree.columns - (row.paddingLeft ?? 0) - (row.borderLeft ? 1 : 0))
    )
    row.height = rowsCount > 1 ? rowsCount : 1
    row.minHeight = row.height
    row.maxHeight = row.height
    row.item = treeItem
  })
}

function setNodeInTree(tree: TreeHolder, treeItem: TreeItem) {
  const oldRowsCount = treeItem.rows.length
  setTreeItemRows(tree, treeItem)
  tree.rows.splice(treeItem.from, oldRowsCount, ...treeItem.rows)
  tree.reactNodes.splice(
    treeItem.from,
    oldRowsCount,
    ...(treeItem.rows.map((row) => tree.rendererRowView({ row })) as ReactNode[])
  )
  tree.visibleHeight =
    tree.rows.length + tree.rows.reduce((s, r) => s + Math.max(0, (r.height ?? 1) - 1), 0)
}

export const setTreeRole = (msg: ChatMessage, tree: TreeHolder, msgs: ChatMessage[]) => {
  const last = tree.items[tree.items.length - 1]
  if (!last || last.role !== msg.role) {
    const node = getNodeByRole(msg.role) as Node
    addNodeToTree(msg.role, tree, node as RenderContentBox)
  }
  setTreeRoleValue(msg, tree, msgs)
}

const setupBox = (box: RenderContentBox, content?: string) => {
  if (box.children.length === 0) {
    box.children.push({ type: 'text' })
    box.children.push({ type: 'text' })
  }
  const lines = splitLines(content ?? '')
  lines.forEach((line) => {
    const text = box.children[box.children.length - 1] as RenderColumn
    text.value = line
    box.children.push({ type: 'text' })
  })
}

const setupBoxAppend = (box: RenderContentBox, content?: string) => {
  const lines = splitLines(content ?? '')
  const { highlights, state } = scanHighlightLines(lines)
  highlightStates.set(box, state)
  lines.forEach((line, i) =>
    box.children.push({ type: 'text', value: line, highlight: highlights[i] })
  )
}

const setupBoxAppendToken = (box: RenderContentBox, content?: string) => {
  const lines = splitLines(content ?? '')
  const { highlights, state } = scanHighlightLines(
    lines,
    highlightStates.get(box) ?? EMPTY_HIGHLIGHT_STATE
  )
  highlightStates.set(box, state)
  lines.forEach((line, i) => {
    if (i === 0) {
      const column = box.children[box.children.length - 1] as RenderColumn
      column.value = (column.value ?? '') + line
      column.highlight = highlights[0]
    } else {
      box.children.push({ type: 'text', value: line, highlight: highlights[i] })
    }
  })
}

function syncContentBox(box: RenderContentBox, newContent?: string | null) {
  if (box.content === newContent) return
  const value = newContent?.slice((box.content ?? '').length) ?? ''
  box.content = newContent ?? ''
  setupBoxAppendToken(box, value)
}

function appendBoxContent(box: RenderContentBox, value?: string | null) {
  const piece = value ?? ''
  box.content = (box.content ?? '') + (box.content ? '\n' : '') + piece
  setupBox(box, piece)
}

const setTreeRoleValue = (msg: ChatMessage, tree: TreeHolder, msgs: ChatMessage[]) => {
  switch (msg.role) {
    case AssistantRolesEnum.user: {
      const treeItem = tree.items[tree.items.length - 1]
      const userPromptBox = treeItem.userPromptBox as RenderColumn
      userPromptBox.value = msg.content ?? undefined
      setNodeInTree(tree, treeItem)
      break
    }
    case AssistantRolesEnum.assistant: {
      const treeItem = tree.items[tree.items.length - 1]

      syncContentBox(treeItem.reasoningContentBox!, msg.reasoning_content ?? msg.reasoning)
      syncContentBox(treeItem.contentBox!, msg.content)

      setNodeInTree(tree, treeItem)
      break
    }
    case AssistantRolesEnum.tool: {
      const treeItem = tree.items[tree.items.length - 1]
      const box = treeItem.toolCallsBox as RenderContentBox

      const msg_tool_calls = msgs.find(
        (tcmsg) =>
          tcmsg.tool_calls &&
          tcmsg.tool_calls.find((tool_call) => tool_call.id === msg.tool_call_id)
      )
      const tool_call = msg_tool_calls?.tool_calls?.find(
        (tool_call) => tool_call.id === msg.tool_call_id
      )
      const functionArguments = tool_call
        ? (JSON.parse(tool_call.function.arguments) as FunctionArguments)
        : undefined
      const boxContent = tool_call
        ? `${tool_call.function.name}: ${
            functionArguments
              ? functionArguments.path
                ? typeof functionArguments.path === 'string'
                  ? functionArguments.path
                  : Array.isArray(functionArguments.path)
                : (functionArguments.command ?? '')
              : ''
          }`
        : 'not_found'
      appendBoxContent(box, boxContent)

      if (tool_call?.function.name === 'execute_bash') {
        appendBoxContent(treeItem.toolCallsResponseBox as RenderContentBox, msg.content)
      }
      setNodeInTree(tree, treeItem)
      break
    }
    default:
      break
  }
}

function getNodeByRole(baseRole: AssistantRolesEnum): Node | null {
  switch (baseRole) {
    case AssistantRolesEnum.user:
      return {
        type: 'box',
        flexDirection: 'column',
        paddingLeft: 1,
        borderStyle: 'classic',
        borderLeft: true,
        borderLeftColor: 'blueBright',
        borderTop: false,
        borderBottom: false,
        borderRight: false,
        backgroundColor: '#111',
        children: [{ type: 'text' }, { type: 'text' }, { type: 'text' }]
      } as Node
    case AssistantRolesEnum.assistant:
      return {
        type: 'box',
        flexDirection: 'column',
        paddingLeft: 2,
        children: [
          { type: 'text' },
          {
            type: 'box',
            flexDirection: 'row',
            children: [
              { type: 'text', value: '+', color: 'yellow' },
              { type: 'text', value: 'Thinking', color: 'yellow', paddingLeft: 1 },
              { type: 'text', value: '0.3s', color: 'yellow', paddingLeft: 2 }
            ]
          },
          {
            type: 'box',
            collapsible: true,
            flexDirection: 'column',
            paddingLeft: 1,
            backgroundColor: '#111',
            children: [
              { type: 'text' },
              {
                type: 'box',
                flexDirection: 'column',
                children: [{ type: 'text' }]
              },
              { type: 'text' }
            ]
          },
          { type: 'text' },
          {
            type: 'box',
            flexDirection: 'column',
            children: [{ type: 'text' }]
          },
          { type: 'text' }
        ]
      } as Node
    case AssistantRolesEnum.tool:
      return {
        type: 'box',
        flexDirection: 'column',
        paddingLeft: 1,
        children: [
          {
            type: 'box',
            flexDirection: 'column',
            paddingLeft: 1,
            borderStyle: 'classic',
            borderLeft: true,
            borderLeftColor: 'yellow',
            borderTop: false,
            borderBottom: false,
            borderRight: false,
            backgroundColor: '#111',
            color: 'yellow',
            children: [/*tool call command*/]
          },
          {
            type: 'box',
            flexDirection: 'column',
            paddingLeft: 2,
            children: [/*tool call reponse*/]
          },
          { type: 'text' }
        ]
      } as Node
    default:
      return null
  }
}

export const getRealIndex = (tree: TreeHolder, baseOffset: number, offset: number): number => {
  let visualScrollPos = 0
  for (let i = 0; i < Math.min(baseOffset, tree.rows.length); i++) {
    visualScrollPos += tree.rows[i].height ?? 1
  }
  const targetPos = visualScrollPos + offset
  let accumulated = 0
  for (let realIndex = 0; realIndex < tree.rows.length; realIndex++) {
    accumulated += tree.rows[realIndex].height ?? 1
    if (accumulated > targetPos) return realIndex
  }
  return -1
}

export const setupSelectedTree = (tree: TreeHolder, baseOffset: number, offset: number) => {
  const realIndex = getRealIndex(tree, baseOffset, offset)
  if (realIndex === -1) return
  const foundItem: TreeItem | undefined = tree.rows[realIndex]?.item

  if (!foundItem) return

  const treeItem = foundItem as TreeItem
  //It is assistant and click happened in Thinking area
  if (
    treeItem.role === AssistantRolesEnum.assistant &&
    treeItem.from - 2 <= realIndex &&
    realIndex <= treeItem.from + 2
  ) {
    treeItem.selected = !treeItem.selected
    setNodeInTree(tree, treeItem)
    const indexSelected = tree.items.indexOf(treeItem)
    for (let i = indexSelected + 1; i <= tree.items.length - 1; i++) {
      const prevTreeItem = tree.items[i - 1]
      const treeItem = tree.items[i]
      treeItem.from = prevTreeItem.from + prevTreeItem.rows.length
    }
  }
}

const splitLines = (content: string): string[] => (content ? content.split('\n') : [])

export const rebuildTree = (tree: TreeHolder) => {
  tree.items.forEach((treeItem) => {
    switch (treeItem.role) {
      case AssistantRolesEnum.assistant: {
        let box = treeItem.reasoningContentBox as RenderContentBox
        box.children = []
        setupBoxAppend(box, box.content)

        box = treeItem.contentBox as RenderContentBox
        box.children = []
        setupBoxAppend(box, box.content)
        break
      }
      case AssistantRolesEnum.tool: {
        let box = treeItem.toolCallsBox as RenderContentBox
        box.children = []
        setupBox(box, box.content)

        box = treeItem.toolCallsResponseBox as RenderContentBox
        if (box.content) {
          box.children = []
          setupBox(box, box.content)
        }
        break
      }
      default:
        break
    }
  })

  // Reflow every item in a single pass so that a change in wrap counts cannot
  // displace later items from their accumulated offsets.
  const rows: RenderRow[] = []
  let from = 0
  for (const treeItem of tree.items) {
    setTreeItemRows(tree, treeItem)
    treeItem.from = from
    from += treeItem.rows.length
    rows.push(...treeItem.rows)
  }
  tree.rows = rows
  tree.reactNodes = rows.map((row) => tree.rendererRowView({ row })) as ReactNode[]
  tree.visibleHeight =
    tree.rows.length + tree.rows.reduce((s, r) => s + Math.max(0, (r.height ?? 1) - 1), 0)
}
