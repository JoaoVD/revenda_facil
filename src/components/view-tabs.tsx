'use client';
import { useId, useRef, useState, type ReactNode } from 'react';
export function ViewTabs({
  primaryLabel,
  secondaryLabel,
  primary,
  secondary,
}: {
  primaryLabel: string;
  secondaryLabel: string;
  primary: ReactNode;
  secondary: ReactNode;
}) {
  const id = useId();
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div className="ux-view-tabs">
      <div role="tablist" aria-label="Visões de vendas" className="ux-tablist">
        {[primaryLabel, secondaryLabel].map((label, index) => (
          <button
            key={label}
            ref={(element) => {
              tabs.current[index] = element;
            }}
            id={`${id}-tab-${index}`}
            type="button"
            role="tab"
            aria-selected={active === index}
            aria-controls={`${id}-panel-${index}`}
            tabIndex={active === index ? 0 : -1}
            className={active === index ? 'button' : 'small-button'}
            onClick={() => setActive(index)}
            onKeyDown={(event) => {
              if (
                !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
              )
                return;
              event.preventDefault();
              const next =
                event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index;
              setActive(next);
              tabs.current[next]?.focus();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${id}-panel-0`}
        aria-labelledby={`${id}-tab-0`}
        hidden={active !== 0}
      >
        {primary}
      </div>
      <div
        role="tabpanel"
        id={`${id}-panel-1`}
        aria-labelledby={`${id}-tab-1`}
        hidden={active !== 1}
      >
        {secondary}
      </div>
    </div>
  );
}
