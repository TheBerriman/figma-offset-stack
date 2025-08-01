// Layer Stacker Figma Plugin
// Stacks selected layers with incremental offsets
// Now supports both UI mode and parameter mode for quick actions

// Default values
let STACK_MODE: 'primary-on-top' | 'primary-on-bottom' = 'primary-on-top';

// Handle parameter suggestions (required for non-freeform parameters)
figma.parameters.on('input', ({ parameters, key, query, result }) => {
  switch (key) {
    case 'xOffset':
      const xOffsetOptions = ['0', '8', '16', '24', '32', '48'];
      result.setSuggestions(
        xOffsetOptions
          .filter(option => option.includes(query))
          .map(option => ({
            name: option,
            data: option
          }))
      );
      break;
      
    case 'yOffset':
      const yOffsetOptions = ['0', '8', '16', '24', '32', '48'];
      result.setSuggestions(
        yOffsetOptions
          .filter(option => option.includes(query))
          .map(option => ({
            name: option,
            data: option
          }))
      );
      break;
      
    case 'stackMode':
      const stackModeOptions = [
        { name: 'Primary on top', data: 'primary-on-top' },
        { name: 'Primary on bottom', data: 'primary-on-bottom' }
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
    // For stackMode, we use the data value from suggestions
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

function stackLayers(xOffset: number, yOffset: number) {
  // Get current selection
  const selection = figma.currentPage.selection;
  
  // Check if we have enough layers to stack
  if (selection.length < 2) {
    figma.closePlugin("❌ Please select at least 2 layers to stack");
    return;
  }
  
  // Find the topmost layer (highest z-index) to use as primary layer
  // This handles cross-parent comparisons by finding common ancestors
  function getTopmostLayer(layers: readonly SceneNode[]): SceneNode {
    function compareZOrder(layer1: SceneNode, layer2: SceneNode): SceneNode {
      // If same parent, compare directly
      if (layer1.parent && layer2.parent && layer1.parent === layer2.parent) {
        const index1 = layer1.parent.children.indexOf(layer1);
        const index2 = layer2.parent.children.indexOf(layer2);
        return index2 > index1 ? layer2 : layer1;
      }
      
      // Find common ancestor and compare the ancestor branches
      function findAncestorPath(node: SceneNode): SceneNode[] {
        const path: SceneNode[] = [];
        let current: SceneNode = node;
        
        while (current.parent) {
          path.unshift(current);
          const parent = current.parent;
          
          // Stop if we reach the page level (parent will be PageNode)
          if (parent.type === 'PAGE') {
            break;
          }
          
          // Continue up the tree - parent must be a SceneNode at this point
          current = parent as SceneNode;
        }
        
        return path;
      }
      
      const path1 = findAncestorPath(layer1);
      const path2 = findAncestorPath(layer2);
      
      // Find the common ancestor level
      let commonLevel = 0;
      while (commonLevel < path1.length && commonLevel < path2.length && 
             path1[commonLevel].parent === path2[commonLevel].parent) {
        commonLevel++;
      }
      
      if (commonLevel === 0) {
        return layer1; // No common parent, keep first
      }
      
      // Compare at the common ancestor level
      const ancestor1 = path1[commonLevel - 1];
      const ancestor2 = path2[commonLevel - 1];
      
      if (ancestor1.parent && ancestor2.parent && ancestor1.parent === ancestor2.parent) {
        const index1 = ancestor1.parent.children.indexOf(ancestor1);
        const index2 = ancestor2.parent.children.indexOf(ancestor2);
        const winner = index2 > index1 ? layer2 : layer1;
        return winner;
      }
      
      return layer1;
    }
    
    return layers.reduce((topmost, current) => {
      const result = compareZOrder(topmost, current);
      return result;
    });
  }
  
  const primaryLayer = getTopmostLayer(selection);
  const layersToStack = selection.filter(layer => layer !== primaryLayer);
  
  // Get primary layer's parent and position
  const targetParent = primaryLayer.parent;
  const primaryX = primaryLayer.x;
  const primaryY = primaryLayer.y;
  
  if (!targetParent) {
    figma.closePlugin("❌ Primary layer has no parent - cannot proceed");
    return;
  }
  
  // Sort ALL layers by their global z-order
  // For cross-parent comparisons, we use the same logic as getTopmostLayer
  function sortLayersByGlobalZOrder(layers: SceneNode[]): SceneNode[] {
    return [...layers].sort((a, b) => {
      // If same parent, compare directly
      if (a.parent && b.parent && a.parent === b.parent) {
        const indexA = a.parent.children.indexOf(a);
        const indexB = b.parent.children.indexOf(b);
        return indexA - indexB; // Lower index = lower in stack
      }
      
      // For cross-parent, we need to compare their global z-order
      // Using similar logic to getTopmostLayer's compareZOrder
      function findAncestorPath(node: SceneNode): SceneNode[] {
        const path: SceneNode[] = [];
        let current: SceneNode = node;
        
        while (current.parent) {
          path.unshift(current);
          const parent = current.parent;
          if (parent.type === 'PAGE') break;
          current = parent as SceneNode;
        }
        
        return path;
      }
      
      const pathA = findAncestorPath(a);
      const pathB = findAncestorPath(b);
      
      // Find common ancestor level
      let commonLevel = 0;
      while (commonLevel < pathA.length && commonLevel < pathB.length && 
             pathA[commonLevel].parent === pathB[commonLevel].parent) {
        commonLevel++;
      }
      
      if (commonLevel === 0) return 0; // No common parent, maintain order
      
      // Compare at the common ancestor level
      const ancestorA = pathA[commonLevel - 1];
      const ancestorB = pathB[commonLevel - 1];
      
      if (ancestorA.parent && ancestorB.parent && ancestorA.parent === ancestorB.parent) {
        const indexA = ancestorA.parent.children.indexOf(ancestorA);
        const indexB = ancestorB.parent.children.indexOf(ancestorB);
        return indexA - indexB;
      }
      
      return 0;
    });
  }
  
  // Sort all layers to stack by their global z-order
  const sortedLayersToStack = sortLayersByGlobalZOrder(layersToStack);

  // Get the primary layer's current index
  let primaryIndex = targetParent.children.indexOf(primaryLayer);
  
  if (STACK_MODE === 'primary-on-top') {
    // Original behavior: insert in forward order
    for (let i = 0; i < sortedLayersToStack.length; i++) {
      const layer = sortedLayersToStack[i];
      
      // Always get fresh index of primary since it might have moved
      primaryIndex = targetParent.children.indexOf(primaryLayer);
      
      // Insert just below the primary
      targetParent.insertChild(primaryIndex, layer);
    }
    
    // Apply offsets based on the final z-order
    sortedLayersToStack.forEach((layer, index) => {
      const offsetMultiplier = sortedLayersToStack.length - index;
      const newX = primaryX + (xOffset * offsetMultiplier);
      const newY = primaryY + (yOffset * offsetMultiplier);
      
      layer.x = newX;
      layer.y = newY;
    });
  } else {
    // Primary-on-bottom mode
    // First, move primary to the bottom
    targetParent.insertChild(0, primaryLayer);
    
    // Insert layers in forward order above the primary
    // This maintains their relative order, just flipped
    for (let i = 0; i < sortedLayersToStack.length; i++) {
      const layer = sortedLayersToStack[i];
      
      // Always insert at position 1 (just above primary which is at 0)
      targetParent.insertChild(1, layer);
    }
    
    // Apply offsets - now the first layer (bottom-most originally) gets largest offset
    sortedLayersToStack.forEach((layer, index) => {
      const offsetMultiplier = sortedLayersToStack.length - index;
      const newX = primaryX + (xOffset * offsetMultiplier);
      const newY = primaryY + (yOffset * offsetMultiplier);
      
      layer.x = newX;
      layer.y = newY;
    });
  }

  // Success message
//const totalStacked = layersToStack.length;
  const totalStacked = selection.length
  const primaryLayerName = primaryLayer.name || "Unnamed Layer";
  const modeText = STACK_MODE === 'primary-on-top' ? 'on top' : 'on bottom';
  
  figma.closePlugin(`Stacked ${totalStacked} layers with "${primaryLayerName}" ${modeText}`);
}