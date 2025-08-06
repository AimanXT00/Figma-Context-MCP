import { exec } from "child_process";
import { promisify } from "util";
import { Logger } from "./logger.js";
import { withRetry, categorizeError, FigmaContextError, ErrorType } from "./error-handling.js";

const execAsync = promisify(exec);

type RequestOptions = RequestInit & {
  /**
   * Force format of headers to be a record of strings, e.g. { "Authorization": "Bearer 123" }
   *
   * Avoids complexity of needing to deal with `instanceof Headers`, which is not supported in some environments.
   */
  headers?: Record<string, string>;
};

export async function fetchWithRetry<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const context = { url, hasHeaders: !!options.headers };
  
  return withRetry(async () => {
    try {
      const response = await fetch(url, options);
      
      if (!response.ok) {
        throw categorizeError(
          new Error(`HTTP ${response.status}: ${response.statusText}`),
          { ...context, statusCode: response.status, responseText: response.statusText }
        );
      }
      
      const data = await response.json();
      return data as T;
    } catch (fetchError: any) {
      // If it's already a FigmaContextError, re-throw it
      if (fetchError instanceof FigmaContextError) {
        throw fetchError;
      }
      
      Logger.log(
        `[fetchWithRetry] Fetch failed for ${url}: ${fetchError.message}. Attempting curl fallback.`,
      );
      
      // Try curl fallback for network issues (common in corporate environments)
      return await attemptCurlFallback(url, options, context, fetchError);
    }
  }, context);
}

/**
 * Attempts to use curl as a fallback when fetch fails
 */
async function attemptCurlFallback<T>(
  url: string, 
  options: RequestOptions, 
  context: Record<string, any>,
  originalError: Error
): Promise<T> {
  const curlHeaders = formatHeadersForCurl(options.headers);
  const curlCommand = `curl -s -S --fail-with-body -L ${curlHeaders.join(" ")} "${url}"`;
  
  try {
    Logger.log(`[fetchWithRetry] Executing curl fallback: ${curlCommand}`);
    const { stdout, stderr } = await execAsync(curlCommand);
    
    if (stderr) {
      if (
        !stdout ||
        stderr.toLowerCase().includes("error") ||
        stderr.toLowerCase().includes("fail") ||
        stderr.toLowerCase().includes("401") ||
        stderr.toLowerCase().includes("403") ||
        stderr.toLowerCase().includes("404")
      ) {
        // Extract status code from stderr if possible
        const statusMatch = stderr.match(/(\d{3})/);
        const statusCode = statusMatch ? parseInt(statusMatch[1]) : undefined;
        
        throw categorizeError(
          new Error(`Curl command failed: ${stderr}`),
          { ...context, statusCode, method: 'curl', stderr }
        );
      }
      Logger.log(
        `[fetchWithRetry] Curl produced informational stderr: ${stderr}`,
      );
    }
    
    if (!stdout) {
      throw new FigmaContextError({
        message: "Curl command returned empty response",
        type: ErrorType.NETWORK_ERROR,
        context: { ...context, method: 'curl' }
      });
    }
    
    try {
      return JSON.parse(stdout) as T;
    } catch (parseError) {
      throw new FigmaContextError({
        message: "Failed to parse JSON response from curl",
        type: ErrorType.PARSING_ERROR,
        context: { ...context, method: 'curl', responsePreview: stdout.substring(0, 200) },
        cause: parseError as Error
      });
    }
  } catch (curlError: any) {
    if (curlError instanceof FigmaContextError) {
      throw curlError;
    }
    
    Logger.error(`[fetchWithRetry] Curl fallback failed for ${url}: ${curlError.message}`);
    
    // Return the more informative error between fetch and curl
    throw categorizeError(originalError, { ...context, curlError: curlError.message });
  }
}

/**
 * Converts HeadersInit to an array of curl header arguments.
 * @param headers Headers to convert.
 * @returns Array of strings, each a curl -H argument.
 */
function formatHeadersForCurl(headers: Record<string, string> | undefined): string[] {
  if (!headers) {
    return [];
  }

  return Object.entries(headers).map(([key, value]) => `-H "${key}: ${value}"`);
}
