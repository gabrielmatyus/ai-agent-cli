import { AssistantRolesEnum } from '../ink/models.js'
import { RenderContext, RenderColumn, TreeItem, TreeHolder } from '../ink/ui-models.js'

describe('ui-models types', () => {
  it('RenderContext should be an object', () => {
    const ctx: RenderContext = {}
    expect(ctx).toBeInstanceOf(Object)
  })
  it('RenderColumn should have type "text"', () => {
    const col: RenderColumn = { type: 'text' }
    expect(col.type).toBe('text')
  })
  it('TreeItem should have required fields', () => {
    const item: TreeItem = {
      role: AssistantRolesEnum.user,
      from: 0,
      rows: [],
      node: { type: 'box', children: [], content: '' },
      selected: false
    }
    expect(item.role).toBe(AssistantRolesEnum.user)
    expect(item.from).toBe(0)
  })
  it('should render null', () => {
    const col: RenderColumn = { type: 'text', value: 'Hello, World!' }
    expect(col.value).toBe('Hello, World!')

    const tree: TreeHolder = {
      node: { type: 'box', content: '', children: [] },
      uniqueId: 1,
      items: [],
      columns: 80,
      rows: [],
      reactNodes: [],
      visibleHeight: 0,
      rendererRowView: () => null
    }
    expect(tree.uniqueId).toBe(1)
    expect(tree.rendererRowView({ row: { key: 'test', columns: [] } })).toBeNull()
  })
})
