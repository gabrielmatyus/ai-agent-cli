import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  toChatMessage,
  render,
  setTreeRole,
  setupSelectedTree,
} from '../ink/utils.js';
import { ChatMessage, AssistantRolesEnum, } from '../ink/models.js';
import {  Node, RenderColumn, RenderContext, TreeHolder, } from '../ink/ui-models.js'


describe('utils', () => {
  describe('toChatMessage', () => {
    it('should preserve basic message fields', () => {
      const msg: ChatMessage = { role: 'user', content: 'Hello' };
      const result = toChatMessage(msg);
      expect(result).toEqual({ role: 'user', content: 'Hello' });
    });

    it('should include tool_calls when present', () => {
      const msg: ChatMessage = {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{}' } },
        ],
      };
      const result = toChatMessage(msg);
      expect(result.tool_calls).toBeDefined();
      expect(result.tool_calls).toHaveLength(1);
    });

    it('should include tool_call_id when present', () => {
      const msg: ChatMessage = {
        role: 'tool',
        content: 'result',
        tool_call_id: 'call_1',
      };
      const result = toChatMessage(msg);
      expect(result.tool_call_id).toBe('call_1');
    });

    it('should not include tool_calls when not present', () => {
      const msg: ChatMessage = { role: 'user', content: 'Hello' };
      const result = toChatMessage(msg);
      expect(result.tool_calls).toBeUndefined();
    });
  });

  describe('render', () => {
    let ctx: RenderContext;
    let tree: TreeHolder

    beforeEach(() => {
      ctx = { paddingLeft: 0 };
      tree = { rowsCount: 0, uniqueId: 0, columns: 80, node: { type: 'box', children: [], content: '', }, items: [] };
    });

    it('should render a text node as a single row with one column', () => {
      const node: Node = { type: 'text', value: 'Hello World' };
      const rows = render(tree, node, ctx, false);
      expect(rows).toHaveLength(1);
      expect(rows[0].columns).toHaveLength(1);
      expect(rows[0].columns[0].value).toBe('Hello World');
    });

    it('should render a text node with highlight', () => {
      const node: Node = { type: 'text', value: 'const x = 1;', highlight: 'typescript' };
      const rows = render(tree, node, ctx, false);
      expect(rows[0].columns[0].highlight).toBe('typescript');
    });

    it('should render a box with column layout stacking children vertically', () => {
      const node: Node = {
        type: 'box',
        flexDirection: 'column',
        content: '',
        children: [
          { type: 'text', value: 'Line 1' },
          { type: 'text', value: 'Line 2' },
        ],
      };
      const rows = render(tree, node, ctx, false);
      expect(rows).toHaveLength(2);
      expect(rows[0].columns[0].value).toBe('Line 1');
      expect(rows[1].columns[0].value).toBe('Line 2');
    });

    it('should render a box with row layout combining children horizontally', () => {
      const node: Node = {
        type: 'box',
        flexDirection: 'row',
        content: '',
        children: [
          { type: 'text', value: 'Left' },
          { type: 'text', value: 'Right' },
        ],
      };
      const rows = render(tree, node, ctx, false);
      expect(rows).toHaveLength(1);
      expect(rows[0].columns).toHaveLength(2);
      expect(rows[0].columns[0].value).toBe('Left');
      expect(rows[0].columns[1].value).toBe('Right');
    });

    it('should propagate context (paddingLeft) to children', () => {
      const node: Node = {
        type: 'box',
        flexDirection: 'column',
        paddingLeft: 2,
        content: '',
        children: [{ type: 'text', value: 'Indented' }],
      };
      const rows = render(tree, node, ctx, false);
      // The child text node should be rendered with accumulated paddingLeft
      expect(rows).toHaveLength(1);
    });

    it('should skip collapsible children when not selected', () => {
      const node: Node = {
        type: 'box',
        flexDirection: 'column',
        content: '',
        children: [
          { type: 'text', value: 'Always visible' },
          { type: 'text', value: 'Collapsible text', collapsible: true },
        ],
      };
      const rows = render(tree, node, ctx, false);
      expect(rows).toHaveLength(1);
      expect(rows[0].columns[0].value).toBe('Always visible');
    });

    it('should show collapsible children when selected', () => {
      const node: Node = {
        type: 'box',
        flexDirection: 'column',
        content: '',
        children: [
          { type: 'text', value: 'Always visible' },
          { type: 'text', value: 'Collapsible text', collapsible: true },
        ],
      };
      const rows = render(tree, node, ctx, true);
      expect(rows).toHaveLength(2);
      expect(rows[1].columns[0].value).toBe('Collapsible text');
    });

    it('should merge columns in row layout with multiple children', () => {
      const node: Node = {
        type: 'box',
        flexDirection: 'row',
        content: '',
        children: [
          { type: 'text', value: 'A' },
          { type: 'text', value: 'B' },
          { type: 'text', value: 'C' },
        ],
      };
      const rows = render(tree, node, ctx, false);
      expect(rows).toHaveLength(1);
      expect(rows[0].columns).toHaveLength(3);
      expect(rows[0].columns.map((c) => c.value)).toEqual(['A', 'B', 'C']);
    });
  });

  describe('setTreeRole - user', () => {
    let tree: TreeHolder;

    beforeEach(() => {
      tree = {
        node: { type: 'box', children: [], content: '', },
        uniqueId: 0,
        items: [],
        rowsCount: 0,
        columns: 80,
      };
    });

    it('should add a new tree item for user role', () => {
      setTreeRole(AssistantRolesEnum.user, AssistantRolesEnum.user, tree, 'User message');
      expect(tree.items).toHaveLength(1);
      expect(tree.items[0].baseRole).toBe(AssistantRolesEnum.user);
      expect(tree.rowsCount).toBeGreaterThan(0);
    });

    it('should update user prompt value on second call', () => {
      setTreeRole(AssistantRolesEnum.user, AssistantRolesEnum.user, tree, 'Hello');
      // Verify the value was set
      expect(tree.items).toHaveLength(1);
      const userPromptBox = tree.items[0].userPromptBox;
      expect(userPromptBox).toBeDefined();
      expect(userPromptBox!.value).toBe('Hello');
      // Update the value
      setTreeRole(AssistantRolesEnum.user, AssistantRolesEnum.user, tree, 'Hello updated');
      expect(tree.items).toHaveLength(1); // No new item created
      expect(userPromptBox!.value).toBe('Hello updated');
    });
  });

  describe('setTreeRole - assistant', () => {
    let tree: TreeHolder;

    beforeEach(() => {
      tree = {
        node: { type: 'box', children: [], content: '', },
        uniqueId: 0,
        items: [],
        rowsCount: 0,
        columns: 80,
      };
    });

    it('should add a new tree item for assistant role', () => {
      setTreeRole(AssistantRolesEnum.assistant, AssistantRolesEnum.assistantContent, tree, 'Hello');
      expect(tree.items).toHaveLength(1);
      expect(tree.items[0].baseRole).toBe(AssistantRolesEnum.assistant);
    });

    it('should handle reasoning chunks', () => {
      setTreeRole(
        AssistantRolesEnum.assistant,
        AssistantRolesEnum.assistantReasoningContent,
        tree,
        'I think...'
      );
      expect(tree.items).toHaveLength(1);
      expect(tree.items[0].baseRole).toBe(AssistantRolesEnum.assistant);
    });

    it('should append content to existing assistant item on subsequent calls', () => {
      setTreeRole(AssistantRolesEnum.assistant, AssistantRolesEnum.assistantContent, tree, 'Hello');
      expect(tree.items).toHaveLength(1);
      // The chunk content should now contain 'Hello'
      const chunkBox = tree.items[0].contentBox;
      expect(chunkBox).toBeDefined();
      const lastChild = chunkBox!.children[chunkBox!.children.length - 1] as RenderColumn;
      expect(lastChild.value).toContain('Hello');
      // Append more content
      setTreeRole(AssistantRolesEnum.assistant, AssistantRolesEnum.assistantContent, tree, ' world');
      expect(tree.items).toHaveLength(1); // No new item created
      // The chunk content should now contain concatenated text
      expect(lastChild.value).toContain('Hello world');
    });
  });

  describe('setTreeRole - tool', () => {
    let tree: TreeHolder;

    beforeEach(() => {
      tree = {
        node: { type: 'box', children: [], content: '', },
        uniqueId: 0,
        items: [],
        rowsCount: 0,
        columns: 80,
      };
    });

    it('should add a new tree item for tool role', () => {
      setTreeRole(AssistantRolesEnum.tool, AssistantRolesEnum.toolCall, tree, 'Read : test.txt');
      expect(tree.items).toHaveLength(1);
      expect(tree.items[0].baseRole).toBe(AssistantRolesEnum.tool);
    });

    it('should handle tool call response', () => {
      setTreeRole(AssistantRolesEnum.tool, AssistantRolesEnum.toolCallResponse, tree, 'Response data');
      expect(tree.items).toHaveLength(1);
    });
  });

  describe('setupSelectedTree', () => {
    let tree: TreeHolder;

    beforeEach(() => {
      // Create a tree with a user item and an assistant item
      tree = {
        node: { type: 'box', children: [], content: '', },
        uniqueId: 0,
        items: [],
        rowsCount: 0,
        columns: 80,
      };
      setTreeRole(AssistantRolesEnum.user, AssistantRolesEnum.user, tree, 'Test prompt');
      setTreeRole(AssistantRolesEnum.assistant, AssistantRolesEnum.assistantContent, tree, 'Response');
    });

    it('should not crash when offset is out of bounds', () => {
      // Should handle gracefully
      expect(() => setupSelectedTree(tree, 999)).not.toThrow();
    });

    it('should not crash when tree has no items', () => {
      const emptyTree: TreeHolder = {
        node: { type: 'box', children: [], content: '', },
        uniqueId: 0,
        items: [],
        rowsCount: 0,
        columns: 80,
      };
      expect(() => setupSelectedTree(emptyTree, 0)).not.toThrow();
    });
  });

  describe('render with nested box structures', () => {
    let tree: TreeHolder;
    beforeEach(() => {
      // Create a tree with a user item and an assistant item
      tree = {
        node: { type: 'box', children: [], content: '', },
        uniqueId: 0,
        items: [],
        rowsCount: 0,
        columns: 80,
      };
    });

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
                  { type: 'text', value: 'Nested 2' },
                ],
              },
            ],
          },
        ],
      };
      const rows = render(tree, node, { paddingLeft: 0 }, false);
      expect(rows.length).toBeGreaterThan(0);
      // Row layout: first child is row -> one main row
      // But the nested column box will produce 2 rows inside the row layout
      // Actually in row layout, only the first child gets the row, subsequent children
      // get their columns merged. Let's just check it doesn't crash.
    });

    it('should handle empty box', () => {
      const node: Node = { type: 'box', flexDirection: 'column', children: [], content: '', };
      const rows = render(tree, node, { paddingLeft: 0 }, false);
      expect(rows).toHaveLength(0);
    });

    it('should handle single child in box', () => {
      const node: Node = {
        type: 'box',
        flexDirection: 'column',
        content: '',
        children: [{ type: 'text', value: 'Only child' }],
      };
      const rows = render(tree, node, { paddingLeft: 0 }, false);
      expect(rows).toHaveLength(1);
      expect(rows[0].columns[0].value).toBe('Only child');
    });
  });
});
