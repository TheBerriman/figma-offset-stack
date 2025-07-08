// Stack layers with offset and correct order handling

const X_OFFSET = 100;
const Y_OFFSET = 100;
const FIRST_ON_TOP = true; // Set to false to reverse stacking order

function isSceneNode(node: SceneNode): boolean {
  return typeof node.x === 'number' && typeof node.y === 'number';
}

function getLayerIndex(layer: SceneNode): number {
  let depth = 0;
  let current: BaseNode | null = layer;
  while (current.parent && current.parent.type !== 'PAGE') {
    current = current.parent;
    depth++;
  }
  return depth;
}

function getTopLayerByHierarchy(layers: readonly SceneNode[]): SceneNode {
  // Find the layer that appears highest in the layers panel
  let topLayer = layers[0];
  
  for (const layer of layers) {
    if (isLayerHigherInPanel(layer, topLayer)) {
      topLayer = layer;
    }
  }
  
  return topLayer;
}

function isLayerHigherInPanel(layerA: SceneNode, layerB: SceneNode): boolean {
  // If they have the same parent, compare their indices directly
  if (layerA.parent === layerB.parent && layerA.parent && 'children' in layerA.parent) {
    const parent = layerA.parent;
    const aIndex = parent.children.indexOf(layerA);
    const bIndex = parent.children.indexOf(layerB);
    return aIndex < bIndex; // Lower index = higher in panel
  }
  
  // For different parents, we need to find their common ancestor
  // and compare from there. For now, let's use a simple heuristic:
  // prefer layers that are less deeply nested (closer to page level)
  function getDepth(node: SceneNode): number {
    let depth = 0;
    let current: BaseNode | null = node;
    while (current.parent && current.parent.type !== 'PAGE') {
      current = current.parent;
      depth++;
    }
    return depth;
  }
  
  const depthA = getDepth(layerA);
  const depthB = getDepth(layerB);
  
  if (depthA !== depthB) {
    return depthA < depthB; // Less nested = higher in panel
  }
  
  // If same depth, compare their root parents' positions
  function getRootParent(node: SceneNode): BaseNode {
    let current: BaseNode = node;
    while (current.parent && current.parent.type !== 'PAGE') {
      current = current.parent;
    }
    return current;
  }
  
  const rootA = getRootParent(layerA);
  const rootB = getRootParent(layerB);
  
  if (rootA.parent && rootB.parent && 'children' in rootA.parent && 'children' in rootB.parent) {
    const rootAIndex = rootA.parent.children.indexOf(rootA);
    const rootBIndex = rootB.parent.children.indexOf(rootB);
    return rootAIndex < rootBIndex;
  }
  
  return false;
}

function moveLayersToCommonFrame(layers: readonly SceneNode[], targetFrame: FrameNode | PageNode) {
  for (const node of layers) {
    try {
      if (node.parent && node.parent !== targetFrame && 'appendChild' in targetFrame) {
        targetFrame.appendChild(node);
      }
    } catch (e) {
      console.error(`Failed to move ${'name' in node ? node.name : 'unknown'}:`, e);
    }
  }
}

function stackLayers(
  layers: SceneNode[],
  xOffset: number,
  yOffset: number,
  firstOnTop: boolean
) {
  if (layers.length < 2) {
    figma.notify("Select at least 2 layers to apply stagger.");
    return;
  }

  // Detect autolayout conflicts
  const hasAutoLayout = layers.some(
    (node) =>
      node.parent &&
      node.parent.type === "FRAME" &&
      node.parent.layoutMode !== "NONE"
  );

  if (hasAutoLayout) {
    figma.notify("Warning: Some layers are inside Auto Layout frames and may behave unexpectedly.");
  }

  // Get the base position from the topmost layer in hierarchy
  const hierarchyBase = getTopLayerByHierarchy(layers);
  console.log("Using base layer:", hierarchyBase.name);
  const baseX = hierarchyBase.x;
  const baseY = hierarchyBase.y;

  // Move all layers into shared parent first
  const parent = hierarchyBase.parent;
  if (parent && (parent.type === "FRAME" || parent.type === "PAGE")) {
    moveLayersToCommonFrame(layers, parent);
  }

  // Sort all layers by their hierarchy position for consistent ordering
  const layersSortedByHierarchy = [...layers].sort((a, b) => {
    return isLayerHigherInPanel(a, b) ? -1 : 1;
  });

  console.log("Layers sorted by hierarchy:", layersSortedByHierarchy.map(l => l.name));

  // Determine the visual stacking order
  // layersSortedByHierarchy[0] should be the visual top card
  const ordered = firstOnTop ? layersSortedByHierarchy : [...layersSortedByHierarchy].reverse();

  console.log("Final ordered array:", ordered.map(l => l.name));
  console.log("Visual top card should be:", ordered[0].name);

  // Position layers in stack formation - visual top card at base position
  ordered.forEach((node, index) => {
    if (isSceneNode(node)) {
      node.x = baseX + xOffset * index;
      node.y = baseY + yOffset * index;
    }
  });

  // Reorder layers so the visual top card is actually on top in the layers panel
  if (parent && 'insertChild' in parent) {
    ordered.forEach((node, i) => {
      // Visual top card (index 0) should be at the top of the layers panel
      parent.insertChild(i, node);
    });
  }
}

// ---- Plugin Entry ----

const selection = figma.currentPage.selection.slice();
stackLayers(selection, X_OFFSET, Y_OFFSET, FIRST_ON_TOP);
figma.closePlugin();