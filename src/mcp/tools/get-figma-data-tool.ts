import { z } from "zod";
import type { GetFileResponse, GetFileNodesResponse } from "@figma/rest-api-spec";
import { FigmaService } from "~/services/figma.js";
import { simplifyRawFigmaObject, allExtractors } from "~/extractors/index.js";
import yaml from "js-yaml";
import { Logger, writeLogs } from "~/utils/logger.js";
import { FigmaContextError, ErrorType } from "~/utils/error-handling.js";

const parameters = {
  fileKey: z
    .string()
    .regex(/^[a-zA-Z0-9]+$/, "File key must be alphanumeric")
    .describe(
      "The key of the Figma file to fetch, often found in a provided URL like figma.com/(file|design)/<fileKey>/...",
    ),
  nodeId: z
    .string()
    .regex(/^\d+:\d+$/, "Node ID must be in the format of 'number:number'")
    .optional()
    .describe(
      "The ID of the node to fetch, often found as URL parameter node-id=<nodeId>, always use if provided",
    ),
  depth: z
    .number()
    .optional()
    .describe(
      "OPTIONAL. Do NOT use unless explicitly requested by the user. Controls how many levels deep to traverse the node tree.",
    ),
  includeFullInstanceData: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Whether to include full data for INSTANCE nodes. When false (default), only overridden properties and children are included for better performance and relevance.",
    ),
};

const parametersSchema = z.object(parameters);
export type GetFigmaDataParams = z.infer<typeof parametersSchema>;

// Simplified handler function
async function getFigmaData(
  params: GetFigmaDataParams,
  figmaService: FigmaService,
  outputFormat: "yaml" | "json",
) {
  try {
    const { fileKey, nodeId, depth, includeFullInstanceData } = params;

    Logger.log(
      `Fetching ${depth ? `${depth} layers deep` : "all layers"} of ${
        nodeId ? `node ${nodeId} from file` : `full file`
      } ${fileKey}${includeFullInstanceData ? " (including full instance data)" : ""}`,
    );

    // Get raw Figma API response
    let rawApiResponse: GetFileResponse | GetFileNodesResponse;
    if (nodeId) {
      rawApiResponse = await figmaService.getRawNode(fileKey, nodeId, depth);
    } else {
      rawApiResponse = await figmaService.getRawFile(fileKey, depth);
    }

    // Use unified design extraction (handles nodes + components consistently)
    let simplifiedDesign;
    try {
      simplifiedDesign = simplifyRawFigmaObject(rawApiResponse, allExtractors, {
        maxDepth: depth,
        includeFullInstanceData,
      });
    } catch (processingError) {
      // Attempt graceful degradation - try with basic extractors only
      Logger.log("Full extraction failed, attempting with reduced extractors for graceful degradation");
      
      try {
        const basicExtractors = allExtractors.slice(0, 2); // Use only basic extractors
        simplifiedDesign = simplifyRawFigmaObject(rawApiResponse, basicExtractors, {
          maxDepth: depth,
          includeFullInstanceData,
        });
        
        Logger.log("Partial extraction succeeded - some data may be missing");
        
        // Add warning to the result
        simplifiedDesign.warnings = [
          "Partial data extraction: Some advanced features may be missing due to processing errors."
        ];
      } catch (fallbackError) {
        throw new FigmaContextError({
          message: "Failed to extract design data even with basic extractors",
          type: ErrorType.PARSING_ERROR,
          context: { fileKey: params.fileKey, nodeId: params.nodeId, originalError: processingError, fallbackError },
          cause: fallbackError as Error
        });
      }
    }

    writeLogs("figma-simplified.json", simplifiedDesign);

    Logger.log(
      `Successfully extracted data: ${simplifiedDesign.nodes.length} nodes, ${Object.keys(simplifiedDesign.globalVars.styles).length} styles`,
    );

    const { nodes, globalVars, ...metadata } = simplifiedDesign;
    const result = {
      metadata,
      nodes,
      globalVars,
    };

    Logger.log(`Generating ${outputFormat.toUpperCase()} result from extracted data`);
    const formattedResult =
      outputFormat === "json" ? JSON.stringify(result, null, 2) : yaml.dump(result);

    Logger.log("Sending result to client");
    return {
      content: [{ type: "text" as const, text: formattedResult }],
    };
  } catch (error) {
    let figmaError: FigmaContextError;
    
    if (error instanceof FigmaContextError) {
      figmaError = error;
    } else {
      figmaError = new FigmaContextError({
        message: error instanceof Error ? error.message : String(error),
        type: ErrorType.UNKNOWN_ERROR,
        context: { fileKey: params.fileKey, nodeId: params.nodeId, depth: params.depth, includeFullInstanceData: params.includeFullInstanceData },
        cause: error instanceof Error ? error : undefined
      });
    }
    
    Logger.error(`Error fetching file ${params.fileKey}:`, figmaError.toDetailedString());
    
    // Provide detailed error information for LLM processing
    const errorResponse = [
      `# Figma API Error\n`,
      `**Error Type**: ${figmaError.type}\n`,
      `**User-Friendly Message**: ${figmaError.userFriendlyMessage}\n`,
      `**Suggested Action**: ${figmaError.suggestedAction}\n`,
      figmaError.technicalDetails ? `**Technical Details**: ${figmaError.technicalDetails}\n` : '',
      figmaError.retryable ? '**Note**: This error may be temporary and could succeed if retried.\n' : '',
      '\n**Context**:\n',
      `- File Key: ${params.fileKey}\n`,
      params.nodeId ? `- Node ID: ${params.nodeId}\n` : '',
      params.depth ? `- Depth: ${params.depth}\n` : '',
      `- Include Full Instance Data: ${params.includeFullInstanceData}\n`
    ].join('');
    
    return {
      isError: true,
      content: [{ type: "text" as const, text: errorResponse }],
    };
  }
}

// Export tool configuration
export const getFigmaDataTool = {
  name: "get_figma_data",
  description:
    "Get comprehensive Figma file data including layout, content, visuals, and component information",
  parameters,
  handler: getFigmaData,
} as const;
