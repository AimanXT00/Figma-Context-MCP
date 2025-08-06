import { Logger } from "./logger.js";

/**
 * Enhanced error types for better categorization and handling
 */
export enum ErrorType {
  // Network-related errors (retryable)
  NETWORK_ERROR = "NETWORK_ERROR",
  TIMEOUT_ERROR = "TIMEOUT_ERROR",
  
  // API-related errors
  API_ERROR = "API_ERROR",
  RATE_LIMIT_ERROR = "RATE_LIMIT_ERROR",
  AUTHENTICATION_ERROR = "AUTHENTICATION_ERROR",
  
  // Resource-related errors
  NOT_FOUND_ERROR = "NOT_FOUND_ERROR",
  PERMISSION_ERROR = "PERMISSION_ERROR",
  
  // Data processing errors
  PARSING_ERROR = "PARSING_ERROR",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  
  // Unknown/generic errors
  UNKNOWN_ERROR = "UNKNOWN_ERROR"
}

/**
 * Enhanced error class with detailed context for LLMs
 */
export class FigmaContextError extends Error {
  public readonly type: ErrorType;
  public readonly statusCode?: number;
  public readonly retryable: boolean;
  public readonly context: Record<string, any>;
  public readonly userFriendlyMessage: string;
  public readonly technicalDetails: string;
  public readonly suggestedAction?: string;

  constructor(options: {
    message: string;
    type: ErrorType;
    statusCode?: number;
    retryable?: boolean;
    context?: Record<string, any>;
    userFriendlyMessage?: string;
    technicalDetails?: string;
    suggestedAction?: string;
    cause?: Error;
  }) {
    super(options.message);
    this.name = "FigmaContextError";
    this.type = options.type;
    this.statusCode = options.statusCode;
    this.retryable = options.retryable ?? this.isRetryableByDefault(options.type);
    this.context = options.context || {};
    this.userFriendlyMessage = options.userFriendlyMessage || this.generateUserFriendlyMessage();
    this.technicalDetails = options.technicalDetails || this.generateTechnicalDetails();
    this.suggestedAction = options.suggestedAction || this.generateSuggestedAction();
    
    if (options.cause) {
      this.cause = options.cause;
    }
  }

  private isRetryableByDefault(type: ErrorType): boolean {
    const retryableTypes = [
      ErrorType.NETWORK_ERROR,
      ErrorType.TIMEOUT_ERROR,
      ErrorType.RATE_LIMIT_ERROR,
      ErrorType.API_ERROR, // Some API errors might be temporary
    ];
    return retryableTypes.includes(type);
  }

  private generateUserFriendlyMessage(): string {
    switch (this.type) {
      case ErrorType.NETWORK_ERROR:
        return "Unable to connect to Figma. Please check your internet connection and try again.";
      case ErrorType.AUTHENTICATION_ERROR:
        return "Authentication failed. Please verify your Figma API key or OAuth token is correct and has not expired.";
      case ErrorType.NOT_FOUND_ERROR:
        return "The requested Figma file or component was not found. Please check the file key or node ID.";
      case ErrorType.PERMISSION_ERROR:
        return "Access denied. You don't have permission to access this Figma file or resource.";
      case ErrorType.RATE_LIMIT_ERROR:
        return "Too many requests to Figma API. Please wait a moment before trying again.";
      case ErrorType.PARSING_ERROR:
        return "Failed to process the data received from Figma. The file structure may be invalid or corrupted.";
      default:
        return "An unexpected error occurred while processing your Figma request.";
    }
  }

  private generateTechnicalDetails(): string {
    const details: string[] = [];
    
    if (this.statusCode) {
      details.push(`HTTP Status: ${this.statusCode}`);
    }
    
    if (Object.keys(this.context).length > 0) {
      details.push(`Context: ${JSON.stringify(this.context, null, 2)}`);
    }
    
    if (this.cause) {
      const causeMessage = this.cause instanceof Error ? this.cause.message : String(this.cause);
      details.push(`Underlying error: ${causeMessage}`);
    }
    
    return details.join(" | ");
  }

  private generateSuggestedAction(): string {
    switch (this.type) {
      case ErrorType.AUTHENTICATION_ERROR:
        return "Verify your Figma API credentials in your environment variables or configuration.";
      case ErrorType.NOT_FOUND_ERROR:
        return "Double-check the Figma file URL or node ID you provided.";
      case ErrorType.PERMISSION_ERROR:
        return "Ensure the file is shared with you or use a different API key with proper access.";
      case ErrorType.RATE_LIMIT_ERROR:
        return "Wait 60 seconds before retrying, or implement request throttling.";
      case ErrorType.NETWORK_ERROR:
        return "Check your internet connection and firewall settings. If using corporate network, verify proxy settings.";
      case ErrorType.PARSING_ERROR:
        return "Try fetching a simpler node or check if the Figma file has any corrupted elements.";
      default:
        return "Review the technical details above and try again. If the issue persists, report it as a bug.";
    }
  }

