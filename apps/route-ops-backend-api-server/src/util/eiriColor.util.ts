/**
 * Utility functions for eIRI (International Roughness Index) color mapping
 */

/**
 * Helper to interpolate between two hex colors
 * @param color1 - Starting hex color (e.g., "#006400")
 * @param color2 - Ending hex color (e.g., "#00FF00")
 * @param factor - Interpolation factor (0 = color1, 1 = color2)
 * @returns Interpolated hex color
 */
function interpolateColor(color1: string, color2: string, factor: number): string {
  const c1 = parseInt(color1.slice(1), 16);
  const c2 = parseInt(color2.slice(1), 16);

  const r1 = (c1 >> 16) & 0xff;
  const g1 = (c1 >> 8) & 0xff;
  const b1 = c1 & 0xff;

  const r2 = (c2 >> 16) & 0xff;
  const g2 = (c2 >> 8) & 0xff;
  const b2 = c2 & 0xff;

  const r = Math.round(r1 + (r2 - r1) * factor);
  const g = Math.round(g1 + (g2 - g1) * factor);
  const b = Math.round(b1 + (b2 - b1) * factor);

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/**
 * Convert eIRI value to hex color code with gradient interpolation
 * Matches client specification exactly
 * @param eiri - eIRI rating value (0 = no rating)
 * @returns Hex color code (e.g., "#00ff00")
 */
export function getEiriHexColor(eiri: number): string {
  if (typeof eiri !== "number" || Number.isNaN(eiri)) return "#9e9e9e"; // gray

  // 0-1.5: Green (Excellent)
  if (eiri < 1.5) {
    const factor = eiri / 1.5; // 0 → 0, 1.5 → 1
    return interpolateColor("#006400", "#00FF00", factor); // dark green → bright green
  }

  // 1.5-2.5: Light Green (Good)
  if (eiri < 2.5) {
    const factor = (eiri - 1.5) / (2.5 - 1.5); // 0 → 0, 2.5 → 1
    return interpolateColor("#90EE90", "#C0FFC0", factor); // light green → lighter green
  }

  // 2.5-3.5: Yellow (Fair)
  if (eiri < 3.5) {
    const factor = (eiri - 2.5) / (3.5 - 2.5);
    return interpolateColor("#FFFF00", "#FFFF99", factor); // yellow → light yellow
  }

  // 3.5-4.5: Orange (Poor)
  if (eiri < 4.5) {
    const factor = (eiri - 3.5) / (4.5 - 3.5);
    return interpolateColor("#FFA500", "#FFCC80", factor); // orange → lighter orange
  }

  // >= 4.5: Red (Very Poor)
  const factor = (eiri - 4.5) / (5 - 4.5);
  return interpolateColor("#FF0000", "#FF6666", factor); // red → lighter red
}

/**
 * Convert eIRI value to color name (for backward compatibility)
 * @param eiri - eIRI rating value (0 = no rating)
 * @returns Color name (e.g., "green", "light_green")
 */
export function getEiriColorName(eiri: number): string {
  if (eiri <= 0) return "gray";
  if (eiri < 1.5) return "green";
  if (eiri < 2.5) return "light_green";
  if (eiri < 3.5) return "light_orange";
  if (eiri < 4.5) return "orange";
  return "red";
}
