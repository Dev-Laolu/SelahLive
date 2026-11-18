"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "./Icon";

/**
 * Custom accessible Select & Searchable Combobox component (V1.1 §2).
 * Replaces all native <select> elements across the app, wizard, dock, and admin.
 *
 * Props:
 *  - value: string | number
 *  - onChange: (val) => void
 *  - options: Array<{ value: string | number, label: string, sub?: string }>
 *  - placeholder?: string
 *  - searchable?: boolean  (enables type-to-filter combobox for Bible version & Book pickers)
 *  - searchPlaceholder?: string
 *  - ariaLabel?: string
 *  - id?: string
 *  - disabled?: boolean
 *  - className?: string
 *  - style?: object
 */
export default function Select({
  value,
  onChange,
  options = [],
  placeholder = "Select…",
  searchable = false,
  searchPlaceholder = "Type to filter…",
  ariaLabel,
  id,
  disabled = false,
  className = "",
  style,
}) {
  const autoId = useId();
  const listId = `${autoId}-list`;
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [typeAhead, setTypeAhead] = useState("");
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const searchRef = useRef(null);
  const listRef = useRef(null);
  const typeTimer = useRef(null);

  const normalized = useMemo(
    () => options.map((o) => (typeof o === "string" || typeof o === "number" ? { value: o, label: String(o) } : o)),
    [options]
  );

  const filtered = useMemo(() => {
    if (!searchable || !filter.trim()) return normalized;
    const q = filter.trim().toLowerCase();
    return normalized.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.sub && o.sub.toLowerCase().includes(q)) || String(o.value).toLowerCase().includes(q)
    );
  }, [normalized, searchable, filter]);

  const selected = normalized.find((o) => String(o.value) === String(value));

  useEffect(() => {
    if (!open) return;
    const idx = filtered.findIndex((o) => String(o.value) === String(value));
    setActiveIdx(idx >= 0 ? idx : 0);
    if (searchable) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open, searchable]); // eslint-disable-line

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setFilter("");
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Scroll active item into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[activeIdx];
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
  }, [activeIdx, open]);

  const choose = (opt) => {
    onChange?.(opt.value);
    setOpen(false);
    setFilter("");
    triggerRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setFilter("");
      triggerRef.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIdx(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIdx(Math.max(0, filtered.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[activeIdx]) choose(filtered[activeIdx]);
    } else if (!searchable && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Type-ahead for non-searchable select
      const next = (typeAhead + e.key).toLowerCase();
      setTypeAhead(next);
      clearTimeout(typeTimer.current);
      typeTimer.current = setTimeout(() => setTypeAhead(""), 700);
      const hit = filtered.findIndex((o) => o.label.toLowerCase().startsWith(next));
      if (hit >= 0) setActiveIdx(hit);
    }
  };

  return (
    <div ref={wrapRef} className={`cselect ${open ? "is-open" : ""} ${className}`} style={style} onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-label={ariaLabel}
        disabled={disabled}
        className="cselect-trigger"
        onClick={() => !disabled && setOpen((o) => !o)}
      >
        <span className={`cselect-val ${selected ? "" : "muted"}`}>{selected ? selected.label : placeholder}</span>
        <Icon name="down" size={16} className="cselect-chev" />
      </button>

      {open && (
        <div className="cselect-menu">
          {searchable && (
            <div className="cselect-search">
              <Icon name="search" size={15} className="muted" />
              <input
                ref={searchRef}
                type="text"
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setActiveIdx(0);
                }}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
              />
            </div>
          )}
          <div ref={listRef} id={listId} role="listbox" className="cselect-list">
            {filtered.length === 0 ? (
              <div className="cselect-empty muted">No matches</div>
            ) : (
              filtered.map((opt, idx) => {
                const isSelected = String(opt.value) === String(value);
                const isActive = idx === activeIdx;
                return (
                  <button
                    key={String(opt.value)}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`cselect-item ${isSelected ? "is-selected" : ""} ${isActive ? "is-active" : ""}`}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => choose(opt)}
                  >
                    <span className="cselect-item-text">
                      <span>{opt.label}</span>
                      {opt.sub && <span className="muted" style={{ fontSize: 11 }}>{opt.sub}</span>}
                    </span>
                    {isSelected && <Icon name="check" size={16} className="gold" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
