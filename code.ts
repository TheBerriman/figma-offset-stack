// code.ts
function isSceneNode(node: SceneNode): node is SceneNode & { x: number; y: number } {
  return 'x' in node && 'y' in node;
}

function getTopMostNode(nodes: readonly SceneNode[]): SceneNode {
  const canvasChildren = figma.currentPage.children;

  // Sort by visual topmost order in canvas
  return nodes
    .slice()
    .sort((a, b) => canvasChildren.indexOf(a) - canvasChildren.indexOf(b))[0];
}

function createOrGetFrame(referenceNode: SceneNode): FrameNode {
  const frame = figma.createFrame();
  frame.name = 'Stack Frame';
  frame.layoutMode = 'NONE';
  frame.clipsContent = false;
  frame.x = referenceNode.x;
  frame.y = referenceNode.y;
  figma.currentPage.appendChild(frame);
  return frame;
}

function moveNodesIntoFrame(nodes: SceneNode[], targetFrame: FrameNode) {
  for (const node of nodes) {
    if (node.parent !== targetFrame) {
      figma.currentPage.appendChild(node); // Detach from current parent
      targetFrame.appendChild(node);
    }
  }
}

function reorderNodesInFrame(
  nodes: SceneNode[],
  frame: FrameNode,
  firstOnTop: boolean
) {
  const ordered = [...nodes];
  if (firstOnTop) {
    ordered.reverse(); // Reverse so first item ends up on top
  }

  for (const node of ordered) {
    frame.appendChild(node);
  }
}

function staggerNodes(
  nodes: SceneNode[],
  offsetX: number,
  offsetY: number,
  firstOnTop: boolean
) {
  if (nodes.length < 2) {
    figma.notify('Select at least two layers');
    return;
  }

  const refNode = getTopMostNode(nodes);
  const baseX = refNode.x;
  const baseY = refNode.y;

  const frame = createOrGetFrame(refNode);
  moveNodesIntoFrame(nodes, frame);

  const ordered = [...nodes];
  if (!firstOnTop) ordered.reverse();

  ordered.forEach((node, index) => {
    if (isSceneNode(node)) {
      node.x = baseX + offsetX * index;
      node.y = baseY + offsetY * index;
    }
  });

  reorderNodesInFrame(ordered, frame, firstOnTop);
  figma.notify(`Stacked ${nodes.length} layers`);
}

figma.showUI(__html__);

figma.ui.onmessage = async (msg) => {
  if (msg.type !== 'stack-stagger') {
    figma.notify('Unknown message received.');
    return;
  }

  const xOffset = parseFloat(msg.x);
  const yOffset = parseFloat(msg.y);
  const firstOnTop = msg.firstOnTop === 'true';

  const selection = figma.currentPage.selection.slice();

  if (selection.length < 2) {
    figma.notify('Select at least two layers.');
    return;
  }

  const sorted = [...selection].sort((a, b) =>
    firstOnTop
      ? b.absoluteTransform[1][2] - a.absoluteTransform[1][2]
      : a.absoluteTransform[1][2] - b.absoluteTransform[1][2]
  );

  const baseNode = sorted[0];
  let baseX = baseNode.x;
  let baseY = baseNode.y;

  sorted.forEach((node, i) => {
    node.x = baseX + i * xOffset;
    node.y = baseY + i * yOffset;
    if (node.parent) node.parent.appendChild(node);
  });

  figma.notify('Layers staggered.');
  figma.closePlugin();
};

