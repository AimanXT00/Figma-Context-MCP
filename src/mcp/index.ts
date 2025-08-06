import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { FigmaService, type FigmaAuthOptions } from "../services/figma.js";
import { Logger } from "../utils/logger.js";
import {
  downloadFigmaImagesTool,
  getFigmaDataTool,
  getFigmaComponentsTool,
  type DownloadImagesParams,
  type GetFigmaDataParams,
  type GetFigmaComponentsParams,
} from "./tools/index.js";

const serverInfo = {
  name: "Figma MCP Server",
  version: process.env.NPM_PACKAGE_VERSION ?? "unknown",
};

type CreateServerOptions = {
  isHTTP?: boolean;
  outputFormat?: "yaml" | "json";
  skipImageDownloads?: boolean;
};

function createServer(
  authOptions: FigmaAuthOptions,
  { isHTTP = false, outputFormat = "yaml", skipImageDownloads = false }: CreateServerOptions = {},
) {
  const server = new McpServer(serverInfo);
  const figmaService = new FigmaService(authOptions);
  registerTools(server, figmaService, { outputFormat, skipImageDownloads });

  Logger.isHTTP = isHTTP;

  return server;
}

function registerTools(
  server: McpServer,
  figmaService: FigmaService,
  options: {
    outputFormat: "yaml" | "json";
    skipImageDownloads: boolean;
  },
): void {
  // Register get_figma_data tool
  server.tool(
    getFigmaDataTool.name,
    getFigmaDataTool.description,
    getFigmaDataTool.parameters,
    (params: GetFigmaDataParams) =>
      getFigmaDataTool.handler(params, figmaService, options.outputFormat),
  );

  // Register get_figma_components tool
  server.tool(
    getFigmaComponentsTool.name,
    getFigmaComponentsTool.description,
    getFigmaComponentsTool.parameters,
    (params: GetFigmaComponentsParams) =>
      getFigmaComponentsTool.handler(params, figmaService, options.outputFormat),
  );

  // Register download_figma_images tool if CLI flag or env var is not set
  if (!options.skipImageDownloads) {
    server.tool(
      downloadFigmaImagesTool.name,
      downloadFigmaImagesTool.description,
      downloadFigmaImagesTool.parameters,
      (params: DownloadImagesParams) => downloadFigmaImagesTool.handler(params, figmaService),
    );
  }
}

export { createServer };
