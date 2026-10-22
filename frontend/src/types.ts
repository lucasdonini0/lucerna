export type Mode = "pomodoro" | "timer" | "stopwatch";
export type Settings = {
  focus: number;
  short: number;
  long: number;
  rounds: number;
  autoBreak: boolean;
  autoFocus: boolean;
  sound: boolean;
  volume: number;
};
export type Task = {
  id: string;
  title: string;
  done: boolean;
};
export type Alarm = {
  id: string;
  time: string;
  sound: "alerta" | "sirene" | "campainha" | "random";
  volume: number;
  repeat: boolean;
  removeAfter: boolean;
  lastFired: string;
};
export type State = {
  settings: Settings;
  tasks: Task[];
  selected: string;
  mode: Mode;
  timerDeepWork: boolean;
  stopwatchDeepWork: boolean;
  timerGaming: boolean;
  stopwatchGaming: boolean;
  phase: string;
  round: number;
  seconds: number;
  timerEndsAt: string | null;
  taskSeconds: Record<string, number>;
  progress: number;
  bell: number;
  starts: number;
  compact: boolean;
  pinned: boolean;
  warning: string;
  alarms: Alarm[];
  activeAlarm: Alarm | null;
  clocks: Record<
    Mode,
    { running: boolean; started: boolean; duration: number }
  >;
};
export type API = {
  History(): Promise<Activity[]>;
  State(): Promise<State>;
  Command(action: string, value: string, seconds: number): Promise<void>;
  Configure(settings: Settings): Promise<void>;
  SaveTasks(tasks: Task[]): Promise<void>;
  AddAlarm(alarm: Alarm): Promise<void>;
  RemoveAlarm(id: string): Promise<void>;
  DismissAlarm(): Promise<void>;
  Compact(): Promise<void>;
  Pin(): Promise<void>;
  Minimize(): Promise<void>;
  Quit(): Promise<void>;
};
export type Activity = {
  start: string;
  end: string;
  mode: Mode;
  focus: boolean;
  gaming?: boolean;
  task?: string;
  completed: boolean;
};
declare global {
  interface Window {
    go?: { main: { App: API } };
  }
}
