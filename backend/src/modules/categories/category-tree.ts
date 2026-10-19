export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
}

export interface CategoryTreeNode extends CategoryNode {
  children: CategoryTreeNode[];
}

export function buildTree(categories: CategoryNode[]): CategoryTreeNode[] {
  const nodes = new Map<string, CategoryTreeNode>(
    categories.map((category) => [category.id, { ...category, children: [] }]),
  );
  const roots: CategoryTreeNode[] = [];

  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    (parent ? parent.children : roots).push(node);
  }

  const sortByName = (list: CategoryTreeNode[]) => {
    list.sort((a, b) => a.name.localeCompare(b.name));
    list.forEach((node) => sortByName(node.children));
  };
  sortByName(roots);
  return roots;
}

export function descendantIds(categories: CategoryNode[], rootId: string): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const category of categories) {
    if (category.parentId) {
      childrenOf.set(category.parentId, [
        ...(childrenOf.get(category.parentId) ?? []),
        category.id,
      ]);
    }
  }

  const result = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length) {
    for (const childId of childrenOf.get(queue.shift()!) ?? []) {
      if (!result.has(childId)) {
        result.add(childId);
        queue.push(childId);
      }
    }
  }
  return result;
}

export function wouldCreateCycle(
  categories: CategoryNode[],
  categoryId: string,
  newParentId: string | null,
): boolean {
  return newParentId !== null && descendantIds(categories, categoryId).has(newParentId);
}
