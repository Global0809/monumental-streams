/**
 * Controls — buttons, chips, switches, sliders, segmented controls and tabs.
 * Press physics (squeeze + spring) and ripples come from the reactive layer for every one of
 * them, pointer or keyboard. Segmented controls and tabs carry a sliding indicator: a gold
 * thumb / underline that travels to the new choice (interruptibly — a CSS transition on
 * measured positions), so the selection visibly moves rather than blinking.
 */
import { forwardRef, useEffect, useId, useLayoutEffect, useRef, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { Link, type LinkProps } from 'react-router';
import { sound } from '../systems/sound/engine.ts';
import { Icon, type IconName } from './Icon.tsx';

/**
 * Measures the selected child (`selector`) inside `ref` and publishes its box as
 * --ind-x / --ind-y / --ind-w / --ind-h on the container, with data-indicator="ready" once
 * measured (CSS falls back to a static selected style until then). Follows resizes.
 */
function useIndicator(ref: RefObject<HTMLElement | null>, selector: string, key: unknown) {
  const measure = () => {
    const el = ref.current;
    const sel = el?.querySelector<HTMLElement>(selector);
    if (!el || !sel || !sel.offsetWidth) {
      el?.removeAttribute('data-indicator');
      return;
    }
    el.style.setProperty('--ind-x', `${sel.offsetLeft}px`);
    el.style.setProperty('--ind-y', `${sel.offsetTop}px`);
    el.style.setProperty('--ind-w', `${sel.offsetWidth}px`);
    el.style.setProperty('--ind-h', `${sel.offsetHeight}px`);
    if (!el.hasAttribute('data-indicator')) {
      // first placement: no slide in from the corner
      el.setAttribute('data-indicator', 'placing');
      requestAnimationFrame(() => ref.current?.setAttribute('data-indicator', 'ready'));
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(measure, [key]);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    for (const c of Array.from(el.children)) ro.observe(c);
    // web fonts change widths after first paint
    void document.fonts?.ready.then(() => measure());
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

type Variant = 'primary' | 'ghost' | 'chrome' | 'quiet' | 'danger' | 'aurum';
type Size = 'sm' | 'md' | 'lg';

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  iconAfter?: IconName;
  busy?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { variant = 'ghost', size = 'md', icon, iconAfter, busy, children, className = '', onClick, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={`btn btn-${variant} btn-${size} ${className}`}
      aria-busy={busy || undefined}
      onClick={(e) => {
        sound.play('select');
        onClick?.(e);
      }}
      {...rest}
    >
      {icon ? <Icon name={icon} size={size === 'lg' ? 22 : 18} /> : null}
      {children ? <span>{children}</span> : null}
      {iconAfter ? <Icon name={iconAfter} size={size === 'lg' ? 22 : 18} /> : null}
      {busy ? <span className="btn-busy" aria-hidden="true" /> : null}
    </button>
  );
});

export function ButtonLink({ variant = 'ghost', size = 'md', icon, iconAfter, children, className = '', ...rest }: LinkProps & { variant?: Variant; size?: Size; icon?: IconName; iconAfter?: IconName }) {
  return (
    <Link className={`btn btn-${variant} btn-${size} ${className}`} onClick={() => sound.play('select')} {...rest}>
      {icon ? <Icon name={icon} size={size === 'lg' ? 22 : 18} /> : null}
      {children ? <span>{children}</span> : null}
      {iconAfter ? <Icon name={iconAfter} size={size === 'lg' ? 22 : 18} /> : null}
    </Link>
  );
}

export const IconButton = forwardRef<HTMLButtonElement, Omit<BtnProps, 'children'> & { label: string; pressed?: boolean }>(function IconButton(
  { label, icon, pressed, variant = 'quiet', size = 'md', className = '', onClick, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={`icon-btn btn-${variant} icon-btn-${size} ${className}`}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={(e) => {
        sound.play('select');
        onClick?.(e);
      }}
      {...rest}
    >
      {icon ? <Icon name={icon} size={size === 'sm' ? 16 : size === 'lg' ? 24 : 20} /> : null}
    </button>
  );
});

/** Toggle chip (aria-pressed). Used for interests, filters, moods. */
export function Chip({ selected, onToggle, children, count, tone = 'ichor', disabled, removable, className = '' }: { selected?: boolean; onToggle?: () => void; children: ReactNode; count?: number; tone?: 'ichor' | 'plasma' | 'aurum' | 'ember'; disabled?: boolean; removable?: boolean; className?: string }) {
  return (
    <button
      type="button"
      className={`chip chip-${tone} ${className}`}
      aria-pressed={selected ?? false}
      disabled={disabled}
      onClick={() => {
        sound.play(selected ? 'unsave' : 'select');
        onToggle?.();
      }}
    >
      <span className="chip-node" aria-hidden="true" />
      <span>{children}</span>
      {count !== undefined ? <span className="chip-count mono">{count}</span> : null}
      {removable ? <Icon name="close" size={14} /> : null}
    </button>
  );
}

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="switch-row">
      <div>
        <label htmlFor={id} className="switch-label">
          {label}
        </label>
        {description ? (
          <p className="switch-desc" id={`${id}-d`}>
            {description}
          </p>
        ) : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-d` : undefined}
        disabled={disabled}
        className="switch"
        onClick={() => {
          sound.play(checked ? 'close' : 'open');
          onChange(!checked);
        }}
      >
        <span className="switch-knob" aria-hidden="true" />
      </button>
    </div>
  );
}

export function Slider({ label, value, onChange, min = 0, max = 1, step = 0.01, format, disabled }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; format?: (v: number) => string; disabled?: boolean }) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="slider-row">
      <label htmlFor={id} className="slider-label">
        <span>{label}</span>
        <span className="mono muted">{format ? format(value) : `${Math.round(pct)}%`}</span>
      </label>
      <input
        id={id}
        className="slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={{ ['--pct' as string]: `${pct}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={() => sound.play('tick')}
      />
    </div>
  );
}

/** Single-choice segmented control implemented as a radio group (arrow-key navigable). */
export function Segmented<T extends string>({ label, value, options, onChange, hideLabel }: { label: string; value: T; options: { value: T; label: string; icon?: IconName }[]; onChange: (v: T) => void; hideLabel?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useIndicator(ref, '[aria-checked="true"]', `${value}|${options.map((o) => o.label).join('|')}`);
  const onKey = (e: KeyboardEvent) => {
    const i = options.findIndex((o) => o.value === value);
    let n = i;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % options.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + options.length) % options.length;
    else return;
    e.preventDefault();
    onChange(options[n].value);
    sound.play('tick');
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
  };
  return (
    <div className="segmented-wrap">
      <span className={hideLabel ? 'sr-only' : 'segmented-label kicker'} id={`${label}-seg`}>
        {label}
      </span>
      <div ref={ref} className="segmented" role="radiogroup" aria-label={label} onKeyDown={onKey}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            tabIndex={o.value === value ? 0 : -1}
            onClick={() => {
              sound.play('tick');
              onChange(o.value);
            }}
          >
            {o.icon ? <Icon name={o.icon} size={16} /> : null}
            <span>{o.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Accessible tabs with roving focus. Panels are rendered by the caller using tabPanelProps. */
export function Tabs<T extends string>({ label, value, tabs, onChange }: { label: string; value: T; tabs: { value: T; label: string; count?: number }[]; onChange: (v: T) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useIndicator(ref, '[aria-selected="true"]', `${value}|${tabs.map((t) => `${t.label}${t.count ?? ''}`).join('|')}`);
  const onKey = (e: KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.value === value);
    let n = i;
    if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = tabs.length - 1;
    else return;
    e.preventDefault();
    onChange(tabs[n].value);
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus());
  };
  return (
    <div ref={ref} className="tabs" role="tablist" aria-label={label} onKeyDown={onKey}>
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          id={`tab-${t.value}`}
          aria-controls={`panel-${t.value}`}
          aria-selected={t.value === value}
          tabIndex={t.value === value ? 0 : -1}
          onClick={() => {
            sound.play('tick');
            onChange(t.value);
          }}
        >
          {t.label}
          {t.count !== undefined ? <span className="tab-count mono">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export const tabPanelProps = (value: string) => ({
  role: 'tabpanel' as const,
  id: `panel-${value}`,
  'aria-labelledby': `tab-${value}`,
  tabIndex: 0,
});
