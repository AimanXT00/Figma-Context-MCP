import { parsePaint } from "../transformers/style.js";
import type { Paint } from "@figma/rest-api-spec";

describe("Gradient CSS Generation", () => {
  test("should convert linear gradient to CSS", () => {
    const mockLinearGradient: Paint = {
      type: "GRADIENT_LINEAR",
      blendMode: "NORMAL",
      gradientHandlePositions: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 }
      ],
      gradientStops: [
        { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
        { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } }
      ],
      visible: true
    };

    const result = parsePaint(mockLinearGradient, false);
    
    expect(result).toHaveProperty("type", "GRADIENT_LINEAR");
    expect(result).toHaveProperty("gradient");
    expect((result as any).gradient).toContain("linear-gradient");
    expect((result as any).gradient).toContain("rgba(255, 0, 0, 1)");
    expect((result as any).gradient).toContain("rgba(0, 0, 255, 1)");
  });

  test("should convert radial gradient to CSS", () => {
    const mockRadialGradient: Paint = {
      type: "GRADIENT_RADIAL",
      blendMode: "NORMAL",
      gradientHandlePositions: [
        { x: 0.5, y: 0.5 },
        { x: 1, y: 0.5 },
        { x: 0.5, y: 1 }
      ],
      gradientStops: [
        { position: 0, color: { r: 1, g: 1, b: 1, a: 1 } },
        { position: 1, color: { r: 0, g: 0, b: 0, a: 1 } }
      ],
      visible: true
    };

    const result = parsePaint(mockRadialGradient, false);
    
    expect(result).toHaveProperty("type", "GRADIENT_RADIAL");
    expect((result as any).gradient).toContain("radial-gradient");
    expect((result as any).gradient).toContain("circle at 50% 50%");
  });
});