import { ChatMessage, AssistantRolesEnum, ToolCallEvent } from "./models.js"
import { Node, RenderContentBox, RenderContext, RenderRow, RenderColumn, TreeHolder, TreeItem } from "./ui-models.js"

export function toChatMessage(msg: ChatMessage): ChatMessage {
  return {
    role: msg.role,
    content: msg.content,
    ...(msg.tool_calls !== undefined && { tool_calls: msg.tool_calls }),
    ...(msg.tool_call_id !== undefined && { tool_call_id: msg.tool_call_id })
  }
}

export function render(tree: TreeHolder, node: Node, ctx: RenderContext, selected: boolean): RenderRow[] {
  switch (node.type) {

    case 'text': {
      return [{
            key: `row-${tree.uniqueId++}`,
            ...ctx,
            columns: [{
                key: `col-${tree.uniqueId++}`, ...node
            }],
      }];
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
        maxHeight: node.maxHeight ?? ctx.maxHeight,
      };

      const rows: RenderRow[] = [];
      if (node.flexDirection === 'row') {
        // 2. row layout = concat children horizontally
        let mainRow: RenderRow | null = null;
        for (const child of node.children) {
            if (!mainRow) {
                mainRow = render(tree, child, nextCtx, selected)[0]
                rows.push(mainRow)
            } else {
                mainRow.columns.push( { key: `col-${tree.uniqueId++}`, ...child as RenderColumn} )
            }
        }
      } else {
        // 2. column layout = concat children vertically
        for (const child of node.children) {
            if (!child.collapsible || selected) {
                const childRows = render(tree, child, nextCtx, selected)
                rows.push(...childRows);
            }
        }
      }

      return rows;
    }
  }
}

let language: string | undefined = undefined
let setLanguage: boolean = false
let languageSet = false
function decodeLanguage(str: string) {
    if (str.includes('```')) { setLanguage = !setLanguage; if (!setLanguage) { language = undefined; languageSet = false} }
    else if (setLanguage) {
        if (languageSet) return
        languageSet = true
        if (str.includes('bash')) language = 'bash'
        else if ( str.includes('typescript') || str.includes('tsx') || str.includes('ts') ) language = 'typescript'
        else if (str.includes('javascript') || str.includes('js') ) language = 'javascript'
        else if (str.includes('diff') ) language = 'diff'
        else language = 'plaintext'
    }
}

function addNodeToTree(baseRole: AssistantRolesEnum, role: AssistantRolesEnum, tree: TreeHolder, node: RenderContentBox) {
    const treeItem: TreeItem = { baseRole, role, from: tree.rowsCount, node, rows: [], selected: false, rowsCount: 0 }
    tree.items.push(treeItem);
    switch(baseRole) {
        case AssistantRolesEnum.user: {
            treeItem.userPromptBox = node.children[1] as RenderColumn
            break
        }
        case AssistantRolesEnum.assistant: {
            treeItem.reasoningContentBox = (node.children[3] as RenderContentBox).children[1] as RenderContentBox
            treeItem.contentBox = node.children[5] as RenderContentBox
            break
        }
        case AssistantRolesEnum.tool: {
            treeItem.toolCallsBox = node.children[0] as RenderContentBox
            treeItem.toolCallsResponseBox = node.children[1] as RenderContentBox
            break
        }
        default:
            break;
    }
    setNodeInTree(tree, treeItem)
}

function setNodeInTree(tree: TreeHolder, treeItem: TreeItem) {
    tree.rowsCount -= treeItem.rowsCount
    treeItem.rows = render(tree, treeItem.node, tree.node, treeItem.selected)
    treeItem.rowsCount =  0
    treeItem.rows.forEach((row) => 
    {
        let strLength = 0
        row.columns.forEach((col) => strLength += (col.value ?? '').length)
        let rowsCount = Math.ceil(strLength / (tree.columns - (row.paddingLeft ?? 0 ) - (row.borderLeft ? 1 : 0) - 0 ) )
        row.height = (rowsCount > 1 ? rowsCount : 1)
        row.minHeight = row.height
        row.maxHeight = row.height
        treeItem.rowsCount += row.height

    })
    tree.rowsCount += treeItem.rowsCount
}

