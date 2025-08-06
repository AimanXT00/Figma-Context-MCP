import { buildSimplifiedText } from "../transformers/textFormatter.js";

describe("Mixed Text Formatting", () => {
  test("should return plain text when no overrides", () => {
    const mockTextNode = {
      type: "TEXT",
      characters: "Hello World",
      characterStyleOverrides: [],
      styleOverrideTable: {},
      style: {}
    } as any;

    const result = buildSimplifiedText(mockTextNode);
    expect(result).toBe("Hello World");
  });

  test("should format text with mixed styles", () => {
    const mockTextNode = {
      type: "TEXT",
      characters: "Hello Bold World",
      characterStyleOverrides: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0],
      styleOverrideTable: {
        1: { fontWeight: 700 }
      },
      style: { fontWeight: 400 }
    } as any;

    const result = buildSimplifiedText(mockTextNode);
    expect(result).toContain('<span style="font-weight: 700">Bold</span>');
    expect(result).toContain("Hello");
    expect(result).toContain("World");
  });

  test("should handle italic text", () => {
    const mockTextNode = {
      type: "TEXT", 
      characters: "Italic text",
      characterStyleOverrides: [1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0],
      styleOverrideTable: {
        1: { fontStyle: "ITALIC" }
      },
      style: {}
    } as any;

    const result = buildSimplifiedText(mockTextNode);
    expect(result).toContain('<span style="font-style: italic">Italic</span>');
  });

  test("should handle underlined text", () => {
    const mockTextNode = {
      type: "TEXT",
      characters: "Underlined",
      characterStyleOverrides: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      styleOverrideTable: {
        1: { textDecoration: "UNDERLINE" }
      },
      style: {}
    } as any;

    const result = buildSimplifiedText(mockTextNode);
    expect(result).toContain('<span style="text-decoration: underline">Underlined</span>');
  });
});