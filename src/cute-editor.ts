/**
 * A restrained input frame that preserves Pi's editor cursor, composition,
 * paste and working-status layout. Only the top border is styled.
 */
import { CustomEditor } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";

export class CuteEditor extends CustomEditor {
  protected override renderTopBorder(width: number, hiddenLineCount: number): string {
    // Avoid replacing Pi's in-border working status or scrolling indicators.
    if(width < 44 || hiddenLineCount > 0 || this.embedWorkingStatus)
      return super.renderTopBorder(width,hiddenLineCount);
    const label="── INPUT ";
    return this.borderColor(label + "─".repeat(Math.max(0,width-visibleWidth(label))));
  }
}