export const setTreeRole = (baseRole: AssistantRolesEnum, role: AssistantRolesEnum, tree: TreeHolder, value: string, toolCall?: ToolCallEvent) => {
    if ([AssistantRolesEnum.assistantReasoningContent, AssistantRolesEnum.assistantContent].includes(role)) {
          decodeLanguage(value)
    }
    const last = tree.items[tree.items.length - 1]
    if (!last || (last.baseRole !== baseRole)) {
        const node = getNodeByRole(baseRole) as Node
        addNodeToTree(baseRole, role, tree, node as RenderContentBox);
    }
    setTreeRoleValue(baseRole, role, tree, value, toolCall)
}

const setupBox = (box: RenderContentBox, content?: string) => {
    if (box.children.length === 0) {
        box.children.push({ type: 'text'} ) 
        box.children.push({ type: 'text'} ) 
    }
    const lines = splitLines(0, content ?? '')
    lines.forEach((line) => {
        const text = box.children[box.children.length - 1] as RenderColumn
        text.value = line
        box.children.push({ type: 'text'} )
    })
}

const setupBoxAppend = (box: RenderContentBox, content?: string) => {
    const lines = splitLines(0, content ?? '')
    lines.forEach((line) => box.children.push({ type: 'text', value: line, highlight: language}))
}

const setTreeRoleValue = (baseRole: AssistantRolesEnum, role: AssistantRolesEnum, tree: TreeHolder, value: string, toolCall?: ToolCallEvent) => {
    switch(baseRole) {
        case AssistantRolesEnum.user: {
            const treeItem = tree.items[tree.items.length - 1];
            const userPromptBox = treeItem.userPromptBox as RenderColumn
            userPromptBox.value = value
            setNodeInTree(tree, treeItem)
            break
        }
        case AssistantRolesEnum.assistant: {
            const treeItem = tree.items[tree.items.length - 1];
            const box = (role === AssistantRolesEnum.assistantReasoningContent ? treeItem.reasoningContentBox : treeItem.contentBox) as RenderContentBox
            box.content = (box.content ?? '') + value
            const lines = splitLines(0, value)
            lines.forEach((line, i) => {
                const column = box.children[box.children.length - 1] as RenderColumn
                column.highlight = language
                column.value = (column.value ?? '') + line
                if (i > 0) box.children.push({ type: 'text'} )
            })
            setNodeInTree(tree, treeItem)
            break
        }
        case AssistantRolesEnum.tool: {
            const treeItem = tree.items[tree.items.length - 1];
            const box = treeItem.toolCallsBox as RenderContentBox
            box.content = (box.content ?? '') + (box.content ? '\n': '') + value 
            setupBox(box as RenderContentBox, value)

            if (toolCall?.name === 'execute_bash') {
                const box = treeItem.toolCallsResponseBox as RenderContentBox
                box.content = (box.content ?? '') + (box.content ? '\n': '') + value
                setupBox(box, toolCall?.content)
            }
            setNodeInTree(tree, treeItem)
            break
        }
        default:
            break
    }
}

