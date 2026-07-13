import {
  ChatMessage,
  Usage,
  AssistantRolesEnum,
  ClientEvent,
} from '../ink/models.js';

import {
  RenderRow,
  RenderColumn,
  Node,
  TreeHolder,
  TreeItem,
} from '../ink/ui-models.js';

describe('models', () => {
  describe('ChatMessage interface', () => {
    it('should allow a valid user message', () => {
      const msg: ChatMessage = { role: 'user', content: 'Hello' };
      expect(msg.role).toBe('user');
      expect(msg.content).toBe('Hello');
    });

    it('should allow a valid assistant message with tool_calls', () => {
      const msg: ChatMessage = {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'read_file', arguments: '{"filePath":"test.txt"}' },
          },
        ],
      };
      expect(msg.tool_calls).toHaveLength(1);
      expect(msg.tool_calls![0].function.name).toBe('read_file');
    });

    it('should allow a tool response message with tool_call_id', () => {
      const msg: ChatMessage = {
        role: 'tool',
        content: 'File contents',
        tool_call_id: 'call_1',
      };
      expect(msg.tool_call_id).toBe('call_1');
    });

    it('should allow reasoning content', () => {
      const msg: ChatMessage = {
        role: 'assistant',
        content: 'Final answer',
        reasoning: 'Step-by-step reasoning',
      };
      expect(msg.reasoning).toBe('Step-by-step reasoning');
    });
  });

  describe('Usage interface', () => {
    it('should create a valid usage object', () => {
      const usage: Usage = {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
        prompt_cache_hit_tokens: 20,
        prompt_cache_miss_tokens: 80,
        prompt_tokens_details: { cached_tokens: 20 },
        completion_tokens_details: { reasoning_tokens: 10 },
      };
      expect(usage.total_tokens).toBe(150);
      expect(usage.completion_tokens_details.reasoning_tokens).toBe(10);
    });
  });

  describe('RenderRow and RenderColumn', () => {
    it('should create a valid render row with columns', () => {
      const col: RenderColumn = {
        type: 'text',
        key: 'col-1',
        value: 'test value',
        highlight: 'typescript',
        color: 'green',
      };
      const row: RenderRow = {
        key: 'row-1',
        columns: [col],
        paddingLeft: 2,
        backgroundColor: '#111',
      };
      expect(row.columns).toHaveLength(1);
      expect(row.columns[0].highlight).toBe('typescript');
    });
  });

  describe('Node union type', () => {
    it('should create a text node', () => {
      const node: Node = {
        type: 'text',
        value: 'Hello',
        color: 'red',
        key: 'col-1',
        highlight: 'bash',
      };
      expect(node.type).toBe('text');
      if (node.type === 'text') {
        expect(node.value).toBe('Hello');
      }
    });

    it('should create a box node with children', () => {
      const node: Node = {
        type: 'box',
        flexDirection: 'column',
        children: [
          { type: 'text', value: 'Child 1' },
          { type: 'text', value: 'Child 2' },
        ],
      };
      expect(node.type).toBe('box');
      if (node.type === 'box') {
        expect(node.children).toHaveLength(2);
        expect(node.flexDirection).toBe('column');
      }
    });

    it('should create a box node with row flex direction', () => {
      const node: Node = {
        type: 'box',
        flexDirection: 'row',
        children: [
          { type: 'text', value: 'Left' },
          { type: 'text', value: 'Right' },
        ],
      };
      expect(node.type).toBe('box');
      if (node.type === 'box') {
        expect(node.flexDirection).toBe('row');
      }
    });
  });

  describe('TreeHolder and TreeItem', () => {
    it('should create a tree holder structure', () => {
      const treeItem: TreeItem = {
        baseRole: AssistantRolesEnum.user,
        role: AssistantRolesEnum.user,
        from: 0,
        node: {
          type: 'box',
          flexDirection: 'column',
          children: [{ type: 'text', value: 'Test' }],
        },
        rows: [],
        selected: false,
        rowsLength: 0,
      };

      const tree: TreeHolder = {
        node: { type: 'box', children: [] },
        uniqueId: 0,
        items: [treeItem],
        rowsLength: 0,
        columns: 80,
      };

      expect(tree.items).toHaveLength(1);
      expect(tree.items[0].baseRole).toBe(AssistantRolesEnum.user);
      expect(tree.items[0].role).toBe(AssistantRolesEnum.user);
    });

    it('should mark tree item as selected', () => {
      const treeItem: TreeItem = {
        baseRole: AssistantRolesEnum.assistant,
        role: AssistantRolesEnum.assistant,
        from: 0,
        node: { type: 'box', children: [] },
        rows: [],
        selected: true,
        rowsLength: 0,
      };
      expect(treeItem.selected).toBe(true);
    });
  });

  describe('AssistantRolesEnum', () => {
    it('should have expected string values', () => {
      expect(AssistantRolesEnum.user).toBe('user');
      expect(AssistantRolesEnum.assistant).toBe('assistant');
      expect(AssistantRolesEnum.tool).toBe('tool');
      expect(AssistantRolesEnum.assistantReasoningContent).toBe('assistantReasoningContent');
      expect(AssistantRolesEnum.assistantContent).toBe('assistantContent');
      expect(AssistantRolesEnum.assistantMessage).toBe('assistantMessage');
      expect(AssistantRolesEnum.toolCall).toBe('toolCall');
      expect(AssistantRolesEnum.toolCallResponse).toBe('toolCallResponse');
    });
  });

  describe('ClientEvent interface', () => {
    it('should create a valid client event', () => {
      const event: ClientEvent = {
        baseRole: AssistantRolesEnum.assistant,
        role: AssistantRolesEnum.assistantContent,
        value: 'Hello',
      };
      expect(event.baseRole).toBe(AssistantRolesEnum.assistant);
      expect(event.role).toBe(AssistantRolesEnum.assistantContent);
      expect(event.value).toBe('Hello');
    });
  });
});
