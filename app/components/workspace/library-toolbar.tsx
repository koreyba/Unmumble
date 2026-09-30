import type { ReactNode } from "react";
import { PRACTICE_FORMATS, type ConnectedSpeechMechanism, type PracticeFormat } from "@/lib/catalog/connected-speech-catalog";
import { Button, Chip, ChipButton, CloseIcon, SearchField, SearchIcon, SelectInput } from "@/app/components/ui";
import { shortMechanismTitle, type PhraseSort } from "./model";

/** Library search, sort, and the removable filter chips shown on small screens. */
export function LibraryToolbar({
  search,
  onSearchChange,
  sort,
  sortOptions,
  onSortChange,
  filterButton,
  format,
  selectedMechanisms,
  onToggleMechanism,
  onClearAll,
}: Readonly<{
  search: string;
  onSearchChange: (value: string) => void;
  sort: PhraseSort;
  sortOptions: Array<{ value: PhraseSort; label: string }>;
  onSortChange: (sort: PhraseSort) => void;
  filterButton: ReactNode;
  format: PracticeFormat;
  selectedMechanisms: ReadonlySet<ConnectedSpeechMechanism>;
  onToggleMechanism: (mechanism: ConnectedSpeechMechanism) => void;
  onClearAll: () => void;
}>) {
  return (
    <>
      <div className="library-toolbar">
        <SearchField
          aria-label="Search the catalog"
          icon={<SearchIcon size={17} />}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search phrase or sound"
          value={search}
          wrapperClassName="library-toolbar__search"
        />
        {filterButton}
        <SelectInput
          aria-label="Sort catalog"
          className="phrase-sort desktop-only"
          onChange={(event) => onSortChange(event.target.value as PhraseSort)}
          value={sort}
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </SelectInput>
      </div>

      <div className="filter-chips mobile-only">
        <Chip>{PRACTICE_FORMATS[format].title}</Chip>
        {Array.from(selectedMechanisms).map((mechanism) => (
          <ChipButton
            active
            aria-label={`Remove filter ${shortMechanismTitle(mechanism)}`}
            key={mechanism}
            onClick={() => onToggleMechanism(mechanism)}
          >
            {shortMechanismTitle(mechanism)}
            <CloseIcon size={12} />
          </ChipButton>
        ))}
        {(selectedMechanisms.size > 0 || search) && (
          <Button onClick={onClearAll} size="sm" variant="ghost">Clear all</Button>
        )}
      </div>
    </>
  );
}
