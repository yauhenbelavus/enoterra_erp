import React, { useLayoutEffect, useRef } from 'react';
import {
  applyPlMoneyBackspace,
  applyPlMoneyDelete,
  applyPlMoneyDigit,
  applyPlMoneyPaste,
  PlMoneyEditResult,
} from '../utils/receiptCurrency';

type PlMoneyInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange' | 'inputMode'
> & {
  value: string;
  onChange: (value: string) => void;
};

export function PlMoneyInput({ value, onChange, onKeyDown, onPaste, ...props }: PlMoneyInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const caretRef = useRef<PlMoneyEditResult | null>(null);

  const commitEdit = (result: PlMoneyEditResult) => {
    caretRef.current = result;
    onChange(result.value);
  };

  useLayoutEffect(() => {
    const input = inputRef.current;
    const caret = caretRef.current;
    if (!input || !caret) return;

    input.setSelectionRange(caret.selectionStart, caret.selectionEnd);
    caretRef.current = null;
  }, [value]);

  return (
    <input
      {...props}
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={value}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (e.defaultPrevented) return;

        const input = e.currentTarget;
        const selStart = input.selectionStart ?? value.length;
        const selEnd = input.selectionEnd ?? value.length;

        if (e.key.length === 1 && /\d/.test(e.key)) {
          e.preventDefault();
          commitEdit(applyPlMoneyDigit(value, e.key, selStart, selEnd));
          return;
        }

        if (e.key === 'Backspace') {
          e.preventDefault();
          commitEdit(applyPlMoneyBackspace(value, selStart, selEnd));
          return;
        }

        if (e.key === 'Delete') {
          e.preventDefault();
          commitEdit(applyPlMoneyDelete(value, selStart, selEnd));
        }
      }}
      onPaste={(e) => {
        onPaste?.(e);
        if (e.defaultPrevented) return;

        e.preventDefault();
        const input = e.currentTarget;
        const selStart = input.selectionStart ?? value.length;
        const selEnd = input.selectionEnd ?? value.length;
        const text = e.clipboardData.getData('text');
        commitEdit(applyPlMoneyPaste(value, text, selStart, selEnd));
      }}
      onChange={() => {}}
    />
  );
}
