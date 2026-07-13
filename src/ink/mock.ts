import { Node, RenderContentBox } from './ui-models.js';

export const tree: Node = {
  type: 'box',
  flexDirection: 'column',
  paddingLeft: 1,
  backgroundColor: '#111',
  content: '',
  children: [
    {
      type: 'box',
      flexDirection: 'column',
      content: '',
      children: [
        { type: 'text', value: '> ' },
      ],
    } as RenderContentBox,
    {
      type: 'box',
      flexDirection: 'column',
      content: '',
      children: [
        { type: 'text' },
        {
          type: 'box',
          flexDirection: 'row',
          content: '',
          children: [
            { type: 'text', value: '+', color: 'yellow' },
            { type: 'text', value: 'Thinking', color: 'yellow', paddingLeft: 1 },
            { type: 'text', value: '0.3s', color: 'yellow', paddingLeft: 2 },
          ],
        },
      ],
    } as RenderContentBox,
  ],
};
