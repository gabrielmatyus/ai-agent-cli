import { describe, it, expect } from '@jest/globals';
import { tree } from '../ink/mock.js';
import { Node, RenderContentBox } from '../ink/ui-models.js';

describe('mock tree', () => {
  it('should be a box node', () => {
    expect(tree.type).toBe('box');
  });

  it('should have children', () => {
    const box = tree as RenderContentBox;
    expect(box.children).toBeDefined();
    expect(box.children.length).toBeGreaterThan(0);
  });

  it('should have a user input child', () => {
    const box = tree as RenderContentBox;
    const userBox = box.children[0] as RenderContentBox;
    expect(userBox.type).toBe('box');
    expect(userBox.children.length).toBeGreaterThan(0);
    // The first child of user box should be a text
    const firstChild: Node = userBox.children[0];
    expect(firstChild.type).toBe('text');
  });

  it('should have an assistant child', () => {
    const box = tree as RenderContentBox;
    const assistantBox = box.children[1] as RenderContentBox;
    expect(assistantBox.type).toBe('box');
    expect(assistantBox.children.length).toBeGreaterThan(0);
    // Should contain thinking header
    const thinkingRow = assistantBox.children[1] as RenderContentBox;
    expect(thinkingRow.type).toBe('box');
    expect(thinkingRow.flexDirection).toBe('row');
    const thinkingText: Node = thinkingRow.children[0];
    expect(thinkingText.type).toBe('text');
    if (thinkingText.type === 'text') {
      expect(thinkingText.value).toBe('+');
    }
  });

  it('should have paddingLeft set', () => {
    expect(tree.paddingLeft).toBe(1);
  });

  it('should have backgroundColor set', () => {
    expect(tree.backgroundColor).toBe('#111');
  });
});
