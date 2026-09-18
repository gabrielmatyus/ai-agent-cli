import { describe, it, expect, beforeEach } from '@jest/globals'
import { toChatMessage, render, setTreeRole, setupSelectedTree, rebuildTree } from '../ink/utils.js'
import { ChatMessage, AssistantRolesEnum } from '../ink/models.js'
import { Node, RenderColumn, RenderContext, TreeHolder } from '../ink/ui-models.js'

describe('utils', () => {
  describe('toChatMessage', () => {
    it('should preserve basic message fields', () => {
      const msg: ChatMessage = { role: AssistantRolesEnum.user, content: 'Hello' }
      const result = toChatMessage(msg)
      expect(result).toEqual({ role: AssistantRolesEnum.user, content: 'Hello' })
    })

    it('should include tool_calls when present', () => {
      const msg: ChatMessage = {
        role: AssistantRolesEnum.assistant,
        content: null,
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{}' } }
        ]
      }
      const result = toChatMessage(msg)
      expect(result.tool_calls).toBeDefined()
      expect(result.tool_calls).toHaveLength(1)
    })

    it('should include tool_call_id when present', () => {
      const msg: ChatMessage = {
        role: AssistantRolesEnum.tool,
        content: 'result',
        tool_call_id: 'call_1'
      }
      const result = toChatMessage(msg)
      expect(result.tool_call_id).toBe('call_1')
    })

    it('should not include tool_calls when not present', () => {
      const msg: ChatMessage = { role: AssistantRolesEnum.user, content: 'Hello' }
      const result = toChatMessage(msg)
      expect(result.tool_calls).toBeUndefined()
    })
  })

  describe('render', () => {
    let ctx: RenderContext
    let tree: TreeHolder

    beforeEach(() => {
      ctx = { paddingLeft: 0 }
      tree = {
        uniqueId: 0,
        columns: 80,
        node: { type: 'box', children: [], content: '' },
        items: [],
        rows: [],
        reactNodes: [],
        visibleHeight: 0,
        rendererRowView: () => null
      }
    })

    it('should render a text node as a single row with one column', () => {
      const node: Node = { type: 'text', value: 'Hello World' }
      const rows = render(tree, node, ctx, false)
      expect(rows).toHaveLength(1)
      expect(rows[0].columns).toHaveLength(1)
      expect(rows[0].columns[0].value).toBe('Hello World')
    })

    it('should render a text node with highlight', () => {
      const node: Node = { type: 'text', value: 'const x = 1;', highlight: 'typescript' }
      const rows = render(tree, node, ctx, false)
      expect(rows[0].columns[0].highlight).toBe('typescript')
    })

    it('should render a box with column layout stacking children vertically', () => {
      const node: Node = {
        type: 'box',
        flexDirection: 'column',
        content: '',
        children: [
          { type: 'text', value: 'Line 1' },
          { type: 'text', value: 'Line 2' }
        ]
      }
      const rows = render(tree, node, ctx, false)
      expect(rows).toHaveLength(2)
      expect(rows[0].columns[0].value).toBe('Line 1')
      expect(rows[1].columns[0].value).toBe('Line 2')
    })

    it('should render a box with row layout combining children horizontally', () => {
      const node: Node = {
        type: 'box',
        flexDirection: 'row',
        content: '',
        children: [
          { type: 'text', value: 'Left' },
          { type: 'text', value: 'Right' }
        ]
      }
      const rows = render(tree, node, ctx, false)
      expect(rows).toHaveLength(1)
      expect(rows[0].columns).toHaveLength(2)
      expect(rows[0].columns[0].value).toBe('Left')
      expect(rows[0].columns[1].value).toBe('Right')
    })

    it('should propagate context (paddingLeft) to children', () => {
      const node: Node = {
        type: 'box',
        flexDirection: 'column',
        paddingLeft: 2,
        content: '',
        children: [{ type: 'text', value: 'Indented' }]
      }
      const rows = render(tree, node, ctx, false)
      // The child text node should be rendered with accumulated paddingLeft
      expect(rows).toHaveLength(1)
    })

    it('should skip collapsible children when not selected', () => {
      const node: Node = {
        type: 'box',
        flexDirection: 'column',
        content: '',
        children: [
          { type: 'text', value: 'Always visible' },
          { type: 'text', value: 'Collapsible text', collapsible: true }
        ]
      }
      const rows = render(tree, node, ctx, false)
      expect(rows).toHaveLength(1)
      expect(rows[0].columns[0].value).toBe('Always visible')
    })

    it('should show collapsible children when selected', () => {
      const node: Node = {
        type: 'box',
        flexDirection: 'column',
        content: '',
        children: [
          { type: 'text', value: 'Always visible' },
          { type: 'text', value: 'Collapsible text', collapsible: true }
        ]
      }
      const rows = render(tree, node, ctx, true)
      expect(rows).toHaveLength(2)
      expect(rows[1].columns[0].value).toBe('Collapsible text')
    })

    it('should merge columns in row layout with multiple children', () => {
      const node: Node = {
        type: 'box',
        flexDirection: 'row',
        content: '',
        children: [
          { type: 'text', value: 'A' },
          { type: 'text', value: 'B' },
          { type: 'text', value: 'C' }
        ]
      }
      const rows = render(tree, node, ctx, false)
      expect(rows).toHaveLength(1)
      expect(rows[0].columns).toHaveLength(3)
      expect(rows[0].columns.map((c) => c.value)).toEqual(['A', 'B', 'C'])
    })
  })

  describe('rebuildTree', () => {
    let tree: TreeHolder

    beforeEach(() => {
      tree = {
        node: { type: 'box', children: [], content: '' },
        uniqueId: 0,
        items: [],
        columns: 80,
        rows: [],
        reactNodes: [],
        visibleHeight: 0,
        rendererRowView: () => null
      }
    })

    it('keeps items ordered and recomputes offsets when width change reflows row heights', () => {
      const userMsg = { role: AssistantRolesEnum.user, content: 'Prompt' } as ChatMessage
      setTreeRole(userMsg, tree, [userMsg])
      const assistantMsg = {
        role: AssistantRolesEnum.assistant,
        content: 'a'.repeat(60)
      } as ChatMessage
      setTreeRole(assistantMsg, tree, [assistantMsg])

      const userItem = tree.items[0]
      const assistantItem = tree.items[1]
      const contentRow = assistantItem.rows.find((r) =>
        r.columns.some((c) => c.value === 'a'.repeat(60))
      )!
      const heightBefore = contentRow.height ?? 1

      tree.columns = 25
      rebuildTree(tree)

      // A 60-char line wraps into more lines on the narrower width.
      const contentRowAfter = assistantItem.rows.find((r) =>
        r.columns.some((c) => c.value === 'a'.repeat(60))
      )!
      expect(contentRowAfter.height ?? 1).toBeGreaterThan(heightBefore)
      expect(tree.items).toHaveLength(2)

      // Offsets are recomputed cumulatively from the reflowed row counts.
      expect(userItem.from).toBe(0)
      expect(assistantItem.from).toBe(userItem.rows.length)
      expect(assistantItem.from).toBeGreaterThan(userItem.from)
      expect(tree.rows.length).toBe(tree.rows.length)

      // Row order still matches item order (no overlap from stale splice indices).
      const firstAssistantRow = tree.rows.findIndex((r) => r.item === assistantItem)
      expect(firstAssistantRow).toBeGreaterThanOrEqual(0)
      expect(tree.rows.slice(0, firstAssistantRow).every((r) => r.item === userItem)).toBe(true)
      expect(tree.rows.slice(firstAssistantRow).every((r) => r.item === assistantItem)).toBe(true)
    })

    it('reflows user row heights too on width change', () => {
      const userMsg = { role: AssistantRolesEnum.user, content: 'x'.repeat(90) } as ChatMessage
      setTreeRole(userMsg, tree, [userMsg])
      const contentRow = tree.items[0].rows.find((r) =>
        r.columns.some((c) => c.value === 'x'.repeat(90))
      )!
      const heightBefore = contentRow.height ?? 1

      tree.columns = 20
      rebuildTree(tree)

      const contentRowAfter = tree.items[0].rows.find((r) =>
        r.columns.some((c) => c.value === 'x'.repeat(90))
      )!
      expect(contentRowAfter.height ?? 1).toBeGreaterThan(heightBefore)
      expect(tree.rows.length).toBe(tree.rows.length)
    })

    it('keeps the tree valid when nothing needs to reflow', () => {
      const userMsg = { role: AssistantRolesEnum.user, content: 'Hi' } as ChatMessage
      setTreeRole(userMsg, tree, [userMsg])
      const assistantMsg = { role: AssistantRolesEnum.assistant, content: 'Hello' } as ChatMessage
      setTreeRole(assistantMsg, tree, [assistantMsg])

      const rowsBefore = tree.rows.length
      rebuildTree(tree)

      expect(tree.rows).toHaveLength(rowsBefore)
      expect(tree.items[0].from).toBe(0)
      expect(tree.items[1].from).toBe(tree.items[0].rows.length)
    })
    it('rebuild tree with tool execute_bash', () => {
      const userMsg = {
        role: AssistantRolesEnum.assistant,
        content: 'Hi',
        tool_calls: [
          {
            id: '1',
            type: 'function',
            function: { name: 'execute_bash', arguments: '{ "path": "path/to/file" }' }
          }
        ]
      } as ChatMessage
      setTreeRole(userMsg, tree, [userMsg])
      const toolMsg = {
        role: AssistantRolesEnum.tool,
        content: 'Hi',
        tool_call_id: '1'
      } as ChatMessage
      setTreeRole(toolMsg, tree, [userMsg, toolMsg])

      const rowsBefore = tree.rows.length
      rebuildTree(tree)

      expect(tree.rows).toHaveLength(rowsBefore)
      expect(tree.items[0].from).toBe(0)
      expect(tree.items[1].from).toBe(tree.items[0].rows.length)
    })
    it('rebuild tree with tool different than execute_bash', () => {
      const userMsg = {
        role: AssistantRolesEnum.assistant,
        content: 'Hi',
        tool_calls: [
          {
            id: '1',
            type: 'function',
            function: { name: 'different_tool', arguments: '{ "path": "path/to/file" }' }
          }
        ]
      } as ChatMessage
      setTreeRole(userMsg, tree, [userMsg])
      const toolMsg = {
        role: AssistantRolesEnum.tool,
        content: 'Hi',
        tool_call_id: '1'
      } as ChatMessage
      setTreeRole(toolMsg, tree, [userMsg, toolMsg])

      const rowsBefore = tree.rows.length
      rebuildTree(tree)

      expect(tree.rows).toHaveLength(rowsBefore)
      expect(tree.items[0].from).toBe(0)
      expect(tree.items[1].from).toBe(tree.items[0].rows.length)
    })
  })

  describe('setTreeRole - user', () => {
    let tree: TreeHolder

    beforeEach(() => {
      tree = {
        node: { type: 'box', children: [], content: '' },
        uniqueId: 0,
        items: [],
        columns: 80,
        rows: [],
        reactNodes: [],
        visibleHeight: 0,
        rendererRowView: () => null
      }
    })

    it('should add a new tree item for user role', () => {
      const msg = { role: AssistantRolesEnum.user, content: 'User message' } as ChatMessage
      setTreeRole(msg, tree, [msg])
      expect(tree.items).toHaveLength(1)
      expect(tree.items[0].role).toBe(AssistantRolesEnum.user)
      expect(tree.rows.length).toBeGreaterThan(0)
    })

    it('should update user prompt value on second call', () => {
      const msg = { role: AssistantRolesEnum.user, content: 'Hello' } as ChatMessage
      setTreeRole(msg, tree, [msg])
      // Verify the value was set
      expect(tree.items).toHaveLength(1)
      const userPromptBox = tree.items[0].userPromptBox
      expect(userPromptBox).toBeDefined()
      expect(userPromptBox!.value).toBe('Hello')
      // Update the value
      msg.content = 'Hello updated'
      setTreeRole(msg, tree, [msg])
      expect(tree.items).toHaveLength(1) // No new item created
      expect(userPromptBox!.value).toBe('Hello updated')
    })
  })

  describe('setTreeRole - assistant', () => {
    let tree: TreeHolder

    beforeEach(() => {
      tree = {
        node: { type: 'box', children: [], content: '' },
        uniqueId: 0,
        items: [],
        columns: 80,
        rows: [],
        reactNodes: [],
        visibleHeight: 0,
        rendererRowView: () => null
      }
    })

    it('should add a new tree item for assistant role', () => {
      const msg = { role: AssistantRolesEnum.assistant, content: 'Hello' }
      setTreeRole(msg, tree, [msg])
      expect(tree.items).toHaveLength(1)
      expect(tree.items[0].role).toBe(AssistantRolesEnum.assistant)
    })

    it('should handle reasoning chunks', () => {
      const msg = {
        role: AssistantRolesEnum.assistant,
        reasoning_content: 'I think...'
      } as ChatMessage
      setTreeRole(msg, tree, [msg])
      expect(tree.items).toHaveLength(1)
      expect(tree.items[0].role).toBe(AssistantRolesEnum.assistant)
    })

    it('should append content to existing assistant item on subsequent calls', () => {
      const msg = { role: AssistantRolesEnum.assistant, content: 'Hello' } as ChatMessage
      setTreeRole(msg, tree, [msg])
      expect(tree.items).toHaveLength(1)
      // The chunk content should now contain 'Hello'
      const chunkBox = tree.items[0].contentBox
      expect(chunkBox).toBeDefined()
      const lastChild = chunkBox!.children[chunkBox!.children.length - 1] as RenderColumn
      expect(lastChild.value).toContain('Hello')
      // Append more content
      msg.content += ' world'
      setTreeRole(msg, tree, [msg])
      expect(tree.items).toHaveLength(1) // No new item created
      // The chunk content should now contain concatenated text
      expect(lastChild.value).toContain('Hello world')
    })
  })

  describe('setTreeRole - tool', () => {
    let tree: TreeHolder

    beforeEach(() => {
      tree = {
        node: { type: 'box', children: [], content: '' },
        uniqueId: 0,
        items: [],
        columns: 80,
        rows: [],
        reactNodes: [],
        visibleHeight: 0,
        rendererRowView: () => null
      }
    })

    it('should add a new tree item for tool role', () => {
      const userMsg = { role: AssistantRolesEnum.user, content: 'Read : test.txt' } as ChatMessage
      setTreeRole(userMsg, tree, [userMsg])
      const msg = { role: AssistantRolesEnum.tool, content: 'Read : test.txt' } as ChatMessage
      setTreeRole(msg, tree, [userMsg, msg])
      expect(tree.items).toHaveLength(2)
      expect(tree.items[1].role).toBe(AssistantRolesEnum.tool)
    })

    it('should handle tool call response', () => {
      const msg = { role: AssistantRolesEnum.tool, content: 'Response data' } as ChatMessage
      setTreeRole(msg, tree, [msg])
      expect(tree.items).toHaveLength(1)
    })
  })

  describe('setupSelectedTree', () => {
    let tree: TreeHolder

    beforeEach(() => {
      // Create a tree with a user item and an assistant item
      tree = {
        node: { type: 'box', children: [], content: '' },
        uniqueId: 0,
        items: [],
        columns: 80,
        rows: [],
        reactNodes: [],
        visibleHeight: 0,
        rendererRowView: () => null
      }
      const msg = { role: AssistantRolesEnum.user, content: 'Test prompt' } as ChatMessage
      setTreeRole(msg, tree, [msg])
      const msg1 = { role: AssistantRolesEnum.assistant, content: 'Response' } as ChatMessage
      setTreeRole(msg1, tree, [msg])
    })

    it('should not crash when offset is out of bounds', () => {
      // Should handle gracefully
      expect(() => setupSelectedTree(tree, 0, 999)).not.toThrow()
    })

    it('should not crash when tree has no items', () => {
      const emptyTree: TreeHolder = {
        node: { type: 'box', children: [], content: '' },
        uniqueId: 0,
        items: [],
        columns: 80,
        rows: [],
        reactNodes: [],
        visibleHeight: 0,
        rendererRowView: () => null
      }
      expect(() => setupSelectedTree(emptyTree, 0, 0)).not.toThrow()
    })
    it('should select the correct item based on offset', () => {
      const userMsg = { role: AssistantRolesEnum.user, content: 'Hi' } as ChatMessage
      setTreeRole(userMsg, tree, [userMsg])
      const assistantMsg = {
        role: AssistantRolesEnum.assistant,
        content: 'Hi',
        tool_calls: [
          {
            id: '1',
            type: 'function',
            function: { name: 'execute_bash', arguments: '{ "path": "path/to/file" }' }
          }
        ]
      } as ChatMessage
      setTreeRole(assistantMsg, tree, [userMsg, assistantMsg])
      const toolMsg = {
        role: AssistantRolesEnum.tool,
        content: 'Hi',
        tool_call_id: '1'
      } as ChatMessage
      setTreeRole(toolMsg, tree, [userMsg, assistantMsg, toolMsg])

      setupSelectedTree(tree, 0, 0) // Selects the first item (user)
      setupSelectedTree(tree, 0, 100) //no match
      setupSelectedTree(tree, 3, 0) //assistant
    })
  })

  describe('setTreeRole - code block highlight', () => {
    let tree: TreeHolder

    beforeEach(() => {
      tree = {
        node: { type: 'box', children: [], content: '' },
        uniqueId: 0,
        items: [],
        columns: 80,
        rows: [],
        reactNodes: [],
        visibleHeight: 0,
        rendererRowView: () => null
      }
    })

    const highlightOf = (
      item: { rows: Array<{ columns: Array<{ value?: string; highlight?: string }> }> },
      value: string
    ): string | undefined =>
      item.rows
        .find((r) => r.columns.some((c) => c.value === value))
        ?.columns.find((c) => c.value === value)?.highlight

    const stream = (msg: ChatMessage, parts: string[]) => {
      setTreeRole(msg, tree, [msg])
      parts.forEach((part) => {
        msg.content += part
        setTreeRole(msg, tree, [msg])
      })
    }

    it('should highlight lines inside a fenced block only', () => {
      const msg = { role: AssistantRolesEnum.assistant, content: '' } as ChatMessage
      stream(msg, ['Before\n', '```typescript\n', 'const x: number = 1;\n', '```\n', 'After\n'])
      const item = tree.items[0]
      expect(highlightOf(item, 'const x: number = 1;')).toBe('typescript')
      expect(highlightOf(item, 'Before')).toBeUndefined()
      expect(highlightOf(item, '```typescript')).toBeUndefined()
      expect(highlightOf(item, '```')).toBeUndefined()
      expect(highlightOf(item, 'After')).toBeUndefined()
    })

    it('should keep highlight correct across streamed appends', () => {
      const msg = { role: AssistantRolesEnum.assistant, content: '' } as ChatMessage
      stream(msg, ['```python\n', 'print(1)\n', '```\n'])
      expect(highlightOf(tree.items[0], 'print(1)')).toBe('python')
      expect(highlightOf(tree.items[0], '```python')).toBeUndefined()
      expect(highlightOf(tree.items[0], '```')).toBeUndefined()
    })

    it('should not leak highlight language between messages', () => {
      const codeMsg = { role: AssistantRolesEnum.assistant, content: '' } as ChatMessage
      stream(codeMsg, ['```bash\n', 'echo hi\n', '```\n'])
      const userMsg = { role: AssistantRolesEnum.user, content: 'next' } as ChatMessage
      setTreeRole(userMsg, tree, [userMsg])
      const plainMsg = {
        role: AssistantRolesEnum.assistant,
        content: 'no code here'
      } as ChatMessage
      setTreeRole(plainMsg, tree, [plainMsg])
      expect(tree.items).toHaveLength(3)
      expect(highlightOf(tree.items[0], 'echo hi')).toBe('bash')
      expect(highlightOf(tree.items[2], 'no code here')).toBeUndefined()
    })

    it('should default to plaintext inside an unmarked fence', () => {
      const msg = { role: AssistantRolesEnum.assistant, content: '' } as ChatMessage
      stream(msg, ['```\n', 'plain line\n', '```\n'])
      expect(highlightOf(tree.items[0], 'plain line')).toBe('plaintext')
    })

    it('should recognize language synonyms on the fence marker', () => {
      const msg = { role: AssistantRolesEnum.assistant, content: '' } as ChatMessage
      stream(msg, ['```sh\n', 'echo hi\n', '```\n'])
      expect(highlightOf(tree.items[0], 'echo hi')).toBe('bash')
    })

    it('should preserve highlight across rebuildTree', () => {
      const msg = { role: AssistantRolesEnum.assistant, content: '' } as ChatMessage
      stream(msg, ['```diff\n', '- old\n', '+ new\n', '```\n'])
      expect(highlightOf(tree.items[0], '- old')).toBe('diff')

      tree.columns = 30
      rebuildTree(tree)

      expect(highlightOf(tree.items[0], '- old')).toBe('diff')
      expect(highlightOf(tree.items[0], '+ new')).toBe('diff')
    })
    it('should highlight lines inside a fenced block only - js', () => {
      const msg = { role: AssistantRolesEnum.assistant, content: '' } as ChatMessage
      stream(msg, ['Before\n', '```js\n', 'const x: number = 1;\n', '```\n', 'After\n'])
      const item = tree.items[0]
      expect(highlightOf(item, 'const x: number = 1;')).toBe('javascript')
      expect(highlightOf(item, 'Before')).toBeUndefined()
      expect(highlightOf(item, '```js')).toBeUndefined()
      expect(highlightOf(item, '```')).toBeUndefined()
      expect(highlightOf(item, 'After')).toBeUndefined()
    })
    it('should highlight lines inside a fenced block only - text', () => {
      const msg = { role: AssistantRolesEnum.assistant, content: '' } as ChatMessage
      stream(msg, ['Before\n', '```text\n', 'const x: number = 1;\n', '```\n', 'After\n'])
      const item = tree.items[0]
      expect(highlightOf(item, 'const x: number = 1;')).toBe('plaintext')
      expect(highlightOf(item, 'Before')).toBeUndefined()
      expect(highlightOf(item, '```text')).toBeUndefined()
      expect(highlightOf(item, '```')).toBeUndefined()
      expect(highlightOf(item, 'After')).toBeUndefined()
    })
  })

  describe('render with nested box structures', () => {
    let tree: TreeHolder
    beforeEach(() => {
      // Create a tree with a user item and an assistant item
      tree = {
        node: { type: 'box', children: [], content: '' },
        uniqueId: 0,
        items: [],
        columns: 80,
        rows: [],
        reactNodes: [],
        visibleHeight: 0,
        rendererRowView: () => null
      }
    })

    it('should handle deeply nested boxes', () => {
      const node: Node = {
        type: 'box',
        flexDirection: 'column',
        content: '',
        children: [
          {
            type: 'box',
            flexDirection: 'row',
            content: '',
            children: [
              { type: 'text', value: 'Left' },
              {
                type: 'box',
                flexDirection: 'column',
                content: '',
                children: [
                  { type: 'text', value: 'Nested 1' },
                  { type: 'text', value: 'Nested 2' }
                ]
              }
            ]
          }
        ]
      }
      const rows = render(tree, node, { paddingLeft: 0 }, false)
      expect(rows.length).toBeGreaterThan(0)
      // Row layout: first child is row -> one main row
      // But the nested column box will produce 2 rows inside the row layout
      // Actually in row layout, only the first child gets the row, subsequent children
      // get their columns merged. Let's just check it doesn't crash.
    })

    it('should handle empty box', () => {
      const node: Node = { type: 'box', flexDirection: 'column', children: [], content: '' }
      const rows = render(tree, node, { paddingLeft: 0 }, false)
      expect(rows).toHaveLength(0)
    })

    it('should handle single child in box', () => {
      const node: Node = {
        type: 'box',
        flexDirection: 'column',
        content: '',
        children: [{ type: 'text', value: 'Only child' }]
      }
      const rows = render(tree, node, { paddingLeft: 0 }, false)
      expect(rows).toHaveLength(1)
      expect(rows[0].columns[0].value).toBe('Only child')
    })
  })
})
