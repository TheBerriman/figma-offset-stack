// Layer Stacker Figma Plugin

// Default values
let STACK_MODE: 'primary-on-top' | 'primary-on-bottom' = 'primary-on-top';

// Z-order utilities - extracted for reusability and performance
namespace ZOrderUtils {
  interface AncestorPath {
    path: SceneNode[];
    depth: number;
  }

  // Cache ancestor paths to avoid recalculating for the same nodes
  const ancestorPathCache = new WeakMap<SceneNode, AncestorPath>();

  function getAncestorPath(node: SceneNode): AncestorPath {
    if (ancestorPathCache.has(node)) {
      return ancestorPathCache.get(node)!;
    }

    const path: SceneNode[] = [];
    let current: SceneNode = node;
    let depth = 0;
    
    while (current.parent) {
      path.unshift(current);
      depth++;
      const parent = current.parent;
      
      if (parent.type === 'PAGE') {
        break;
      }
      
      current = parent as SceneNode;
    }
    
    const result: AncestorPath = { path, depth };
    ancestorPathCache.set(node, result);
    return result;
  }

  export function compareZOrder(layer1: SceneNode, layer2: SceneNode): number {
    // Same parent - direct comparison
    if (layer1.parent && layer2.parent && layer1.parent === layer2.parent) {
      const index1 = layer1.parent.children.indexOf(layer1);
      const index2 = layer2.parent.children.indexOf(layer2);
      return index1 - index2; // Lower index = lower in stack
    }
    
    // Cross-parent comparison
    const ancestorPath1 = getAncestorPath(layer1);
    const ancestorPath2 = getAncestorPath(layer2);
    
    // Find common ancestor level
    let commonLevel = 0;
    const maxLevel = Math.min(ancestorPath1.path.length, ancestorPath2.path.length);
    
    while (commonLevel < maxLevel && 
           ancestorPath1.path[commonLevel].parent === ancestorPath2.path[commonLevel].parent) {
      commonLevel++;
    }
    
    if (commonLevel === 0) {
      return 0; // No common parent, maintain order
    }
    
    // Compare at the common ancestor level
    const ancestor1 = ancestorPath1.path[commonLevel - 1];
    const ancestor2 = ancestorPath2.path[commonLevel - 1];
    
    if (ancestor1.parent && ancestor2.parent && ancestor1.parent === ancestor2.parent) {
      const index1 = ancestor1.parent.children.indexOf(ancestor1);
      const index2 = ancestor2.parent.children.indexOf(ancestor2);
      return index1 - index2;
    }
    
    return 0;
  }

  export function getTopmostLayer(layers: readonly SceneNode[]): SceneNode {
    return layers.reduce((topmost, current) => {
      const comparison = compareZOrder(topmost, current);
      // If comparison < 0, current has higher index (more on top), so choose current
      // If comparison >= 0, topmost has higher or equal index, so keep topmost
      return comparison < 0 ? current : topmost;
    });
  }

  export function sortLayersByZOrder(layers: SceneNode[]): SceneNode[] {
    return [...layers].sort(compareZOrder);
  }

  // WeakMap automatically clears when nodes are garbage collected
  // No manual cleanup needed
}

// Layer positioning utilities
namespace PositionUtils {
  export function calculateOffsetPositions(
    layers: SceneNode[], 
    primaryX: number, 
    primaryY: number, 
    xOffset: number, 
    yOffset: number
  ): Array<{layer: SceneNode, x: number, y: number}> {
    return layers.map((layer, index) => {
      const offsetMultiplier = layers.length - index;
      const newX = primaryX + (xOffset * offsetMultiplier);
      const newY = primaryY + (yOffset * offsetMultiplier);
      return { layer, x: newX, y: newY };
    });
  }

  export function applyPositions(positions: Array<{layer: SceneNode, x: number, y: number}>): void {
    positions.forEach(({ layer, x, y }) => {
      layer.x = x;
      layer.y = y;
    });
  }
}

// Layer reordering utilities - optimized for performance
namespace ReorderUtils {
  export function reorderLayers(
    layersToStack: SceneNode[], 
    primaryLayer: SceneNode, 
    targetParent: SceneNode & ChildrenMixin,
    stackMode: 'primary-on-top' | 'primary-on-bottom'
  ): void {
    if (stackMode === 'primary-on-top') {
      reorderPrimaryOnTop(layersToStack, primaryLayer, targetParent);
    } else {
      reorderPrimaryOnBottom(layersToStack, primaryLayer, targetParent);
    }
  }

  function reorderPrimaryOnTop(
    layersToStack: SceneNode[], 
    primaryLayer: SceneNode, 
    targetParent: SceneNode & ChildrenMixin
  ): void {
    for (let i = 0; i < layersToStack.length; i++) {
      const layer = layersToStack[i];
      const primaryIndex = targetParent.children.indexOf(primaryLayer);
      targetParent.insertChild(primaryIndex, layer);
    }
  }

  function reorderPrimaryOnBottom(
    layersToStack: SceneNode[], 
    primaryLayer: SceneNode, 
    targetParent: SceneNode & ChildrenMixin
  ): void {
    for (let i = 0; i < layersToStack.length; i++) {
      const layer = layersToStack[i];
      const primaryIndex = targetParent.children.indexOf(primaryLayer);
      targetParent.insertChild(primaryIndex + 1, layer);
    }
  }
}

