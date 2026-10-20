/* A menu in the WAI-ARIA pattern: arrow keys move, Enter chooses, Escape closes, and focus
   goes back where it came from. Used for the right-click menu and the toolbar's drop-downs. */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface MenuItem {
  id: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  checked?: boolean;
}

export type MenuEntry = MenuItem | 'separator';

interface Props {
  x: number;
  y: number;
  items: MenuEntry[];
  label: string;
  onChoose: (id: string) => void;
  onClose: () => void;
}

export function Menu({ x, y, items, label, onChoose, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const real = items.filter((i): i is MenuItem => i !== 'separator');
  const [index, setIndex] = useState(() => real.findIndex((i) => !i.disabled));
  const [pos, setPos] = useState({ x, y });

  // keep the menu on screen
  useLayoutEffect(() => {
    const el = ref.current!;
    const r = el.getBoundingClientRect();
    setPos({
      x: Math.max(8, Math.min(x, innerWidth - r.width - 8)),
      y: Math.max(8, Math.min(y, innerHeight - r.height - 8)),
    });
  }, [x, y]);

  useEffect(() => {
    ref.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]')[index]?.focus();
  }, [index]);

  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    addEventListener('pointerdown', away, true);
    return () => removeEventListener('pointerdown', away, true);
  }, [onClose]);

  const move = (d: number) => {
    let i = index;
    for (let n = 0; n < real.length; n++) {
      i = (i + d + real.length) % real.length;
      if (!real[i]!.disabled) break;
    }
    setIndex(i);
  };

  let k = -1;
  return (
    <div
      ref={ref}
      className="menu"
      role="menu"
      aria-label={label}
      style={{ left: pos.x, top: pos.y }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown') move(1);
        else if (e.key === 'ArrowUp') move(-1);
        else if (e.key === 'Home') setIndex(real.findIndex((i) => !i.disabled));
        else if (e.key === 'End')
          setIndex(real.length - 1 - [...real].reverse().findIndex((i) => !i.disabled));
        else if (e.key === 'Escape' || e.key === 'Tab') onClose();
        else return;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {items.map((item, i) => {
        if (item === 'separator') return <div key={`s${i}`} role="separator" className="sep" />;
        k++;
        const mine = k;
        return (
          <button
            key={item.id}
            type="button"
            role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
            aria-checked={item.checked}
            tabIndex={mine === index ? 0 : -1}
            disabled={item.disabled}
            aria-disabled={item.disabled}
            onPointerEnter={() => !item.disabled && setIndex(mine)}
            onClick={() => {
              onClose();
              onChoose(item.id);
            }}
          >
            <span>{item.label}</span>
            {item.hint && <kbd>{item.hint}</kbd>}
          </button>
        );
      })}
    </div>
  );
}
