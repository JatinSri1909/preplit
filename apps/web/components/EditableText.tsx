'use client';

import { useEffect, useRef, useState } from 'react';
import { Spinner } from './ui';

/**
 * Inline editing, used for every editable string in the kit.
 *
 * The brief asks that editing "feel immediate rather than round-tripping
 * for every keystroke", and the naive fix — debounce a PATCH on each
 * change — is worse than it looks: it fires a write mid-word, so a slow
 * connection can land two overlapping saves and the loser wins. Instead
 * the textarea is purely local while it has focus, and the save happens
 * once, on blur, and only if the text actually changed. Typing never waits
 * for the network; the network is touched once per edit.
 *
 * Escape reverts and leaves, which is the behaviour people expect from an
 * inline editor and the reason they are willing to click into one.
 */
export function EditableText({
  value,
  onSave,
  label,
  multiline = true,
  className = '',
  placeholder,
  saving = false,
}: {
  value: string;
  onSave: (next: string) => void;
  label: string;
  multiline?: boolean;
  className?: string;
  placeholder?: string;
  saving?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement>(null);

  // If the kit changes underneath us — a regeneration, another tab — take
  // the new value, but never while the user is mid-edit.
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next !== value.trim() && next.length > 0) onSave(next);
    else setDraft(value);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Edit ${label}`}
        className={`block w-full rounded px-1.5 py-1 text-left hover:bg-accent-soft/60 ${className}`}
      >
        {value || <span className="text-muted">{placeholder ?? `Add ${label}`}</span>}
        {saving && <span className="ml-2 align-middle text-muted"><Spinner /></span>}
      </button>
    );
  }

  const shared = {
    value: draft,
    onBlur: commit,
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) =>
      setDraft(e.target.value),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDraft(value);
        setEditing(false);
      }
      // Enter saves a single-line field; in a textarea it is a newline, so
      // there Cmd/Ctrl+Enter is the commit.
      if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        commit();
      }
    },
    'aria-label': label,
    className: `w-full rounded border border-accent bg-surface px-1.5 py-1 ${className}`,
  };

  return multiline ? (
    <textarea {...shared} ref={ref as React.RefObject<HTMLTextAreaElement>} rows={3} />
  ) : (
    <input {...shared} ref={ref as React.RefObject<HTMLInputElement>} />
  );
}
