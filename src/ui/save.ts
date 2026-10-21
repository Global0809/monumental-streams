/**
 * One voice for saving. Every save anywhere sounds the same, flies the same gold orb into
 * My World (and, given the story's id, sends its seed flying into your core in the living
 * world) and says the same thing, so the viewer learns where saved things live.
 */
import type { ID } from '../../shared/types.ts';
import { stageCommands } from '../stage/store.ts';
import { flyToMyWorld } from '../systems/reactive.ts';
import { sound } from '../systems/sound/engine.ts';
import { toast } from './feedback.tsx';

export function saveMessage(saved: boolean, title: string, quoted = true): string {
  const name = quoted ? `“${title}”` : title;
  return saved ? `Saved ${name} to My World` : `Removed ${name} from saved`;
}

/**
 * Feedback after a save toggle has been applied: sound, the flight from `from` (only when
 * something was saved), and a toast with an optional Undo.
 */
export function announceSave({ saved, title, from, undo, quoted = true, message, id }: { saved: boolean; title: string; from?: Element | null; undo?: () => void; quoted?: boolean; message?: string; id?: ID }) {
  sound.play(saved ? 'save' : 'unsave');
  if (saved) {
    void flyToMyWorld(from ?? null);
    if (id) stageCommands.flyToCore(id, from?.getBoundingClientRect());
  }
  toast(message ?? saveMessage(saved, title, quoted), {
    tone: 'success',
    action: undo ? { label: 'Undo', run: undo } : undefined,
  });
}
