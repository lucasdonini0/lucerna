import type { Alarm, API, Settings, State } from "./types";
import { icon, layout } from "./view";
import { setupHistory } from "./history";
import {
  bubbleBurstSound,
  bubbleClickSound,
  bubbleCompletedSound,
  clickSound,
  completedSound,
  deepWorkSound,
  setBubbleAmbience,
  startAlarmSound,
  stopAlarmSound,
  unlockAudio,
} from "./audio";
import "./style.css";

const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
let state: State;
let api: API;
let taskKey = "";
let settingsKey = "";
let lastBell = 0;
let lastWarning = "";
let busy = false;
let lastStart = 0;
let messageIndex = 0;
let messageTimeout = 0;
let historyOpen = false;
let alarmsOpen = false;
let activeAlarmKey = "";
let alarmExpanding = false;
let previewTimeout = 0;
let refreshHistory: () => Promise<void>;
let lastRun = "";
let ambienceKey = "";

const messages = {
  focus: [
    "Uma coisa de cada vez.",
    "Pequenos passos também levam longe.",
    "Você só precisa começar.",
    "Este momento é seu.",
    "Seu esforço está fazendo diferença.",
  ],
  rest: [
    "Respire. O descanso faz parte.",
    "Uma pausa para recarregar.",
    "Solte os ombros. Você merece esse respiro.",
    "Descanse agora, continue com calma.",
  ],
  gaming: [
    "Boa partida.",
    "Respira entre uma partida e outra.",
    "Lembra de beber água.",
    "Joga com calma, sem tilt.",
  ],
};

function sessionWork() {
  if (state.mode === "pomodoro") return "normal";
  const [deep, gaming] =
    state.mode === "timer"
      ? [state.timerDeepWork, state.timerGaming]
      : [state.stopwatchDeepWork, state.stopwatchGaming];
  return gaming ? "gaming" : deep ? "deep" : "normal";
}

function updateMessage() {
  if (state.starts === lastStart) return;
  lastStart = state.starts;
  const pool =
    sessionWork() === "gaming"
      ? messages.gaming
      : state.mode === "pomodoro" && state.phase !== "focus"
        ? messages.rest
        : messages.focus;
  const message = pool[messageIndex++ % pool.length];
  const subtitle = $("#subtitle");
  window.clearTimeout(messageTimeout);
  subtitle.classList.add("fading");
  messageTimeout = window.setTimeout(() => {
    subtitle.textContent = message;
    subtitle.classList.remove("fading");
  }, 220);
}

$("#app").innerHTML = layout;

function notify(message: string) {
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  window.setTimeout(() => $("#toast").classList.remove("visible"), 4500);
}

