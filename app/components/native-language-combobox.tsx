"use client";

import { useEffect, useId, useRef, useState } from "react";

export type NativeLanguageOption = { code: string; name: string };

type Props = Readonly<{
  languages: NativeLanguageOption[];
  value: string;
  onSelect: (code: string) => void;
  disabled?: boolean;
}>;

export function NativeLanguageCombobox({ languages, value, onSelect, disabled = false }: Props) {
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = languages.find((language) => language.code === value);
  const results = languages.filter((language) =>
    `${language.name} ${language.code}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  );

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);

  function choose(language: NativeLanguageOption) {
    onSelect(language.code);
    setOpen(false);
    setQuery("");
  }

  return (
    <div
      className="native-language-combobox"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setQuery("");
        }
      }}
      ref={root}
    >
      <label htmlFor="native-language-search">Native Language</label>
      <div className="native-language-control">
        <span className="native-language-control-icon" aria-hidden="true">🌐</span>
        <input
          id="native-language-search"
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open}
          aria-activedescendant={open && results[activeIndex] ? `${listId}-${activeIndex}` : undefined}
          autoComplete="off"
          disabled={disabled}
          placeholder={disabled ? "Connect DeepL to choose a language" : "Search languages…"}
          value={open ? query : (selected?.name || value)}
          onFocus={() => { setOpen(true); setQuery(""); setActiveIndex(0); }}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); setActiveIndex(0); }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((index) => Math.max(0, Math.min(index + (open ? 1 : 0), results.length - 1)));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((index) => Math.max(index - 1, 0));
            } else if (event.key === "Enter" && open && results[activeIndex]) {
              event.preventDefault();
              choose(results[activeIndex]);
            } else if (event.key === "Escape") {
              setOpen(false);
              setQuery("");
            }
          }}
        />
        <span className="native-language-chevron" aria-hidden="true">⌄</span>
      </div>
      {open && (
        <div className="native-language-options" id={listId} role="listbox" aria-label="DeepL target languages">
          {results.length ? results.map((language, index) => (
            <button
              aria-selected={language.code === value}
              className={index === activeIndex ? "active" : ""}
              id={`${listId}-${index}`}
              key={language.code}
              onClick={() => choose(language)}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              role="option"
              type="button"
            >
              <span>{language.name}</span>
              <small>{language.code.toUpperCase()}</small>
            </button>
          )) : <p className="native-language-empty">No matching languages</p>}
        </div>
      )}
    </div>
  );
}
