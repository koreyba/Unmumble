import { ChipButton, cx } from "@/app/components/ui";
import { practiceTabs, type PhraseStatus } from "./model";

type TabId = Exclude<PhraseStatus, "pick">;

/**
 * Learning queues. Desktop shows descriptive tab cards, small screens a
 * scrollable row of chips; both drive the same state.
 */
export function PracticeTabs({
  active,
  counts,
  pulseId,
  onChange,
}: {
  active: PhraseStatus;
  counts: Record<PhraseStatus, number>;
  pulseId: string | null;
  onChange: (tab: TabId) => void;
}) {
  return (
    <>
      <div aria-label="Learning sections" className="practice-chips mobile-only" role="tablist">
        {practiceTabs.map((tab) => (
          <ChipButton
            active={active === tab.id}
            className={cx(pulseId === tab.id && "is-pulsing")}
            count={counts[tab.id] || 0}
            key={tab.id}
            onClick={() => onChange(tab.id)}
            role="tab"
          >
            {tab.label}
          </ChipButton>
        ))}
      </div>

      <div aria-label="Learning sections" className="practice-tabs desktop-only" role="tablist">
        {practiceTabs.map((tab) => (
          <button
            aria-selected={active === tab.id}
            className={cx("practice-tab", active === tab.id && "is-active", pulseId === tab.id && "is-pulsing")}
            key={tab.id}
            onClick={() => onChange(tab.id)}
            role="tab"
            type="button"
          >
            <span className="practice-tab__labels">
              <b>{tab.label}</b>
              <small>{tab.hint}</small>
            </span>
            <strong className="practice-tab__count">{counts[tab.id] || 0}</strong>
          </button>
        ))}
      </div>
    </>
  );
}
