import {
  CONNECTED_SPEECH_MECHANISMS,
  type ConnectedSpeechMechanism,
  type PracticeFormat,
} from "@/lib/catalog/connected-speech-catalog";
import { Badge, Button, CheckIcon, FilterIcon, InfoPopover, cx } from "@/app/components/ui";
import { mechanismChoices, practiceFormatTabs, type PracticeSource, type Surface } from "./model";

/** Explains one connected-speech mechanism in a popover; `example` is a real phrase from the catalog. */
export function MechanismHelp({
  mechanism,
  helpKey,
  label,
  example,
  openKey,
  onOpenChange,
  align,
}: Readonly<{
  mechanism: ConnectedSpeechMechanism;
  helpKey: string;
  label: string;
  example: string;
  openKey: string | null;
  onOpenChange: (key: string | null) => void;
  align?: "start" | "end";
}>) {
  const definition = CONNECTED_SPEECH_MECHANISMS[mechanism];
  return (
    <InfoPopover
      align={align}
      example={example || undefined}
      label={label}
      onOpenChange={(open) => onOpenChange(open ? helpKey : null)}
      open={openKey === helpKey}
      title={definition.title}
    >
      {definition.description}
    </InfoPopover>
  );
}

function OptionCheck({ checked }: Readonly<{ checked: boolean }>) {
  return (
    <span aria-hidden="true" className={cx("filter-check", checked && "is-checked")}>
      {checked && <CheckIcon size={12} strokeWidth={3} />}
    </span>
  );
}

export type FilterPanelProps = {
  surface: Surface;
  /** Distinguishes popover ids between the desktop sidebar and the mobile sheet. */
  variant: "sidebar" | "sheet";
  activeFormat: PracticeFormat;
  formatCounts: Record<PracticeFormat, number>;
  onFormatChange: (format: PracticeFormat) => void;
  practiceSources: ReadonlySet<PracticeSource>;
  practiceSourceCounts: Record<PracticeSource, number>;
  onToggleSource: (source: PracticeSource) => void;
  selectedMechanisms: ReadonlySet<ConnectedSpeechMechanism>;
  mechanismCounts: Record<ConnectedSpeechMechanism, number>;
  allMechanismsCount: number;
  onToggleMechanism: (mechanism: ConnectedSpeechMechanism) => void;
  onClearMechanisms: () => void;
  openHelpKey: string | null;
  onHelpChange: (key: string | null) => void;
  mechanismExample: (mechanism: ConnectedSpeechMechanism) => string;
  onReset: () => void;
};

/** Filters shared by the desktop sidebar and the mobile bottom sheet. */
export function FilterPanel(props: Readonly<FilterPanelProps>) {
  const {
    surface, variant, activeFormat, formatCounts, onFormatChange, practiceSources, practiceSourceCounts,
    onToggleSource, selectedMechanisms, mechanismCounts, allMechanismsCount, onToggleMechanism,
    onClearMechanisms, openHelpKey, onHelpChange, mechanismExample, onReset,
  } = props;
  const sourceRows: Array<{ id: PracticeSource; label: string }> = [
    { id: "catalog", label: "From catalog" },
    { id: "custom", label: "Your phrases" },
  ];

  return (
    <>
      <div className="filter-panel__header">
        <strong>Filters</strong>
        <button className="filter-panel__reset" onClick={onReset} type="button">Reset</button>
      </div>

      {surface === "library" ? (
        <div className="filter-group">
          <span className="filter-group__title">Practice format</span>
          <div className="filter-options" role="radiogroup" aria-label="Practice format">
            {practiceFormatTabs.map(([kind, definition]) => {
              const active = activeFormat === kind;
              return (
                <button
                  aria-checked={active}
                  className={cx("filter-option", active && "is-active")}
                  key={kind}
                  onClick={() => onFormatChange(kind)}
                  role="radio"
                  type="button"
                >
                  <span aria-hidden="true" className="filter-radio" />
                  <span className="filter-option__title">{definition.title}</span>
                  <span className="filter-option__count">{formatCounts[kind] ?? 0}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="filter-group">
          <span className="filter-group__title">Source</span>
          <div className="filter-options">
            {sourceRows.map((row) => {
              const checked = practiceSources.has(row.id);
              return (
                <button
                  aria-checked={checked}
                  className={cx("filter-option", checked && "is-active")}
                  key={row.id}
                  onClick={() => onToggleSource(row.id)}
                  role="checkbox"
                  type="button"
                >
                  <OptionCheck checked={checked} />
                  <span className="filter-option__title">{row.label}</span>
                  <span className="filter-option__count">{practiceSourceCounts[row.id]}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="filter-group">
        <div className="filter-group__heading">
          <span className="filter-group__title">Mechanism</span>
          <span className="filter-group__hint">? explains it</span>
        </div>

        <div className="filter-options">
          {surface === "library" && (
            <button
              aria-checked={selectedMechanisms.size === 0}
              className={cx("filter-option", "filter-option--all", selectedMechanisms.size === 0 && "is-active")}
              onClick={onClearMechanisms}
              role="checkbox"
              type="button"
            >
              <OptionCheck checked={selectedMechanisms.size === 0} />
              <span className="filter-option__title">All mechanisms</span>
              <span className="filter-option__count">{allMechanismsCount}</span>
            </button>
          )}

          {mechanismChoices.map(([mechanism, definition]) => {
            const checked = selectedMechanisms.has(mechanism);
            return (
              <div className={cx("filter-option", "filter-option--mechanism", checked && "is-active")} key={mechanism}>
                <label className="filter-option__label">
                  <input
                    aria-label={definition.title}
                    checked={checked}
                    className="ui-visually-hidden"
                    onChange={() => onToggleMechanism(mechanism)}
                    type="checkbox"
                  />
                  <OptionCheck checked={checked} />
                  <span className="filter-option__text">
                    <span className="filter-option__title">{definition.title}</span>
                    <span className="filter-option__hint">{definition.hint}</span>
                  </span>
                </label>
                <MechanismHelp
                  align="end"
                  example={mechanismExample(mechanism)}
                  helpKey={`filter:${mechanism}${variant === "sheet" ? "-mobile" : ""}`}
                  label={definition.title}
                  mechanism={mechanism}
                  onOpenChange={onHelpChange}
                  openKey={openHelpKey}
                />
                {surface === "library" && <span className="filter-option__count">{mechanismCounts[mechanism] || 0}</span>}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

/** Opens the filter sheet on small screens; shows how many filters are active. */
export function MobileFilterButton({ activeCount, onClick }: Readonly<{ activeCount: number; onClick: () => void }>) {
  return (
    <Button
      aria-label={activeCount > 0 ? `Open filters (${activeCount} active)` : "Open filters"}
      className="mobile-filter-trigger mobile-only"
      icon={<FilterIcon size={17} />}
      onClick={onClick}
      variant={activeCount > 0 ? "soft" : "secondary"}
    >
      {activeCount > 0 && <Badge className="filter-count-badge" tone="info">{activeCount}</Badge>}
    </Button>
  );
}
