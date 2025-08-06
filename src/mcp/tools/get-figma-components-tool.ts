import { z } from "zod";
import { FigmaService } from "~/services/figma.js";
import { simplifyRawFigmaObject, allExtractors } from "~/extractors/index.js";
import yaml from "js-yaml";
import { Logger, writeLogs } from "~/utils/logger.js";

const parameters = {
  fileKey: z
    .string()
    .regex(/^[a-zA-Z0-9]+$/, "File key must be alphanumeric")
    .optional()
    .describe(
      "The key of the Figma file to fetch components from. If provided, fetches components from this specific file.",
    ),
  teamId: z
    .string()
    .optional()
    .describe(
      "The team ID to fetch components from. If provided, fetches all published components from the team.",
    ),
  includeComponentDetails: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Whether to fetch detailed component data including design information. If true, will fetch the full component node data.",
    ),
  componentKey: z
    .string()
    .optional()
    .describe(
      "Specific component key to fetch detailed information for. Requires includeComponentDetails to be true.",
    ),
};

const parametersSchema = z.object(parameters);
export type GetFigmaComponentsParams = {
  fileKey?: string;
  teamId?: string;
  includeComponentDetails?: boolean;
  componentKey?: string;
};

// Simplified handler function
async function getFigmaComponents(
  params: GetFigmaComponentsParams,
  figmaService: FigmaService,
  outputFormat: "yaml" | "json",
) {
  try {
    // Validate and parse parameters with defaults
    const parsedParams = parametersSchema.parse(params);
    const { fileKey, teamId, includeComponentDetails, componentKey } = parsedParams;

    // Validate parameters
    if (!fileKey && !teamId) {
      throw new Error("Either fileKey or teamId must be provided");
    }

    if (fileKey && teamId) {
      throw new Error("Only one of fileKey or teamId should be provided, not both");
    }

    if (componentKey && !includeComponentDetails) {
      throw new Error("componentKey requires includeComponentDetails to be true");
    }

    let components: any[] = [];
    let metadata: any = {};

    if (fileKey) {
      Logger.log(`Fetching components from file ${fileKey}`);
      const response = await figmaService.getFileComponents(fileKey);
      Logger.log(`API returned ${response.meta.components.length} components`);
      components = response.meta.components;
      metadata = {
        source: "file",
        fileKey,
        componentCount: components.length,
        note: components.length === 0 ? "No published components found. Only components published to a library are returned by this API. Use get_figma_data tool to see all components in the file structure." : undefined,
      };
    } else if (teamId) {
      Logger.log(`Fetching components from team ${teamId}`);
      const response = await figmaService.getTeamComponents(teamId);
      components = response.meta.components;
      metadata = {
        source: "team", 
        teamId,
        componentCount: components.length,
        cursor: response.meta.cursor,
      };
    }

    // If detailed component information is requested
    if (includeComponentDetails && components.length > 0) {
      Logger.log(`Fetching detailed component information for ${components.length} components`);
      
      const detailedComponents = [];
      
      // If specific component key is provided, only get that one
      const targetComponents = componentKey 
        ? components.filter(comp => comp.key === componentKey)
        : components;

      if (componentKey && targetComponents.length === 0) {
        throw new Error(`Component with key ${componentKey} not found`);
      }

      for (const component of targetComponents) {
        try {
          Logger.log(`Fetching detailed data for component ${component.key} (${component.node_id})`);
          
          // Get the raw component node data from the file
          const rawNodeResponse = await figmaService.getRawNode(
            component.file_key, 
            component.node_id
          );

          // Extract detailed component information using existing extractors
          const simplifiedComponent = simplifyRawFigmaObject(rawNodeResponse, allExtractors);

          detailedComponents.push({
            ...component,
            designData: simplifiedComponent.nodes[0], // The component node itself
            metadata: {
              fileKey: component.file_key,
              nodeId: component.node_id,
              extractedAt: new Date().toISOString(),
            }
          });
        } catch (error) {
          Logger.error(`Failed to fetch detailed data for component ${component.key}:`, error);
          // Include the component without detailed data but with error info
          detailedComponents.push({
            ...component,
            error: `Failed to fetch detailed data: ${error instanceof Error ? error.message : 'Unknown error'}`,
          });
        }
      }
      
      components = detailedComponents;
    }

    const result = {
      metadata,
      components,
    };

    writeLogs("figma-components.json", result);

    Logger.log(
      `Successfully extracted ${components.length} components from ${fileKey ? 'file' : 'team'}`
    );

    Logger.log(`Generating ${outputFormat.toUpperCase()} result from component data`);
    const formattedResult =
      outputFormat === "json" ? JSON.stringify(result, null, 2) : yaml.dump(result);

    Logger.log("Sending component result to client");
    return {
      content: [{ type: "text" as const, text: formattedResult }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    Logger.error(`Error fetching components:`, message);
    return {
      isError: true,
      content: [{ type: "text" as const, text: `Error fetching components: ${message}` }],
    };
  }
}

// Export tool configuration
export const getFigmaComponentsTool = {
  name: "get_figma_components",
  description:
    "Get comprehensive Figma component data including component definitions, variants, and optionally detailed design information",
  parameters,
  handler: getFigmaComponents,
} as const;