function format(seconds: number, stopwatch = false) {
  const total = stopwatch ? Math.floor(seconds) : Math.ceil(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor(total / 60) % 60;
  const s = total % 60;
  return `${h ? `${String(h).padStart(2, "0")}:` : ""}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const clockTime = (date: Date) =>
  date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function updateTimerUntilPreview() {
  const data = new FormData($<HTMLFormElement>("#timer-until-form"));
  const now = new Date();
  const end = new Date(now);
  end.setHours(Number(data.get("hours")), Number(data.get("minutes")), 0, 0);
  if (end <= now) end.setDate(end.getDate() + 1);
  const totalMinutes = Math.ceil((+end - +now) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const duration = hours
    ? `${hours}h${minutes ? ` ${minutes}min` : ""}`
    : `${minutes}min`;
  $("#timer-until-preview").textContent =
    `Em ${duration}${end.toDateString() !== now.toDateString() ? " · amanhã" : ""}`;
}

function chime() {
  if (!state.settings.sound) return;
  if (sessionWork() === "gaming") bubbleCompletedSound(state.settings.volume);
  else completedSound(state.settings.volume);
}

function render() {
  const c = state.clocks[state.mode];
  const work = sessionWork();
  const gaming =
    work === "gaming" &&
    c.started &&
    (state.mode === "stopwatch" || state.seconds > 0);
  const dark =
    !gaming &&
    state.mode !== "stopwatch" &&
    c.started &&
    (state.mode === "timer" ? state.seconds > 0 : state.phase === "focus");
  const run = `${state.mode}:${c.running}`;
  if (c.running && lastRun === `${state.mode}:false` && state.settings.sound) {
    if (work === "gaming") bubbleBurstSound(state.settings.volume);
    else if (work === "deep" || (state.mode === "pomodoro" && state.phase === "focus"))
      deepWorkSound(state.settings.volume);
  }
  lastRun = run;
  document.body.dataset.work = alarmsOpen ? "normal" : work;
  document.body.classList.toggle("dark", dark);
  document.body.classList.toggle("gaming", gaming);
  const ambience =
    gaming && c.running && state.settings.sound ? String(state.settings.volume) : "";
  if (ambience !== ambienceKey) {
    ambienceKey = ambience;
    setBubbleAmbience(ambience ? state.settings.volume : 0);
  }
  document.body.classList.toggle("compact", state.compact);
  $("#history").hidden = !historyOpen;
  $("#alarms").hidden = !alarmsOpen;
  $(".clock").hidden = historyOpen || alarmsOpen;
  $('[data-action="history"]').classList.toggle("active", historyOpen);
  $('[data-action="history"]').setAttribute(
    "aria-pressed",
    String(historyOpen),
  );
  $('[data-action="alarms"]').classList.toggle("active", alarmsOpen);
  $('[data-action="alarms"]').setAttribute("aria-pressed", String(alarmsOpen));
  const phase =
    state.mode === "pomodoro"
      ? { focus: "Foco", short: "Pausa curta", long: "Pausa longa" }[
          state.phase
        ] || "Foco"
      : state.mode === "timer"
        ? { deep: "Deep Work", gaming: "Gaming", normal: "Timer" }[work]
        : { deep: "Deep Work", gaming: "Gaming", normal: "Stopwatch" }[work];
  $("#phase").textContent =
    state.mode === "pomodoro"
      ? `${state.round}/${state.settings.rounds}`
      : phase;
  const time = format(state.seconds, state.mode === "stopwatch");
  $("#time").textContent = time;
  $<HTMLButtonElement>("#time").disabled = state.mode === "stopwatch";
  $("#mini-time").textContent = time;
  $("#time").classList.toggle("hours", time.length > 5);
  const timerEnd = state.timerEndsAt ? new Date(state.timerEndsAt) : null;
  $("#timer-end").hidden = historyOpen || alarmsOpen || state.mode !== "timer";
  $("#timer-end-label").textContent = timerEnd
    ? `Toca às ${clockTime(timerEnd)}${timerEnd.toDateString() !== new Date().toDateString() ? " · amanhã" : ""}`
    : "Definir horário";
  $("#timer-end").title = state.clocks.timer.running
    ? "Escolher o horário para tocar"
    : "Horário previsto ao iniciar ou continuar";
  if ($<HTMLDialogElement>("#timer-until-dialog").open) updateTimerUntilPreview();
  $("#mini-phase").textContent =
    state.mode === "pomodoro"
      ? `${state.round}/${state.settings.rounds}`
      : phase;
  $("#mini-toggle").innerHTML = icon(c.running ? "pause" : "play");
  $('[data-action="pin"]').classList.toggle("active", state.pinned);
  $('[data-action="pin"]').setAttribute("aria-pressed", String(state.pinned));
  updateMessage();
  $(".progress span").style.width = `${state.progress * 100}%`;
  const label = c.running
    ? "Pausar"
    : c.started && state.seconds > 0
      ? "Continuar"
      : "INICIAR";
  $("#toggle").innerHTML =
    `${icon(c.running ? "pause" : "play")}<span>${label}</span>`;
  $('[data-action="skip"]').style.visibility =
    state.mode === "pomodoro" ? "visible" : "hidden";
  $("#rounds").innerHTML =
    state.mode === "pomodoro"
      ? Array.from(
          { length: state.settings.rounds },
          (_, i) =>
            `<span class="${i < state.round - 1 || (i === state.round - 1 && state.phase !== "focus") ? "complete" : i === state.round - 1 ? "current" : ""}"></span>`,
        ).join("")
      : "";
  document.querySelectorAll<HTMLElement>("[data-mode]").forEach((el) => {
    el.classList.toggle(
      "active",
      !historyOpen && !alarmsOpen && el.dataset.mode === state.mode,
    );
    el.setAttribute(
      "aria-pressed",
      String(!historyOpen && !alarmsOpen && el.dataset.mode === state.mode),
    );
  });
  $("#pomodoro-settings").hidden = historyOpen || alarmsOpen || state.mode !== "pomodoro";
  renderPomodoroSettings();
  $("#timer-options").hidden = historyOpen || alarmsOpen || state.mode !== "timer";
  $("#session-options").hidden = historyOpen || alarmsOpen || state.mode === "pomodoro";
  document.querySelectorAll<HTMLElement>("[data-work]").forEach((el) => {
    el.classList.toggle("active", el.dataset.work === work);
    el.setAttribute("aria-checked", String(el.dataset.work === work));
  });
  $("#stopwatch-note").hidden = historyOpen || alarmsOpen || state.mode !== "stopwatch";
  document
    .querySelectorAll<HTMLElement>("[data-seconds]")
    .forEach((el) =>
      el.classList.toggle(
        "active",
        Number(el.dataset.seconds) === state.clocks.timer.duration,
      ),
    );
  const counting =
    c.running && (state.mode === "pomodoro" ? state.phase === "focus" : work === "deep");
  const key = JSON.stringify([
    state.tasks,
    state.selected,
    counting,
    Object.entries(state.taskSeconds ?? {}).map(([id, seconds]) => [id, Math.floor(seconds / 60)]),
  ]);
  if (key !== taskKey) {
    taskKey = key;
    renderTasks(counting);
  }
  renderAlarms();
  const ringing = $<HTMLDialogElement>("#alarm-ringing");
  const alarmKey = state.activeAlarm
    ? `${state.activeAlarm.id}:${state.activeAlarm.lastFired}` : "";
  if (alarmKey !== activeAlarmKey) {
    activeAlarmKey = alarmKey;
    stopAlarmSound();
    if (state.activeAlarm) {
      $("#ringing-time").textContent = state.activeAlarm.time;
      startAlarmSound(state.activeAlarm);
      if (!ringing.open) ringing.showModal();
      if (state.compact && !alarmExpanding) {
        alarmExpanding = true;
        void api.Compact().then(refresh).catch(() => notify("Não foi possível ampliar a janela.")).finally(() => { alarmExpanding = false; });
      }
    } else if (ringing.open) ringing.close();
  }
  if (state.bell !== lastBell) {
    lastBell = state.bell;
    chime();
    notify(
      state.mode === "pomodoro"
        ? `Hora de ${phase.toLowerCase()}.`
        : "Timer concluído.",
    );
  }
}

function renderAlarms() {
  const list = $("#alarm-list");
  $("#alarm-count").textContent = String(state.alarms.length);
  const key = JSON.stringify(state.alarms);
  if (list.dataset.key === key) return;
  list.dataset.key = key;
  const names: Record<Alarm["sound"], string> = {
    alerta: "Alerta", sirene: "Sirene", campainha: "Campainha", random: "Random",
  };
  list.innerHTML = state.alarms.length
    ? [...state.alarms].sort((a, b) => a.time.localeCompare(b.time)).map((alarm) =>
      `<div class="alarm-item" data-alarm-id="${escape(alarm.id)}"><span>${escape(alarm.time)}<small>${names[alarm.sound]} · ${alarm.repeat ? "repete até desativar" : "toca uma vez"}${alarm.removeAfter ? " · remove após tocar" : " · diário"}</small></span><button class="icon" data-action="remove-alarm" aria-label="Remover despertador das ${escape(alarm.time)}" title="Remover">${icon("trash")}</button></div>`
    ).join("")
    : '<p class="alarm-empty">Nenhum despertador adicionado.</p>';
}

function trackedLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}min`;
}

function renderPomodoroSettings() {
  const key = JSON.stringify(state.settings);
  if (key === settingsKey) return;
  settingsKey = key;
  const form = $<HTMLFormElement>("#pomodoro-form");
  for (const [name, value] of Object.entries(state.settings)) {
    const input = form.elements.namedItem(name) as HTMLInputElement | null;
    if (!input || input === document.activeElement) continue;
    if (typeof value === "boolean") input.checked = value;
    else input.value = String(value);
  }
}

function renderTasks(counting: boolean) {
  const selected = state.tasks.find((t) => t.id === state.selected);
  $("#task-hint").textContent = !selected
    ? "Selecione uma tarefa para contar o tempo de foco."
    : counting
      ? "Contando o foco agora."
      : "O tempo conta no foco do Pomodoro ou no Deep Work.";
  $("#task-hint").classList.toggle("counting", !!selected && counting);
  $("#task-count").textContent =
    `${state.tasks.filter((t) => t.done).length}/${state.tasks.length}`;
  $("#task-list").innerHTML = state.tasks.length
    ? state.tasks
        .map(
          (t) =>
            `<div class="task ${t.done ? "done" : ""} ${t.id === state.selected ? "selected" : ""}" data-id="${escape(t.id)}"><button class="checkbox" data-task="done" aria-label="${t.done ? "Reabrir" : "Concluir"} tarefa" aria-pressed="${t.done}">${t.done ? icon("check") : ""}</button><button class="task-title" data-task="select" title="${t.id === state.selected ? "Parar de contar nesta tarefa" : "Contar o foco nesta tarefa"}" aria-pressed="${t.id === state.selected}" ${t.done ? "disabled" : ""}>${escape(t.title)}<small>${t.id === state.selected && counting ? '<i class="live"></i>' : ""}${trackedLabel(state.taskSeconds?.[t.id] ?? 0)} de foco</small></button><div class="task-actions"><button class="icon" data-task="up" aria-label="Mover para cima">${icon("up")}</button><button class="icon" data-task="edit" aria-label="Editar tarefa">${icon("edit")}</button><button class="icon" data-task="delete" aria-label="Excluir tarefa">${icon("trash")}</button></div></div>`,
        )
        .join("")
    : '<p class="task-empty">Nenhuma tarefa ainda.</p>';
}

async function refresh() {
  state = await api.State();
  render();
  if (state.warning && state.warning !== lastWarning) notify(state.warning);
  lastWarning = state.warning;
}
async function run(operation: () => Promise<void>) {
  if (busy) return;
  busy = true;
  try {
    await operation();
    await refresh();
  } catch (error) {
    notify(String(error));
  } finally {
    busy = false;
  }
}
const command = (action: string, value = "", seconds = 0) =>
  run(() => api.Command(action, value, seconds));

document.addEventListener("click", async (event) => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "button",
  );
  if (!target || target.disabled || !state) return;
  unlockAudio();
  if (document.body.classList.contains("gaming")) bubbleClickSound(state.settings.volume);
  else clickSound(state.settings.volume);
  if (target.dataset.mode) {
    historyOpen = false;
    alarmsOpen = false;
    await command("mode", target.dataset.mode);
    return;
  }
  if (target.dataset.seconds) {
    await command("timer", "", Number(target.dataset.seconds));
    return;
  }
  const action =
    target.dataset.action;
  if (action === "time-picker" && state.mode === "pomodoro") {
    $<HTMLInputElement>('#pomodoro-form [name="focus"]').focus();
    return;
  }
  if (action === "history") {
    historyOpen = true;
    alarmsOpen = false;
    render();
    await refreshHistory();
    return;
  }
  if (action === "alarms") {
    historyOpen = false;
    alarmsOpen = true;
    render();
    return;
  }
  if (action === "session-work") {
    if (target.dataset.work === sessionWork()) return;
    await command(`${state.mode}-work`, target.dataset.work);
    return;
  }
  if (action === "compact") { historyOpen = false; alarmsOpen = false; }
  if (action === "preview-alarm") {
    window.clearTimeout(previewTimeout);
    const form = $<HTMLFormElement>("#alarm-form");
    const data = new FormData(form);
    startAlarmSound({ id: "preview", time: "", sound: String(data.get("sound")) as Alarm["sound"], volume: Number(data.get("volume")), repeat: false, removeAfter: false, lastFired: "" });
    previewTimeout = window.setTimeout(stopAlarmSound, 2500);
    return;
  }
  if (action === "dismiss-alarm") { await run(() => api.DismissAlarm()); return; }
  if (action === "remove-alarm") {
    await run(() => api.RemoveAlarm(target.closest<HTMLElement>("[data-alarm-id]")!.dataset.alarmId!));
    return;
  }
  if (action === "timer-until") {
    if (state.mode !== "timer") return;
    const end = state.timerEndsAt
      ? new Date(state.timerEndsAt)
      : new Date(Date.now() + state.clocks.timer.duration * 1000);
    const form = $<HTMLFormElement>("#timer-until-form");
    (form.elements.namedItem("hours") as HTMLSelectElement).value = String(end.getHours()).padStart(2, "0");
    (form.elements.namedItem("minutes") as HTMLSelectElement).value = String(end.getMinutes()).padStart(2, "0");
    updateTimerUntilPreview();
    $<HTMLDialogElement>("#timer-until-dialog").showModal();
    return;
  }
  if (action === "close-timer-until") {
    $<HTMLDialogElement>("#timer-until-dialog").close();
    return;
  }
  if (action === "time-picker") {
    if (state.mode === "stopwatch") return;
    const seconds = Math.round(state.clocks[state.mode].duration);
    const form = $<HTMLFormElement>("#time-form");
    form.dataset.mode = state.mode;
    form.dataset.phase = state.phase;
    for (const [name, value] of Object.entries({
      hours: Math.floor(seconds / 3600),
      minutes: Math.floor(seconds / 60) % 60,
      seconds: seconds % 60,
    })) {
      (form.elements.namedItem(name) as HTMLSelectElement).value =
        String(value);
    }
    $<HTMLDialogElement>("#time-dialog").showModal();
  } else if (action === "close-time") {
    $<HTMLDialogElement>("#time-dialog").close();
  } else if (action === "settings") {
    const form = $<HTMLFormElement>("#settings-form");
    for (const [name, value] of Object.entries(state.settings)) {
      const input = form.elements.namedItem(name) as HTMLInputElement | null;
      if (!input) continue;
      if (typeof value === "boolean") input.checked = value;
      else input.value = String(value);
    }
    $<HTMLDialogElement>("#settings").showModal();
  } else if (action === "close-settings") {
    event.preventDefault();
    $<HTMLDialogElement>("#settings").close();
  } else if (action === "close-edit")
    $<HTMLDialogElement>("#edit-dialog").close();
  else if (action === "compact") await run(() => api.Compact());
  else if (action === "pin") await run(() => api.Pin());
  else if (action === "minimize") await api.Minimize();
  else if (action === "quit") await api.Quit();
  else if (action) await command(action);
  const taskAction = target.dataset.task;
  if (!taskAction) return;
  const id = target.closest<HTMLElement>("[data-id]")!.dataset.id!;
  const tasks = structuredClone(state.tasks),
    index = tasks.findIndex((t) => t.id === id),
    task = tasks[index];
  if (taskAction === "select") {
    await command("select", state.selected === id ? "" : id);
    return;
  }
  if (taskAction === "edit") {
    const form = $<HTMLFormElement>("#edit-task");
    form.dataset.id = id;
    (form.elements.namedItem("title") as HTMLInputElement).value = task.title;
    $<HTMLDialogElement>("#edit-dialog").showModal();
    return;
  }
  if (taskAction === "done") task.done = !task.done;
  if (taskAction === "delete") tasks.splice(index, 1);
  if (taskAction === "up" && index > 0)
    [tasks[index - 1], tasks[index]] = [tasks[index], tasks[index - 1]];
  await run(() => api.SaveTasks(tasks));
});

