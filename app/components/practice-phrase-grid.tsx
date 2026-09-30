"use client";

import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { ReactNode, useCallback, useLayoutEffect, useRef, useState } from "react";
import {
  practiceVirtualRow,
  practiceVirtualRowCount,
  shouldVirtualizePracticeList,
} from "@/lib/practice-list";

// Practice phrases are list rows, so the virtual grid is a single column.
const PRACTICE_GRID_COLUMNS = 1;
const ESTIMATED_PRACTICE_ROW_HEIGHT = 74;

type PracticePhraseGridProps<T extends { id: string }> = {
  items: readonly T[];
  renderItem: (item: T) => ReactNode;
};

function VirtualizedPracticePhraseGrid<T extends { id: string }>({
  items,
  renderItem,
}: PracticePhraseGridProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const rowCount = practiceVirtualRowCount(items.length, PRACTICE_GRID_COLUMNS);
  const getRowKey = useCallback((rowIndex: number) => (
    practiceVirtualRow(items, rowIndex, PRACTICE_GRID_COLUMNS)
      .map((item) => item.id)
      .join(":")
  ), [items]);
  const virtualizer = useWindowVirtualizer<HTMLDivElement>({
    count: rowCount,
    estimateSize: () => ESTIMATED_PRACTICE_ROW_HEIGHT,
    getItemKey: getRowKey,
    overscan: 3,
    scrollMargin,
    useFlushSync: false,
  });

  useLayoutEffect(() => {
    const measureListOffset = () => {
      const list = listRef.current;
      if (!list) return;
      const nextMargin = list.getBoundingClientRect().top + window.scrollY;
      setScrollMargin((currentMargin) => Math.abs(currentMargin - nextMargin) < 1
        ? currentMargin
        : nextMargin);
    };

    measureListOffset();
    window.addEventListener("resize", measureListOffset);
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(measureListOffset);
    if (listRef.current?.parentElement) observer?.observe(listRef.current.parentElement);

    return () => {
      window.removeEventListener("resize", measureListOffset);
      observer?.disconnect();
    };
  }, [items.length]);

  useLayoutEffect(() => {
    virtualizer.measure();
  }, [items, scrollMargin, virtualizer]);

  const virtualRows = virtualizer.getVirtualItems();
  const renderedCount = virtualRows.reduce((count, row) => (
    count + practiceVirtualRow(items, row.index, PRACTICE_GRID_COLUMNS).length
  ), 0);

  return (
    <div
      aria-label={`${items.length} phrases`}
      className="practice-virtual-list"
      data-rendered-count={renderedCount}
      data-total-count={items.length}
      data-virtualized="true"
      ref={listRef}
      style={{ height: `${virtualizer.getTotalSize()}px` }}
    >
      {virtualRows.map((virtualRow) => (
        <div
          className="practice-virtual-row"
          data-index={virtualRow.index}
          key={virtualRow.key}
          ref={virtualizer.measureElement}
          style={{
            transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
          }}
        >
          {practiceVirtualRow(items, virtualRow.index, PRACTICE_GRID_COLUMNS).map((item) => (
            <div className="practice-virtual-cell" key={item.id}>{renderItem(item)}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function PracticePhraseGrid<T extends { id: string }>({
  items,
  renderItem,
}: PracticePhraseGridProps<T>) {
  if (!shouldVirtualizePracticeList(items.length)) {
    return <div className="phrase-grid" data-virtualized="false">{items.map(renderItem)}</div>;
  }

  return <VirtualizedPracticePhraseGrid items={items} renderItem={renderItem} />;
}
