'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { HeadingHelp } from '@/components/ui/heading-help';

/** Presentation only: every chart retains its existing authorized drill-down. */
export function ReviewChartLane({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const [ends, setEnds] = useState({ start: true, end: false });
  const lane = useRef<HTMLDivElement>(null);
  function measure() {
    const node = lane.current;
    if (node) {
      const first = node.firstElementChild as HTMLElement | null;
      setEnds({ start: node.scrollLeft <= (first?.offsetLeft ?? 0) + 1, end: node.scrollLeft + node.clientWidth >= node.scrollWidth - 1 });
    }
  }
  useEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (lane.current) observer.observe(lane.current);
    return () => observer.disconnect();
  }, [expanded]);
  function move(direction: number) {
    const node = lane.current;
    if (!node) return;
    const cards = Array.from(node.children) as HTMLElement[];
    const current = cards.findIndex(card => card.offsetLeft >= node.scrollLeft - 1);
    const target = cards[Math.max(0, Math.min(cards.length - 1, (current < 0 ? cards.length - 1 : current) + direction))];
    if (target) node.scrollTo({ left: target.offsetLeft });
  }
  return <div className="review-chart-workspace">
    <div className="review-chart-toolbar"><HeadingHelp label="Review Charts" heading={<h3>Review Charts</h3>} help={expanded ? 'All charts' : 'One row · scroll for more charts'} />
      <div className="row">
        {!expanded && <><button type="button" className="button button-secondary" aria-controls="review-charts" disabled={ends.start} onClick={() => move(-1)}>Previous chart</button>
          <button type="button" className="button button-secondary" aria-controls="review-charts" disabled={ends.end} onClick={() => move(1)}>Next chart</button></>}
        <button type="button" className="button button-secondary" aria-expanded={expanded} aria-controls="review-charts" onClick={() => setExpanded(!expanded)}>{expanded ? 'Collapse to one row' : 'Expand chart grid'}</button>
      </div>
    </div>
    <div id="review-charts" ref={lane} className={`review-chart-grid${expanded ? ' review-chart-expanded' : ' review-chart-lane'}`}
      role="region" aria-label={expanded ? 'All review charts' : 'Review charts; scroll horizontally'} tabIndex={expanded ? undefined : 0} onScroll={measure}>{children}</div>
  </div>;
}
