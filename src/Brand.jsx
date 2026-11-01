import React from "react";
export default function Brand({ compact = false }) {
  return (
    <span className={`sharpnex-brand ${compact ? "compact" : ""}`}>
      <span className="sharpnex-mark">
        <img src={`${import.meta.env.BASE_URL}sharpnex-mark.png`} alt="" />
      </span>
      {!compact && (
        <span className="sharpnex-wordmark">
          SHARPNEX<small>DIVERGENCE RESEARCH</small>
        </span>
      )}
    </span>
  );
}
