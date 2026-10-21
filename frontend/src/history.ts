import "./history.css";
import type { Activity, API } from "./types";

export const historyLayout = `
<section id="history" hidden>
 <div class="history-heading"><h2>Histórico</h2><button data-history="today">Hoje</button></div>
 <div class="week-navigation"><button data-history="previous" aria-label="Semana anterior">‹</button><span id="week-label"></span><button data-history="next" aria-label="Próxima semana">›</button></div>
 <div id="week-days" aria-label="Dias da semana"></div>
 <div id="week-total"></div>
 <div class="history-day" id="history-day"></div>
 <div id="history-summary"></div>
 <div class="section-label history-label">ATIVIDADE POR HORÁRIO</div>
 <div id="hour-chart" role="img" aria-label="Tempo de uso por hora"></div>
 <div class="hour-labels"><span>00h</span><span>06h</span><span>12h</span><span>18h</span><span>24h</span></div>
 <div class="history-legend"><span class="focus">Foco</span><span class="gaming">Jogando</span><span class="other">Outros</span></div>
 <div class="section-label history-label">SESSÕES DO DIA</div>
 <div id="history-sessions"></div>
</section>`;

type Kind = "focus" | "gaming" | "other";

const dayNames = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
const dateLabel = (date: Date) =>
  date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
const longDateLabel = (date: Date) =>
  date.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
const timeLabel = (date: Date) =>
  date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const midnight = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date: Date, count: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + count);