  /**
   * Returns a comprehensive error message suitable for LLM processing
   */
  toDetailedString(): string {
    return [
      `Error Type: ${this.type}`,
      `User Message: ${this.userFriendlyMessage}`,
      `Technical Details: ${this.technicalDetails}`,
      `Suggested Action: ${this.suggestedAction}`,
      `Retryable: ${this.retryable}`,
      this.context && Object.keys(this.context).length > 0 
        ? `Context: ${JSON.stringify(this.context, null, 2)}`
        : null
    ].filter(Boolean).join("\n");
  }
}

/**
 * Categorizes errors based on status codes and error messages
 */
export function categorizeError(error: any, context?: Record<string, any>): FigmaContextError {
  const statusCode = error.status || error.statusCode;
  const message = (error as Error).message || String(error);
  
  // Authentication errors
  if (statusCode === 401 || statusCode === 403) {
    return new FigmaContextError({
      message,
      type: statusCode === 401 ? ErrorType.AUTHENTICATION_ERROR : ErrorType.PERMISSION_ERROR,
      statusCode,
      context,
      cause: error
    });
  }
  
  // Not found errors
  if (statusCode === 404) {
    return new FigmaContextError({
      message,
      type: ErrorType.NOT_FOUND_ERROR,
      statusCode,
      context,
      cause: error
    });
  }
  
  // Rate limiting
  if (statusCode === 429) {
    return new FigmaContextError({
      message,
      type: ErrorType.RATE_LIMIT_ERROR,
      statusCode,
      retryable: true,
      context: { ...context, retryAfter: error.retryAfter || 60 },
      cause: error
    });
  }
  
  // Server errors (5xx) - generally retryable
  if (statusCode >= 500) {
    return new FigmaContextError({
      message,
      type: ErrorType.API_ERROR,
      statusCode,
      retryable: true,
      context,
      cause: error
    });
  }
  
  // Network-related errors (by message content)
  if (message.toLowerCase().includes('network') || 
      message.toLowerCase().includes('timeout') ||
      message.toLowerCase().includes('connection')) {
    return new FigmaContextError({
      message,
      type: message.toLowerCase().includes('timeout') ? ErrorType.TIMEOUT_ERROR : ErrorType.NETWORK_ERROR,
      context,
      cause: error
    });
  }
  
  // Parsing errors
  if (message.toLowerCase().includes('json') || 
      message.toLowerCase().includes('parse') ||
      message.toLowerCase().includes('syntax')) {
    return new FigmaContextError({
      message,
      type: ErrorType.PARSING_ERROR,
      retryable: false,
      context,
      cause: error
    });
  }
  
  // Default to unknown error
  return new FigmaContextError({
    message,
    type: ErrorType.UNKNOWN_ERROR,
    statusCode,
    context,
    cause: error
  });
}

/**
 * Retry configuration for different error types
 */
export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
  retryableErrors: ErrorType[];
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffFactor: 2,
  retryableErrors: [
    ErrorType.NETWORK_ERROR,
    ErrorType.TIMEOUT_ERROR,
    ErrorType.RATE_LIMIT_ERROR,
    ErrorType.API_ERROR
  ]
};

/**
 * Enhanced retry logic with exponential backoff
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  context: Record<string, any> = {},
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: FigmaContextError;
  
  for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
    try {
      Logger.log(`Attempt ${attempt}/${finalConfig.maxAttempts}`, context);
      const result = await operation();
      
      if (attempt > 1) {
        Logger.log(`Operation succeeded on attempt ${attempt}`, context);
      }
      
      return result;
    } catch (error) {
      lastError = error instanceof FigmaContextError 
        ? error 
        : categorizeError(error, { ...context, attempt });
      
      // Log the error with full context
      Logger.error(
        `Attempt ${attempt}/${finalConfig.maxAttempts} failed`,
        lastError.toDetailedString()
      );
      
      // Check if we should retry
      const shouldRetry = attempt < finalConfig.maxAttempts && 
                         lastError.retryable && 
                         finalConfig.retryableErrors.includes(lastError.type);
      
      if (!shouldRetry) {
        Logger.error(
          `Not retrying: ${!lastError.retryable ? 'non-retryable error' : 'max attempts reached'}`,
          { errorType: lastError.type, attempt }
        );
        throw lastError;
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        finalConfig.baseDelay * Math.pow(finalConfig.backoffFactor, attempt - 1),
        finalConfig.maxDelay
      );
      
      // Add jitter to avoid thundering herd
      const jitteredDelay = delay + Math.random() * 1000;
      
      Logger.log(
        `Retrying in ${Math.round(jitteredDelay)}ms`,
        { attempt, errorType: lastError.type }
      );
      
      await new Promise(resolve => setTimeout(resolve, jitteredDelay));
    }
  }
  
  throw lastError!;
}