function getNodeByRole(baseRole: AssistantRolesEnum): Node | null {
    switch(baseRole) {
       case AssistantRolesEnum.user:
          return  { type: 'box', flexDirection: 'column', paddingLeft: 1, borderStyle: 'classic', borderLeft: true, borderLeftColor:"blueBright",
                borderTop:false, borderBottom: false, borderRight: false, backgroundColor: '#111', //backgroundColor: 'blueBright',
                children:[
                    {type: 'text'},
                    {type: 'text'},
                    {type: 'text'},
                ]
              } as Node;
        case AssistantRolesEnum.assistant: 
            return {
              type: 'box', flexDirection: 'column', paddingLeft: 2,
              children: [
                { type: 'text'},
                { type: 'box', flexDirection: 'row', children: [
                    { type: 'text', value: '+', color: 'yellow'},
                    { type: 'text', value: 'Thinking', color: 'yellow', paddingLeft: 1},
                    { type: 'text', value: '0.3s', color: 'yellow', paddingLeft: 2}
                  ]
                },
                { type: 'text'},
                { type: 'box', collapsible: true, flexDirection: 'column', paddingLeft: 1, backgroundColor: '#111', children: [
                    { type: 'text'},
                    { type: 'box', flexDirection: 'column', children: [
                        { type: 'text', highlight: language},
                      ]
                    },
                    { type: 'text'},
                  ]
                },
                { type: 'text'},
                { type: 'box', flexDirection: 'column', children: [
                    { type: 'text', highlight: language},
                  ]
                },
                {type: 'text'},
              ],
          } as Node
        case AssistantRolesEnum.tool:
            return { type: 'box', flexDirection: 'column', paddingLeft: 1, 
                children:[
                  { type: 'box', flexDirection: 'column', paddingLeft: 1, borderStyle: 'classic', borderLeft: true, borderLeftColor:"yellow", borderTop:false, borderBottom: false, borderRight: false, backgroundColor: '#111', color: 'yellow',
                      children: [
                          /*tool call command*/
                      ]
                  },
                  { type: 'box', flexDirection: 'column', paddingLeft: 2,
                      children: [
                          /*tool call reponse*/
                      ]
                  },
                  { type: 'text'},
                ]
              } as Node
        default:
            return null
    }
}

export const setupSelectedTree = (tree: TreeHolder, offset: number) => {
    const foundItem: TreeItem | undefined = tree.items.find((item) => (item.from <= offset && offset <= item.from + item.rowsCount) )
    if (!foundItem) return
    
    const treeItem = foundItem as TreeItem
    //It is assistant and click happened in Thinking area
    if (treeItem.baseRole === AssistantRolesEnum.assistant && (treeItem.from - 2 <= offset && offset <= treeItem.from + 4) ) {
        treeItem.selected = !treeItem.selected
        setNodeInTree(tree, treeItem)
        const indexSelected = tree.items.indexOf(treeItem)
        for(let i = indexSelected + 1; i <= tree.items.length - 1; i++ ) {
            const prevTreeItem = tree.items[i - 1]
            const treeItem = tree.items[i]
            treeItem.from = prevTreeItem.from + prevTreeItem.rowsCount
        }
    }
}

const splitLines = (leading: number, content: string): string[] => {
    if (!content) return [];
    const result: string[] = [];
    const lines = content.includes('\n') ? content.split('\n') : [content]
    lines.forEach((line, i) => {
        if (i === 0 && line.length > leading) result.push()
        result.push(line)
    })

    return result;
}
export const rebuildTree = (tree: TreeHolder) => {
    tree.items.forEach((treeItem) => {
        switch(treeItem.baseRole) {
            case AssistantRolesEnum.assistant : {
                let box = treeItem.reasoningContentBox as RenderContentBox
                box.children = []
                setupBoxAppend(box, box.content)

                box = treeItem.contentBox as RenderContentBox
                box.children = []
                setupBoxAppend(box, box.content)
                
                setNodeInTree(tree, treeItem)
                break;
            }
            case AssistantRolesEnum.tool : {
                let box = treeItem.toolCallsBox as RenderContentBox
                box.children = []
                setupBox(box, box.content)

                box = treeItem.toolCallsResponseBox as RenderContentBox
                if (box.content) {
                    box.children = []
                    setupBox(box, box.content)
                }

                setNodeInTree(tree, treeItem)
                break;
            }
            default:
                break;
        }
    })
    for(let i = 1; i < tree.items.length; i++ ) {
        const prevTreeItem = tree.items[i - 1]
        const treeItem = tree.items[i]
        treeItem.from = prevTreeItem.from + prevTreeItem.rowsCount
    }
}

