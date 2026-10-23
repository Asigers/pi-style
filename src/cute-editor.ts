/**
 * Decorative-only input editor. All input handling stays in Pi's CustomEditor:
 * no keyboard remapping, cursor interception, or IME changes.
 */
import { CustomEditor } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export class CuteEditor extends CustomEditor {
  render(width: number): string[] {
    const lines = super.render(width);
    if (width < 30 || lines.length === 0) return lines;
    const last = lines.length - 1;
    const label = width >= 55 ? " │ " : " │ ";
    const space = Math.max(0, width - visibleWidth(label));
    lines[last] = truncateToWidth(lines[last] ?? "", space, "") + label;
    return lines;
  }
}
