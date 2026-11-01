import React, { useEffect, useRef, useState } from "react";
import { ShieldCheck, X, Check, ArrowRight } from "lucide-react";
import { PROFILES, profileFor } from "../shared/analysis.js";
import Brand from "./Brand.jsx";
export default function TraderProfile({ value, onSave, onClose }) {
  const [selected, setSelected] = useState(value || "defensive"),
    ref = useRef(null);
  useEffect(() => {
    const old = document.activeElement;
    ref.current?.focus();
    const key = (e) => {
      if (e.key === "Escape" && value) onClose();
      if (e.key === "Tab") {
        const all = ref.current.querySelectorAll("button,input");
        const first = all[0],
          last = all[all.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      old?.focus();
    };
  }, []);
  const p = profileFor(selected);
  return (
    <div className="modal-backdrop profile-backdrop">
      <section
        className="profile-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
        tabIndex={-1}
        ref={ref}
      >
        <Brand />
        {value && (
          <button
            className="modal-close icon-button"
            aria-label="Close trader profile"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        )}
        <h2 id="profile-title">Your trading style</h2>
        <p>Choose a risk preference. Return goals are not guarantees.</p>
        <div
          className="profile-options"
          role="radiogroup"
          aria-label="Trader preference"
        >
          {PROFILES.map((item) => (
            <label
              key={item.id}
              className={selected === item.id ? "selected" : ""}
            >
              <input
                type="radio"
                name="trader-profile"
                value={item.id}
                checked={selected === item.id}
                onChange={() => setSelected(item.id)}
              />
              <span>
                <b>{item.label}</b>
                <small>
                  {item.risk}% risk budget · {item.targetR}R target goal
                </small>
              </span>
              {selected === item.id && <Check size={17} />}
            </label>
          ))}
        </div>
        <p className="profile-footnote">
          Stored on this device. Stops and risk budgets do not guarantee loss
          limits.
        </p>
        <button className="primary-button" onClick={() => onSave(selected)}>
          Start hunting <ArrowRight size={16} />
        </button>
      </section>
    </div>
  );
}
