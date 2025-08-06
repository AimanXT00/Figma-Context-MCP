import type { Node as FigmaDocumentNode } from "@figma/rest-api-spec";
import { isVisible } from "~/utils/common.js";
import { hasValue } from "~/utils/identity.js";
import type {
  ExtractorFn,
  TraversalContext,
  TraversalOptions,
  GlobalVars,
  SimplifiedNode,
} from "./types.js";

/**
 * Extract data from Figma nodes using a flexible, single-pass approach.
 *
 * @param nodes - The Figma nodes to process
 * @param extractors - Array of extractor functions to apply during traversal
 * @param options - Traversal options (filtering, depth limits, etc.)
 * @param globalVars - Global variables for style deduplication
 * @returns Object containing processed nodes and updated global variables
 */
export function extractFromDesign(
  nodes: FigmaDocumentNode[],
  extractors: ExtractorFn[],
  options: TraversalOptions = {},
  globalVars: GlobalVars = { styles: {} },
): { nodes: SimplifiedNode[]; globalVars: GlobalVars } {
  const context: TraversalContext = {
    globalVars,
    currentDepth: 0,
    options,
  };

  const processedNodes = nodes
    .filter((node) => shouldProcessNode(node, options))
    .map((node) => processNodeWithExtractors(node, extractors, context, options))
    .filter((node): node is SimplifiedNode => node !== null);

  return {
    nodes: processedNodes,
    globalVars: context.globalVars,
  };
}

/**
 * Process a single node with all provided extractors in one pass.
 */
function processNodeWithExtractors(
  node: FigmaDocumentNode,
  extractors: ExtractorFn[],
  context: TraversalContext,
  options: TraversalOptions,
): SimplifiedNode | null {
  if (!shouldProcessNode(node, options)) {
    return null;
  }

  // Always include base metadata
  const result: SimplifiedNode = {
    id: node.id,
    name: node.name,
    type: node.type === "VECTOR" ? "IMAGE-SVG" : node.type,
  };

  // Apply all extractors to this node in a single pass
  for (const extractor of extractors) {
    extractor(node, result, context);
  }

  // Handle children recursively
  if (shouldTraverseChildren(node, context, options)) {
    const childContext: TraversalContext = {
      ...context,
      currentDepth: context.currentDepth + 1,
      parent: node,
    };

    // Use the same pattern as the existing parseNode function
    if (hasValue("children", node) && node.children.length > 0) {
      let childrenToProcess = node.children;

      // For INSTANCE nodes without full data requested, only include children with overrides
      if (node.type === "INSTANCE" && !options.includeFullInstanceData && hasValue("overrides", node)) {
        const overrideNodeIds = new Set(
          (node.overrides as any[])?.map((override) => 
            // Extract the child node ID from override IDs like "I6317:6851;6465:24096"
            override.id.includes(';') ? override.id.split(';')[1] : override.id
          ) || []
        );
        
        childrenToProcess = node.children.filter((child) => 
          overrideNodeIds.has(child.id) || 
          // Also include children that might contain overridden nodes
          hasValue("children", child) && Array.isArray(child.children) && child.children.length > 0
        );
      }

      const children = childrenToProcess
        .filter((child) => shouldProcessNode(child, options))
        .map((child) => processNodeWithExtractors(child, extractors, childContext, options))
        .filter((child): child is SimplifiedNode => child !== null);

      if (children.length > 0) {
        result.children = children;
      }
    }
  }

  return result;
}

/**
 * Determine if a node should be processed based on filters.
 */
function shouldProcessNode(node: FigmaDocumentNode, options: TraversalOptions): boolean {
  // Skip invisible nodes
  if (!isVisible(node)) {
    return false;
  }

  // Apply custom node filter if provided
  if (options.nodeFilter && !options.nodeFilter(node)) {
    return false;
  }

  return true;
}

/**
 * Determine if we should traverse into a node's children.
 */
function shouldTraverseChildren(
  node: FigmaDocumentNode,
  context: TraversalContext,
  options: TraversalOptions,
): boolean {
  // Check depth limit
  if (options.maxDepth !== undefined && context.currentDepth >= options.maxDepth) {
    return false;
  }

  // For INSTANCE nodes, only traverse children if full instance data is requested
  // or if the children are slot-type children (have overrides)
  if (node.type === "INSTANCE" && !options.includeFullInstanceData) {
    // Check if this instance has children with overrides
    if (hasValue("overrides", node) && Array.isArray(node.overrides) && node.overrides.length > 0) {
      // Allow traversal of children that have overrides (they are slots or customized)
      return true;
    }
    // Skip children of instances without overrides - they are just template children
    return false;
  }

  return true;
}
