import { z } from "zod";

// Import the parameter schemas from the tool
const parameters = {
  fileKey: z
    .string()
    .regex(/^[a-zA-Z0-9]+$/, "File key must be alphanumeric")
    .describe("The key of the Figma file to fetch"),
  nodeId: z
    .string()
    .regex(/^\d+:\d+$/, "Node ID must be in the format of 'number:number'")
    .optional()
    .describe("The ID of the node to fetch"),
};

const parametersSchema = z.object(parameters);

describe("Security Validation", () => {
  describe("fileKey validation", () => {
    test("should accept valid alphanumeric file keys", () => {
      const validKeys = ["abc123", "ABC123", "123abc", "aBc123XyZ"];
      
      validKeys.forEach(key => {
        expect(() => parameters.fileKey.parse(key)).not.toThrow();
      });
    });

    test("should reject invalid file keys", () => {
      const invalidKeys = [
        "abc-123",      // hyphen
        "abc_123",      // underscore
        "abc 123",      // space
        "abc.123",      // dot
        "abc/123",      // slash
        "abc\\123",     // backslash
        "abc@123",      // special character
        "abc<script>",  // potential XSS
        "../etc/passwd", // path traversal
        ""              // empty string
      ];
      
      invalidKeys.forEach(key => {
        expect(() => parameters.fileKey.parse(key)).toThrow();
      });
    });
  });

  describe("nodeId validation", () => {
    test("should accept valid node IDs", () => {
      const validNodeIds = ["123:456", "1:1", "999:888", "0:0"];
      
      validNodeIds.forEach(nodeId => {
        expect(() => parameters.nodeId.parse(nodeId)).not.toThrow();
      });
    });

    test("should reject invalid node IDs", () => {
      const invalidNodeIds = [
        "123",          // missing colon
        "123:",         // missing second number
        ":456",         // missing first number
        "123:456:789",  // too many parts
        "abc:def",      // non-numeric
        "123-456",      // wrong separator
        "123 456",      // space separator
        "123.456",      // dot separator
        "../123:456",   // path traversal attempt
        "123:456<script>", // potential XSS
        ""              // empty string
      ];
      
      invalidNodeIds.forEach(nodeId => {
        expect(() => parameters.nodeId.parse(nodeId)).toThrow();
      });
    });

    test("should accept undefined nodeId", () => {
      expect(() => parameters.nodeId.parse(undefined)).not.toThrow();
    });
  });

  describe("full parameter validation", () => {
    test("should validate complete valid parameters", () => {
      const validParams = {
        fileKey: "abc123",
        nodeId: "123:456",
        depth: 2
      };
      
      expect(() => parametersSchema.parse(validParams)).not.toThrow();
    });

    test("should reject parameters with invalid fileKey", () => {
      const invalidParams = {
        fileKey: "abc-123",
        nodeId: "123:456"
      };
      
      expect(() => parametersSchema.parse(invalidParams)).toThrow();
    });
  });
});