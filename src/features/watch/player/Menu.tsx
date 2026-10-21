/**
 * Player menus: a button that opens role="menu" with radio / checkbox / action items.
 * Arrow keys move, Home/End jump, Enter/Space choose, Escape closes and returns focus to
 * the button, Tab closes. Desktop: a popover above the control bar. Small screens: a
 * bottom sheet (still inside the player, so it works in full screen).
 * Opening and closing animate interruptibly (usePresence): a menu closed mid-rise sinks back
 * from where it is; the closing copy is inert and hidden from assistive tech.
 */
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { sound } from '../../../systems/sound/engine.ts';
import { Icon, type IconName } from '../../../ui/Icon.tsx';
import { usePresence } from '../../../ui/presence.ts';

export interface MenuItem {
  key: string;
  label: ReactNode;
  hint?: string;
  kind?: 'radio' | 'checkbox' | 'action';
  checked?: boolean;
  disabled?: boolean;
  /** Keep the menu open after choosing (checkbox toggles). */
  keepOpen?: boolean;
  onSelect: () => void;
}

export interface MenuGroup {
  label?: string;
  note?: string;
  items: MenuItem[];
}

export function MenuButton({
  id,
  label,
  icon,
  text,
  groups,
  open,
  onOpenChange,
  pressed,
  title,
}: {
  id: string;
  label: string;
  icon?: IconName;
  text?: string;
  groups: MenuGroup[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pressed?: boolean;
  title?: string;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const uid = useId();
  const menuId = `${id}-${uid.replace(/[^a-z0-9]/gi, '')}`;
  const presence = usePresence(open, 220);

  const items = () => Array.from(menu.current?.querySelectorAll<HTMLElement>('[data-menu-item]:not([aria-disabled="true"])') ?? []);

  useEffect(() => {
    if (!open) return;
    // Focus the chosen item (or the first) once the menu renders.
    const raf = requestAnimationFrame(() => {
      const list = items();
      (list.find((el) => el.getAttribute('aria-checked') === 'true') ?? list[0])?.focus({ preventScroll: true });
    });
    const onDown = (e: PointerEvent) => {
      if (anchor.current && !anchor.current.contains(e.target as Node)) onOpenChange(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('pointerdown', onDown, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = (refocus: boolean) => {
    onOpenChange(false);
    sound.play('close');
    if (refocus) requestAnimationFrame(() => btn.current?.focus({ preventScroll: true }));
  };

  const onMenuKey = (e: KeyboardEvent) => {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    let n = -1;
    if (e.key === 'ArrowDown') n = (i + 1) % list.length;
    else if (e.key === 'ArrowUp') n = (i - 1 + list.length) % list.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = list.length - 1;
    else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
      return;
    } else if (e.key === 'Tab') {
      onOpenChange(false);
      return;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault(); // keep the player from seeking while a menu is open
      return;
    } else return;
    e.preventDefault();
    list[n]?.focus({ preventScroll: true });
    sound.play('tick');
  };

  const choose = (item: MenuItem) => {
    if (item.disabled) return;
    sound.play('select');
    item.onSelect();
    if (!item.keepOpen) close(true);
  };

  return (
    <div className="pl-menu-anchor" ref={anchor}>
      <button
        ref={btn}
        type="button"
        className={`pl-btn ${text ? 'pl-btn-text' : ''}`}
        aria-label={label}
        title={title ?? label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-pressed={pressed}
        onClick={() => {
          sound.play(open ? 'close' : 'open');
          onOpenChange(!open);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            onOpenChange(true);
          }
        }}
      >
        {icon ? <Icon name={icon} size={20} /> : null}
        {text ? <span className="mono">{text}</span> : null}
      </button>
      {presence.mounted ? (
        <>
          <div className="pl-menu-backdrop" data-state={presence.state} aria-hidden="true" onClick={() => open && close(true)} />
          <div className="pl-menu" data-state={presence.state} inert={!open} aria-hidden={!open || undefined}>
            <div className="pl-menu-head">
              <span className="pl-menu-title" aria-hidden="true">
                {label}
              </span>
              <button type="button" className="pl-menu-close" aria-label={`Close ${label.toLowerCase()} menu`} tabIndex={-1} onClick={() => close(true)}>
                <Icon name="close" size={16} />
              </button>
            </div>
            <div ref={menu} id={menuId} className="pl-menu-list" role="menu" aria-label={label} onKeyDown={onMenuKey}>
            {groups.map((g, gi) => (
              <div key={gi} role="group" aria-label={g.label} className="pl-menu-group">
                {g.label ? (
                  <p className="pl-menu-label mono" aria-hidden="true">
                    {g.label}
                  </p>
                ) : null}
                {g.items.map((item) => {
                  const role = item.kind === 'checkbox' ? 'menuitemcheckbox' : item.kind === 'action' ? 'menuitem' : 'menuitemradio';
                  return (
                    <div
                      key={item.key}
                      role={role}
                      tabIndex={-1}
                      data-menu-item=""
                      className="pl-menu-item"
                      aria-checked={role === 'menuitem' ? undefined : !!item.checked}
                      aria-disabled={item.disabled || undefined}
                      onClick={() => choose(item)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          choose(item);
                        }
                      }}
                    >
                      <span className="pl-menu-mark" aria-hidden="true">
                        {item.kind === 'action' ? <Icon name="arrow" size={14} /> : item.checked ? <Icon name="check" size={16} strokeWidth={2.2} /> : null}
                      </span>
                      <span className="pl-menu-text">{item.label}</span>
                      {item.hint ? <span className="pl-menu-hint mono">{item.hint}</span> : null}
                    </div>
                  );
                })}
                {g.note ? (
                  <p className="pl-menu-note" role="none">
                    {g.note}
                  </p>
                ) : null}
              </div>
            ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