const duration = (seconds: number) => {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}min`;
};
const kindOf = (record: Activity): Kind =>
  record.gaming ? "gaming" : record.focus ? "focus" : "other";
const modeNames = { pomodoro: "Pomodoro", timer: "Timer", stopwatch: "Stopwatch" };
const kindNames: Record<Kind, string> = { focus: "Foco", gaming: "Jogando", other: "Sem foco" };

export function setupHistory(api: API) {
  const root = document.querySelector<HTMLElement>("#history")!;
  const element = (id: string) => root.querySelector<HTMLElement>(id)!;
  let selected = midnight(new Date());
  let lastToday = selected;
  let records: Activity[] = [];
  let loading = false;
  let lastKey = "";

  function day(date: Date) {
    const begin = +date,
      end = +addDays(date, 1);
    const sessions = records.flatMap((record) => {
      const start = Math.max(+new Date(record.start), begin);
      const stop = Math.min(+new Date(record.end), end);
      if (stop <= start) return [];
      return [
        {
          ...record,
          kind: kindOf(record),
          start,
          stop,
          seconds: (stop - start) / 1000,
          completed:
            record.completed &&
            +new Date(record.end) > begin &&
            +new Date(record.end) <= end,
        },
      ];
    });
    const total = (kind: Kind) =>
      sessions.filter((s) => s.kind === kind).reduce((sum, s) => sum + s.seconds, 0);
    return {
      sessions,
      focus: total("focus"),
      gaming: total("gaming"),
      active: sessions.reduce((sum, s) => sum + s.seconds, 0),
      completed: sessions.filter((s) => s.completed).length,
    };
  }

  function render() {
    const today = midnight(new Date());
    if (+selected === +lastToday || +selected > +today) selected = today;
    lastToday = today;
    const monday = addDays(selected, -((selected.getDay() + 6) % 7));
    const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i)).filter(
      (date) => +date <= +today,
    );
    const current = day(selected);
    const key = JSON.stringify([
      +selected,
      +today,
      records.map((r) => [r.start, r.end.slice(0, 19), r.completed, r.gaming]),
    ]);
    if (key === lastKey) return;
    lastKey = key;
    element("#week-label").textContent =
      `${dateLabel(monday)} — ${dateLabel(days[days.length - 1])} · ${days[days.length - 1].getFullYear()}`;
    const next = element('[data-history="next"]') as HTMLButtonElement;
    next.disabled = +addDays(monday, 7) > +today;
    const week = days.map(day);
    const maxDay = Math.max(1, ...week.map((d) => d.focus + d.gaming));
    element("#week-days").innerHTML = days
      .map(
        (d, i) =>
          `<button data-day="${i}" class="${+d === +selected ? "active" : ""}" aria-pressed="${+d === +selected}" aria-label="${dayNames[i]}, ${dateLabel(d)}: ${duration(week[i].focus)} de foco, ${duration(week[i].gaming)} jogando"><span>${dayNames[i]}</span><strong>${d.getDate()}</strong><i><b style="width:${(week[i].focus / maxDay) * 100}%"></b><em style="width:${(week[i].gaming / maxDay) * 100}%"></em></i></button>`,
      )
      .join("");
    const weekFocus = week.reduce((sum, d) => sum + d.focus, 0);
    const weekGaming = week.reduce((sum, d) => sum + d.gaming, 0);
    element("#week-total").innerHTML =
      `<span>Na semana</span><span class="focus">${duration(weekFocus)} de foco</span><span class="gaming">${duration(weekGaming)} jogando</span>`;
    element("#history-day").textContent =
      +selected === +today ? `Hoje · ${longDateLabel(selected)}` : longDateLabel(selected);
    element("#history-summary").innerHTML = [
      ["focus", duration(current.focus), "de foco"],
      ["gaming", duration(current.gaming), "jogando"],
      ["done", String(current.completed), current.completed === 1 ? "pomodoro concluído" : "pomodoros concluídos"],
      ["total", duration(current.active), "de uso no total"],
    ]
      .map(([kind, value, label]) => `<div class="stat ${kind}"><strong>${value}</strong><span>${label}</span></div>`)
      .join("");
    element("#hour-chart").innerHTML = Array.from({ length: 24 }, (_, hour) => {
      const start = +new Date(selected.getFullYear(), selected.getMonth(), selected.getDate(), hour);
      const end = +new Date(selected.getFullYear(), selected.getMonth(), selected.getDate(), hour + 1);
      const totals: Record<Kind, number> = { focus: 0, gaming: 0, other: 0 };
      for (const session of current.sessions)
        totals[session.kind] +=
          Math.max(0, Math.min(session.stop, end) - Math.max(session.start, start)) / 1000;
      return `<div class="hour-column" title="${String(hour).padStart(2, "0")}h · ${duration(totals.focus)} foco · ${duration(totals.gaming)} jogando · ${duration(totals.other)} outros">${(["other", "gaming", "focus"] as Kind[]).map((kind) => `<i class="${kind}" style="height:${(totals[kind] / 3600) * 100}%"></i>`).join("")}</div>`;
    }).join("");
    element("#history-sessions").innerHTML = current.sessions.length
      ? [...current.sessions]
          .reverse()
          .map((s) => {
            const detail =
              s.mode === "pomodoro"
                ? "Pomodoro"
                : `${modeNames[s.mode]}${s.kind === "focus" ? " · Deep Work" : ""}`;
            return `<div class="history-session ${s.kind}"><span class="session-main"><span class="session-tags"><em>${kindNames[s.kind]}</em>${s.completed ? '<em class="done">✓ concluído</em>' : ""}</span><span class="session-time">${timeLabel(new Date(s.start))} – ${timeLabel(new Date(s.stop))}<small>${detail}</small></span></span><strong>${duration(s.seconds)}</strong></div>`;
          })
          .join("")
      : '<p class="history-empty">Nenhuma sessão neste dia.</p>';
  }

  root.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "button",
    );
    if (!button) return;
    if (button.dataset.day !== undefined)
      selected = addDays(
        selected,
        -((selected.getDay() + 6) % 7) + Number(button.dataset.day),
      );
    if (button.dataset.history === "previous") selected = addDays(selected, -7);
    if (button.dataset.history === "next") selected = addDays(selected, 7);
    if (button.dataset.history === "today") selected = midnight(new Date());
    if (+selected > +midnight(new Date())) selected = midnight(new Date());
    render();
  });

  async function refresh() {
    if (root.hidden || loading) return;
    render();
    loading = true;
    try {
      records = await api.History();
      render();
    } catch {
      element("#history-sessions").textContent =
        "Não foi possível carregar o histórico.";
    } finally {
      loading = false;
    }
  }
  window.setInterval(() => void refresh(), 1000);
  return refresh;
}
