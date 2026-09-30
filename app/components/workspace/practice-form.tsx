import type { FormEvent, ReactNode } from "react";
import { Button, PlusIcon, SearchField, SearchIcon, SelectInput } from "@/app/components/ui";
import type { PhraseSort } from "./model";

const INPUT_ID = "practice-search-input";

/** The Practice toolbar: one field that filters saved phrases and adds new ones. */
export function PracticeForm({
  value,
  onChange,
  busy,
  onSubmit,
  sort,
  sortOptions,
  onSortChange,
  filterButton,
}: {
  value: string;
  onChange: (value: string) => void;
  busy: boolean;
  onSubmit: (event: FormEvent) => void;
  sort: PhraseSort;
  sortOptions: Array<{ value: PhraseSort; label: string }>;
  onSortChange: (sort: PhraseSort) => void;
  filterButton: ReactNode;
}) {
  return (
    <form className="practice-form" onSubmit={onSubmit}>
      <label className="sr-only" htmlFor={INPUT_ID}>Search your phrases</label>
      <div className="practice-form__row">
        <SearchField
          icon={<SearchIcon size={17} />}
          id={INPUT_ID}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Search or add a new word"
          type="text"
          value={value}
          wrapperClassName="practice-form__field"
        />
        <Button
          collapse
          disabled={busy || !value.trim()}
          icon={<PlusIcon size={17} />}
          type="submit"
          variant="primary"
        >
          To Learn
        </Button>
        {filterButton}
      </div>

      <div className="practice-form__helper">
        <span>One field: search what you have, or add what you just heard. Text is enough — phonetics are optional.</span>
        <SelectInput
          aria-label="Sort phrases"
          className="phrase-sort desktop-only"
          onChange={(event) => onSortChange(event.target.value as PhraseSort)}
          value={sort}
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </SelectInput>
      </div>
    </form>
  );
}
