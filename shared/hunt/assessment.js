import { plan } from "./engine.js";
import { eventWindow, profileFor } from "../analysis.js";
export function assessHunt(
  data,
  quote,
  research,
  profileId,
  model,
  now = Date.now(),
  paused = false,
) {
  const c = data?.candidate,
    p = profileFor(profileId),
    calendar = eventWindow(research, now),
    checks = [];
  const add = (label, ok) => checks.push({ label, ok: !!ok });
  add(
    "Fresh candles",
    data?.status === "ready" &&
      !paused &&
      now - data.receivedAt < 45000 &&
      now - data.receivedAt >= 0,
  );
  add(
    "Live bid / ask",
    quote &&
      quote.symbol === data?.symbol &&
      quote.venue === data?.venue &&
      now - quote.receivedAt < 8000 &&
      now - quote.asOf < 8000 &&
      now - quote.asOf >= -1000,
  );
  if (!c)
    return { checks, eligible: false, stage: "No setup", plan: null, calendar };
  const q = checks[1].ok ? quote : null,
    entry = q ? (c.direction === 1 ? q.ask : q.bid) : c.entry;
  // The target is anchored at detection. Never move it farther away to rescue a poor R:R.
  const projected = plan(
    entry,
    c.stop,
    c.direction,
    data.rule.targetR,
    data.venue,
    q?.spreadBps,
    1,
    c.target,
  );
  const bar = data.currentCandle;
  const touched =
    bar &&
    bar.time * 1000 >= c.confirmedAt &&
    (c.direction === 1 ? bar.low <= c.stop : bar.high >= c.stop);
  const targetTouched =
    bar &&
    bar.time * 1000 >= c.confirmedAt &&
    c.stage === "triggered" &&
    (c.direction === 1 ? bar.high >= c.target : bar.low <= c.target);
  add(
    "Setup still valid",
    now < c.expiresAt &&
      !touched &&
      !targetTouched &&
      projected.distance > 0 &&
      projected.reward > 0,
  );
  add("Closed-bar confirmation", c.stage === "triggered");
  add("Entry within 0.5 ATR", q && Math.abs(entry - c.entry) <= c.atr * 0.5);
  add("Net reward ≥ risk", projected.netR >= 1);
  add("Spread within profile", q && q.spreadBps <= p.maxSpread);
  add(
    "Trend & volume",
    c.trend && c.relativeVolume >= Math.max(p.minVolume, data.rule.volume),
  );
  add("Target meets profile", data.rule.targetR >= p.targetR);
  add("Calendar checked", calendar.fresh);
  add("Outside event window", calendar.fresh && calendar.events.length === 0);
  if (data.venue === "perp")
    add(
      "Fresh perpetual context",
      data.derivatives && now - data.derivatives.asOf < 60000,
    );
  // Research qualification is stricter than merely passing technical filters.
  const supported =
    model?.interval === data.interval &&
    model?.family === c.family &&
    data.venue === "spot" &&
    model?.symbol === data.symbol &&
    model?.venue === "spot" &&
    model?.verdict === "positive-sample";
  add("Positive matched holdout", supported);
  const technical = checks
    .filter((x) => x.label !== "Positive matched holdout")
    .every((x) => x.ok);
  return {
    checks,
    eligible: checks.every((x) => x.ok),
    technical,
    stage:
      !checks[0].ok || !checks[1].ok
        ? "Stale"
        : !checks[2].ok
          ? "Expired"
          : c.stage === "watch"
            ? "Watch"
            : technical
              ? supported
                ? "Qualified"
                : "Research only"
              : "Blocked",
    plan: projected,
    calendar,
  };
}
