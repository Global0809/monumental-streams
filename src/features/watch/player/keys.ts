/**
 * Player keyboard map + the rules for when a key belongs to the player. Pure.
 *
 * Letters and digits work anywhere on the watch page unless you are typing. Keys that
 * also scroll or operate other controls (Space, ↑ ↓, Home, End, Page keys) only reach
 * the player when focus is inside it — or, for Space, when nothing in particular is
 * focused and the player is on screen — so keyboard page scrolling keeps working.
 */
import { JUMP_STEP, SEEK_STEP, VOLUME_STEP } from './time.ts';

export type ShortcutAction =
  | { type: 'toggle' }
  | { type: 'seek'; by: number }
  | { type: 'volume'; by: number }
  | { type: 'mute' }
  | { type: 'fullscreen' }
  | { type: 'captions' }
  | { type: 'pip' }
  | { type: 'rate'; dir: 1 | -1 }
  | { type: 'jump'; fraction: number }
  | { type: 'start' }
  | { type: 'end' }
  | { type: 'chapter'; dir: 1 | -1 }
  | { type: 'save' }
  | { type: 'next' }
  | { type: 'help' };

export interface KeyInput {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

export function shortcutFor(e: KeyInput): ShortcutAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null; // browser / OS shortcuts stay theirs
  const k = e.key;
  if (k.length === 1 && k >= '0' && k <= '9') return { type: 'jump', fraction: Number(k) / 10 };
  switch (k) {
    case ' ':
    case 'k':
    case 'K':
      return { type: 'toggle' };
    case 'j':
    case 'J':
      return { type: 'seek', by: -JUMP_STEP };
    case 'l':
    case 'L':
      return { type: 'seek', by: JUMP_STEP };
    case 'ArrowLeft':
      return { type: 'seek', by: -SEEK_STEP };
    case 'ArrowRight':
      return { type: 'seek', by: SEEK_STEP };
    case 'ArrowUp':
      return { type: 'volume', by: VOLUME_STEP };
    case 'ArrowDown':
      return { type: 'volume', by: -VOLUME_STEP };
    case 'm':
    case 'M':
      return { type: 'mute' };
    case 'f':
    case 'F':
      return { type: 'fullscreen' };
    case 'c':
    case 'C':
      return { type: 'captions' };
    case 'i':
    case 'I':
      return { type: 'pip' };
    case '<':
      return { type: 'rate', dir: -1 };
    case '>':
      return { type: 'rate', dir: 1 };
    case 'Home':
      return { type: 'start' };
    case 'End':
      return { type: 'end' };
    case '[':
      return { type: 'chapter', dir: -1 };
    case ']':
      return { type: 'chapter', dir: 1 };
    case 's':
    case 'S':
      return { type: 'save' };
    case 'N':
      return { type: 'next' };
    case '?':
      return { type: 'help' };
    default:
      return null;
  }
}

/** What kind of element the key event came from. */
export type TargetKind = 'typing' | 'dialog' | 'slider' | 'native' | 'control' | 'neutral';

const NAV_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

export function shouldHandle(key: string, kind: TargetKind, inPlayer: boolean, playerVisible: boolean): boolean {
  if (kind === 'typing' || kind === 'dialog') return false;
  const nav = NAV_KEYS.has(key);
  const activation = key === ' ' || key === 'Enter';
  // Sliders and the native video own their arrows / Space.
  if (kind === 'slider' || kind === 'native') return !nav && !activation;
  // Buttons and links: Space/Enter activate them; arrows only steer the player from inside it.
  if (kind === 'control') return !activation && (!nav || inPlayer);
  if (key === ' ') return inPlayer || playerVisible;
  if (SCROLL_KEYS.has(key)) return inPlayer;
  return true;
}

/** For the "?" dialog. */
export const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['Space', 'K'], label: 'Play or pause' },
  { keys: ['J', 'L'], label: 'Back or forward 10 seconds' },
  { keys: ['←', '→'], label: 'Back or forward 5 seconds' },
  { keys: ['↑', '↓'], label: 'Volume up or down (player focused)' },
  { keys: ['M'], label: 'Mute or unmute' },
  { keys: ['C'], label: 'Captions on or off' },
  { keys: ['F'], label: 'Full screen' },
  { keys: ['I'], label: 'Picture-in-picture' },
  { keys: ['<', '>'], label: 'Slower or faster' },
  { keys: ['0', '…', '9'], label: 'Jump to 0%–90%' },
  { keys: ['Home', 'End'], label: 'Start or end (player focused)' },
  { keys: ['[', ']'], label: 'Previous or next chapter' },
  { keys: ['S'], label: 'Save to My World, or remove it' },
  { keys: ['Shift', 'N'], label: 'Next video' },
  { keys: ['?'], label: 'Show these shortcuts' },
];