// Check that the input is a valid number (based on Figma's official plugin samples)
function setSuggestionsForNumberInput(query: string, result: any, completions?: string[]) {
  if (query === '') {
    result.setSuggestions(completions ?? [])
  } else if (!Number.isFinite(Number(query))) {
    result.setError("Please enter a numeric value")
  } else {
    const filteredCompletions = completions ? completions.filter(s => s.includes(query) && s !== query) : []
    result.setSuggestions([query, ...filteredCompletions])
  }
}

// Handle parameter suggestions (required for non-freeform parameters)
figma.parameters.on('input', ({ parameters, key, query, result }) => {
  switch (key) {
    case 'xOffset':
      const xOffsetOptions = ['-24', '-16', '-8', '0', '8', '16', '24'];
      setSuggestionsForNumberInput(query, result, xOffsetOptions);
      break;
      
    case 'yOffset':
      const yOffsetOptions = ['-24', '-16', '-8', '0', '8', '16', '24'];
      setSuggestionsForNumberInput(query, result, yOffsetOptions);
      break;
      
    case 'stackMode':
      const stackModeOptions = [
        { name: 'First on top', data: 'primary-on-top' },
        { name: 'Last on top', data: 'primary-on-bottom' }
      ];
      result.setSuggestions(
        stackModeOptions.filter(option => 
          option.name.toLowerCase().includes(query.toLowerCase())
        )
      );
      break;
      
    default:
      return;
  }
});

// Handle plugin execution via the 'run' event (works for both parameter and UI modes)
figma.on('run', ({ command, parameters }: RunEvent) => {
  if (parameters) {
    // Plugin was run with parameters from quick actions
    const xOffset = parseInt(parameters.xOffset) || 0;
    const yOffset = parseInt(parameters.yOffset) || 0;
    const stackMode = (parameters.stackMode as 'primary-on-top' | 'primary-on-bottom') || 'primary-on-top';
    
    STACK_MODE = stackMode;
    
    try {
      stackLayers(xOffset, yOffset);
    } catch (error) {
      figma.closePlugin(`❌ ${error instanceof Error ? error.message : 'An error occurred while stacking layers'}`);
    }
  } else {
    // No parameters - show UI for manual input
    figma.showUI(__html__, { 
      width: 240, 
      height: 168,
      themeColors: true // Enable automatic theme support
    });
  }
});

figma.ui.onmessage = msg => {
  if (msg.type === 'stack-layers') {
    const xOffset = typeof msg.xOffset === 'number' ? msg.xOffset : 0;
    const yOffset = typeof msg.yOffset === 'number' ? msg.yOffset : 0;
    STACK_MODE = msg.stackMode || 'primary-on-top';

    try {
      stackLayers(xOffset, yOffset);
    } catch (error) {
      // If there's an error, send it back to UI instead of closing
      figma.ui.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : 'An error occurred while stacking layers'
      });
    }
  } else if (msg.type === 'cancel') {
    figma.closePlugin();
  }
};

function validateSelection(selection: readonly SceneNode[]): void {
  if (selection.length < 2) {
    throw new Error("Please select at least 2 layers to stack");
  }
}

function validatePrimaryLayer(primaryLayer: SceneNode): SceneNode & ChildrenMixin {
  const targetParent = primaryLayer.parent;
  
  if (!targetParent) {
    throw new Error("Primary layer has no parent - cannot proceed");
  }
  
  // Type guard to ensure parent has children mixin
  if (!('children' in targetParent)) {
    throw new Error("Primary layer's parent cannot contain children - cannot proceed");
  }
  
  return targetParent as SceneNode & ChildrenMixin;
}

function stackLayers(xOffset: number, yOffset: number) {
  // Get current selection
  const selection = figma.currentPage.selection;
  
  // Validate selection
  validateSelection(selection);
  
  // Find the topmost layer to use as primary layer
  const primaryLayer = ZOrderUtils.getTopmostLayer(selection);
  const layersToStack = selection.filter(layer => layer !== primaryLayer);
  
  // Validate primary layer and get target parent
  const targetParent = validatePrimaryLayer(primaryLayer);
  
  // Get primary layer's position for offset calculations
  const primaryX = primaryLayer.x;
  const primaryY = primaryLayer.y;
  
  // Sort layers to stack by their global z-order
  const sortedLayersToStack = ZOrderUtils.sortLayersByZOrder(layersToStack);
  
  // Reorder layers in the hierarchy
  ReorderUtils.reorderLayers(sortedLayersToStack, primaryLayer, targetParent, STACK_MODE);
  
  // Calculate and apply new positions
  const newPositions = PositionUtils.calculateOffsetPositions(
    sortedLayersToStack, 
    primaryX, 
    primaryY, 
    xOffset, 
    yOffset
  );
  PositionUtils.applyPositions(newPositions);

  // Success message
  const totalStacked = selection.length;
  let topLayerName: string;
  
  if (STACK_MODE === 'primary-on-top') {
    // Primary layer is on top
    topLayerName = primaryLayer.name || "Unnamed Layer";
  } else {
    // First layer in the sorted array ends up on top due to insertion order
    const topLayer = sortedLayersToStack[0];
    topLayerName = topLayer.name || "Unnamed Layer";
  }
  
  figma.closePlugin(`Stacked ${totalStacked} layers with "${topLayerName}" on top`);
}