/* A text box for formulas that colours its references.

   An <input> cannot colour parts of its text, so the text is drawn twice: once in a mirror
   behind the box, in coloured pieces, and once in the box itself, transparent, with only its
   caret and selection showing. The two use the same font and padding, and the mirror follows
   the box's horizontal scroll, so they line up character for character. */

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { highlight, REF_COLOURS } from './formula-ui';

interface Props {
  id: string;
  value: string;
  caret: number;
  onChange: (value: string, caret: number) => void;
  onCaret: (caret: number) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  className?: string;
  label: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  /** the autocomplete list, when there is one */
  listId?: string | undefined;
  activeOption?: string | undefined;
  expanded?: boolean | undefined;
  readOnly?: boolean;
}

export function FormulaInput(p: Props) {
  const own = useRef<HTMLInputElement | null>(null);
  const ref = p.inputRef ?? own;
  const [scroll, setScroll] = useState(0);
  const isFormula = p.value.startsWith('=');
  const pieces = useMemo(() => (isFormula ? highlight(p.value).pieces : []), [isFormula, p.value]);

  // keep the caret where the app says it is (after pointing at a cell, or accepting a suggestion)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || document.activeElement !== el) return;
    if (el.selectionStart !== p.caret || el.selectionEnd !== p.caret)
      el.setSelectionRange(p.caret, p.caret);
    setScroll(el.scrollLeft);
  }, [ref, p.caret, p.value]);

  return (
    <div className={`fx-input${isFormula ? ' formula' : ''} ${p.className ?? ''}`}>
      {isFormula && (
        <div className="mirror" aria-hidden="true">
          <div style={{ transform: `translateX(${-scroll}px)` }}>
            {pieces.map((piece, i) => (
              <span
                key={i}
                className={`t-${piece.kind}`}
                style={
                  piece.colour !== undefined ? { color: REF_COLOURS[piece.colour] } : undefined
                }
              >
                {piece.text}
              </span>
            ))}
          </div>
        </div>
      )}
      <input
        ref={ref}
        id={p.id}
        value={p.value}
        aria-label={p.label}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        readOnly={p.readOnly}
        role={p.listId ? 'combobox' : undefined}
        aria-expanded={p.listId ? !!p.expanded : undefined}
        aria-controls={p.listId}
        aria-autocomplete={p.listId ? 'list' : undefined}
        aria-activedescendant={p.expanded ? p.activeOption : undefined}
        onChange={(e) => {
          p.onChange(e.target.value, e.target.selectionStart ?? e.target.value.length);
          setScroll(e.target.scrollLeft);
        }}
        onSelect={(e) => {
          const el = e.currentTarget;
          if (el.selectionStart !== null && el.selectionStart === el.selectionEnd)
            p.onCaret(el.selectionStart);
          setScroll(el.scrollLeft);
        }}
        onScroll={(e) => setScroll(e.currentTarget.scrollLeft)}
        onKeyDown={p.onKeyDown}
        onFocus={p.onFocus}
        onBlur={p.onBlur}
      />
    </div>
  );
}
