// code.ts

// Ensure the plugin closes when the user cancels the plugin
figma.on('close', () => {
  figma.closePlugin();
});

// Define the offset values (you can modify these or retrieve them from the UI)
const offsetX = 8;
const offsetY = 8;

// Function to determine if a node is a SceneNode
function isSceneNode(node: BaseNode): node is SceneNode {
  return 'visible' in node;
}

// Function to get the absolute index of a node in the layer hierarchy
function getNodePath(node: SceneNode): number[] {
  const path: number[] = [];
  let current: BaseNode | null = node;

  while (current && current.parent) {
    const parent = current.parent as BaseNode & ChildrenMixin;
    if ("children" in parent) {
      const idx = (parent.children as readonly BaseNode[]).indexOf(current);
      path.unshift(idx);
    }
    current = parent;
  }
  return path;
}

// Function to compare two nodes based on their position in the layer hierarchy
function compareLayerOrder(a: SceneNode, b: SceneNode): number {
  const aIndex = getAbsoluteIndex(a);
  const bIndex = getAbsoluteIndex(b);

  for (let i = 0; i < Math.min(aIndex.length, bIndex.length); i++) {
    if (aIndex[i] !== bIndex[i]) {
      return aIndex[i] - bIndex[i];
    }
  }

  return aIndex.length - bIndex.length;
}

// Main plugin logic
function offsetStack() {
  const selection = figma.currentPage.selection.filter(isSceneNode);

  if (selection.length === 0) {
    figma.notify('Please select at least one layer.');
    return;
  }

  // Sort the selection based on their position in the layer hierarchy
  const sortedSelection = selection.slice().sort(compareLayerOrder);

  // Determine the topmost layer (the one closest to the top of the layers panel)
  const topLayer = sortedSelection[0];
  const baseX = topLayer.x;
  const baseY = topLayer.y;

  // Offset each layer based on its position in the sorted selection
  sortedSelection.forEach((node, index) => {
    node.x = baseX + offsetX * index;
    node.y = baseY + offsetY * index;
  });

  figma.notify('Layers have been offset and stacked.');
}

// Run the plugin
offsetStack();