$("#alarm-ringing").addEventListener("cancel", (event) => event.preventDefault());
$("#alarm-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  const data = new FormData(form);
  const alarm: Alarm = {
    id: crypto.randomUUID(),
    time: `${data.get("hours")}:${data.get("minutes")}`,
    sound: String(data.get("sound")) as Alarm["sound"],
    volume: Number(data.get("volume")),
    repeat: data.has("repeat"),
    removeAfter: data.has("removeAfter"),
    lastFired: "",
  };
  void run(async () => {
    await api.AddAlarm(alarm);
    form.reset();
    (form.elements.namedItem("hours") as HTMLSelectElement).value = alarm.time.slice(0, 2);
    (form.elements.namedItem("minutes") as HTMLSelectElement).value = alarm.time.slice(3);
  });
});

$("#add-task").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target as HTMLFormElement,
    data = new FormData(form);
  const title = String(data.get("title")).trim();
  if (!title) return;
  void run(async () => {
    await api.SaveTasks([
      ...state.tasks,
      {
        id: crypto.randomUUID(),
        title,
        done: false,
      },
    ]);
    form.reset();
  });
});
$("#edit-task").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target as HTMLFormElement,
    data = new FormData(form);
  void run(async () => {
    await api.SaveTasks(
      state.tasks.map((t) =>
        t.id === form.dataset.id
          ? {
              ...t,
              title: String(data.get("title")),
            }
          : t,
      ),
    );
    $<HTMLDialogElement>("#edit-dialog").close();
  });
});
function readSettings(form: HTMLFormElement) {
  const settings = { ...state.settings };
  for (const key of Object.keys(settings) as (keyof Settings)[]) {
    const input = form.elements.namedItem(key) as HTMLInputElement | null;
    if (!input) continue;
    Object.assign(settings, {
      [key]: input.type === "checkbox" ? input.checked : Number(input.value),
    });
  }
  return settings;
}
$("#settings-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const settings = readSettings(event.target as HTMLFormElement);
  void run(async () => {
    await api.Configure(settings);
    $<HTMLDialogElement>("#settings").close();
  });
});
$("#pomodoro-form").addEventListener("submit", (event) => event.preventDefault());
$("#pomodoro-form").addEventListener("change", () => {
  const settings = readSettings($<HTMLFormElement>("#pomodoro-form"));
  settingsKey = "";
  void run(() => api.Configure(settings)).finally(() => {
    settingsKey = "";
    if (state) renderPomodoroSettings();
  });
});
$("#time-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  const data = new FormData(form);
  const seconds =
    Number(data.get("hours")) * 3600 +
    Number(data.get("minutes")) * 60 +
    Number(data.get("seconds"));
  void run(async () => {
    await api.Command(
      "duration",
      `${form.dataset.mode}:${form.dataset.phase}`,
      seconds,
    );
    $<HTMLDialogElement>("#time-dialog").close();
  });
});
$("#timer-until-form").addEventListener("input", updateTimerUntilPreview);
$("#timer-until-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.target as HTMLFormElement);
  void run(async () => {
    await api.Command("timer-until", `${data.get("hours")}:${data.get("minutes")}`, 0);
    $<HTMLDialogElement>("#timer-until-dialog").close();
  });
});
document.addEventListener("keydown", (event) => {
  if (
    event.code !== "Space" ||
    (event.target as HTMLElement).closest("input,button,dialog") ||
    !state || historyOpen || alarmsOpen || !!state.activeAlarm
  )
    return;
  event.preventDefault();
  void command("toggle");
});

async function start() {
  if (!window.go?.main.App) {
    $("#subtitle").textContent = "Abra pelo aplicativo Windows para iniciar.";
    return;
  }
  api = window.go.main.App;
  refreshHistory = setupHistory(api);
  await refresh();
  window.setInterval(() => {
    if (!busy) void refresh().catch(() => {});
  }, 250);
}
void start().catch((error) => notify(String(error)));
