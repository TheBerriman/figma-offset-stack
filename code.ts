// === Config (temp until UI is added) ===
const settings = {
  xOffset: 10,
  yOffset: 10,
  firstOnTop: true,
};

function fail(message: string) {
  figma.notify(message);
  figma.closePlugin();
}

function isNodeWithXY(node: SceneNode): node is SceneNode & { x: number; y: number } {
  return (
    "x" in node &&
    "y" in node &&
    typeof node.x === "number" &&
    typeof node.y === "number"
  );
}

// === Step 1: Validate selection ===
const selection = figma.currentPage.selection;
if (selection.length < 2) {
  fail("Select two or more layers to stagger.");
}

const positionableNodes: (SceneNode & { x: number; y: number })[] = [];

for (const node of selection) {
  if (isNodeWithXY(node)) {
    positionableNodes.push(node);
  } else {
    const fallback = node as SceneNode;
    const name = "name" in fallback ? fallback.name : "Unnamed";
    const type = "type" in fallback ? fallback.type : "Unknown";
    console.warn(`Skipping ${name} (${type}) — not positionable`);
  }
}

if (positionableNodes.length < 2) {
  fail("No valid layers to stagger.");
}

// === Step 2: Sort by absolute layer panel order ===
function getGlobalStackIndex(node: SceneNode): number {
  const ancestry: number[] = [];
  let current: BaseNode | null = node;

  while (current && "parent" in current && current.parent) {
    const parent = current.parent as BaseNode & { children?: readonly SceneNode[] };
    if (parent.children) {
      const idx = parent.children.indexOf(current as SceneNode);
      ancestry.unshift(idx); // Higher-up parents have higher weight
    }
    current = parent;
  }

  return parseInt(ancestry.map(n => n.toString().padStart(4, "0")).join(""), 10);
}

const stackOrder = positionableNodes
  .map(node => ({
    node,
    index: getGlobalStackIndex(node)
  }))
  .sort((a, b) => a.index - b.index);

// Determine anchor layer based on stacking preference
const topLayer = settings.firstOnTop
  ? stackOrder[0].node
  : stackOrder[stackOrder.length - 1].node;

// Reverse if stacking order is last-on-top
if (!settings.firstOnTop) {
  stackOrder.reverse();
}

// === Step 3: Move all layers into same parent as topLayer
const targetParent = topLayer.parent ?? figma.currentPage;

for (const { node } of stackOrder) {
  if (node.parent !== targetParent) {
    targetParent.appendChild(node);
  }
}

// === Step 4: Apply x/y staggering + stacking order
const baseX = topLayer.x;
const baseY = topLayer.y;

stackOrder.forEach(({ node }, index) => {
  node.x = baseX + index * settings.xOffset;
  node.y = baseY + index * settings.yOffset;

  if (settings.firstOnTop) {
    targetParent.appendChild(node); // move to top
  } else {
    targetParent.insertChild(0, node); // move to bottom
  }
});

figma.notify(`Staggered ${stackOrder.length} layers`);
figma.closePlugin();
