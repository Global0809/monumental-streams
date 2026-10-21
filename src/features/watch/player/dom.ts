/** DOM classification for the player's page-wide keyboard shortcuts. */
import type { TargetKind } from './keys.ts';

const CONTROLS =
  'a[href], button, summary, [role="button"], [role="link"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="radio"], [role="tab"], [role="switch"], [role="checkbox"], [role="option"], [role="combobox"], [role="listbox"]';
const CONTROL_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file', 'image']);

export function classifyTarget(t: Element | null, video: HTMLVideoElement | null, native: boolean): TargetKind {
  if (!t) return 'neutral';
  if (t.closest('dialog')) return 'dialog';
  if (native && video && t === video) return 'native';
  if (t instanceof HTMLInputElement) {
    if (t.type === 'range') return 'slider';
    return CONTROL_INPUTS.has(t.type) ? 'control' : 'typing';
  }
  if (t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return 'typing';
  if (t instanceof HTMLElement && t.isContentEditable) return 'typing';
  if (t.closest('[role="slider"], [role="spinbutton"]')) return 'slider';
  if (t.closest(CONTROLS)) return 'control';
  return 'neutral';
}
