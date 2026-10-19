import { buildTree, CategoryNode, descendantIds, wouldCreateCycle } from './category-tree.js';

const node = (id: string, parentId: string | null = null): CategoryNode => ({
  id,
  name: id,
  slug: id,
  parentId,
});

const categories = [
  node('electronics'),
  node('phones', 'electronics'),
  node('android', 'phones'),
  node('laptops', 'electronics'),
  node('books'),
];

describe('category tree', () => {
  it('nests children under parents sorted by name', () => {
    const tree = buildTree(categories);

    expect(tree.map((n) => n.id)).toEqual(['books', 'electronics']);
    expect(tree[1].children.map((n) => n.id)).toEqual(['laptops', 'phones']);
    expect(tree[1].children[1].children.map((n) => n.id)).toEqual(['android']);
  });

  it('collects a category with all of its descendants', () => {
    expect(descendantIds(categories, 'electronics')).toEqual(
      new Set(['electronics', 'phones', 'android', 'laptops']),
    );
    expect(descendantIds(categories, 'books')).toEqual(new Set(['books']));
  });

  it.each([
    ['electronics', 'android', true],
    ['phones', 'phones', true],
    ['phones', 'laptops', false],
    ['android', null, false],
  ])('moving %s under %s creates a cycle: %s', (id, parentId, expected) => {
    expect(wouldCreateCycle(categories, id, parentId)).toBe(expected);
  });
});
