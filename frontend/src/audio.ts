import type { Alarm } from "./types";

let context: AudioContext | undefined;
let alarmBus: GainNode | undefined;
let alarmInterval = 0;

function ready() {
  context ??= new AudioContext();
  void context.resume();
  return context;
}

function note(
  frequency: number,
  start: number,
  duration: number,
  volume: number,
  output: AudioNode,
  wave: OscillatorType = "sine",
  endFrequency?: number,
  sustain = false,
) {
  const audio = ready();
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (endFrequency) oscillator.frequency.linearRampToValueAtTime(endFrequency, start + duration * 0.85);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), start + 0.02);
  if (sustain) gain.gain.setValueAtTime(Math.max(0.0001, volume), start + duration * 0.7);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(output);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.01);
}

export function unlockAudio() {
  ready();
}

export function clickSound(volume: number) {
  if (volume <= 0) return;
  const audio = ready();
  note(620, audio.currentTime, 0.065, volume * 0.055, audio.destination);
  note(920, audio.currentTime + 0.025, 0.075, volume * 0.025, audio.destination);
}

export function completedSound(volume: number) {
  if (volume <= 0) return;
  const audio = ready();
  for (let repeat = 0; repeat < 3; repeat++) {
    const start = audio.currentTime + repeat * 0.85;
    note(660, start, 0.46, volume * 0.17, audio.destination);
    note(880, start + 0.24, 0.57, volume * 0.18, audio.destination);
  }
}

const alarmSounds = ["alerta", "sirene", "campainha"] as const;

export function stopAlarmSound() {
  window.clearInterval(alarmInterval);
  alarmInterval = 0;
  if (alarmBus && context) {
    alarmBus.gain.cancelScheduledValues(context.currentTime);
    alarmBus.gain.setValueAtTime(alarmBus.gain.value, context.currentTime);
    alarmBus.gain.linearRampToValueAtTime(0, context.currentTime + 0.04);
  }
  alarmBus = undefined;
}

export function startAlarmSound(alarm: Alarm) {
  stopAlarmSound();
  if (alarm.volume <= 0) return;
  const audio = ready();
  const bus = audio.createGain();
  bus.gain.value = 1;
  bus.connect(audio.destination);
  alarmBus = bus;
  const sound = alarm.sound === "random"
    ? alarmSounds[Math.floor(Math.random() * alarmSounds.length)]
    : alarm.sound;
  const play = () => {
    const start = audio.currentTime + 0.04;
    if (sound === "sirene") {
      for (const offset of [0, 0.9]) {
        note(620, start + offset, 0.78, alarm.volume * 0.42, bus, "sawtooth", 1120, true);
        note(310, start + offset, 0.78, alarm.volume * 0.11, bus, "square", 560, true);
      }
    } else if (sound === "campainha") {
      for (const offset of [0, 0.35, 1.05, 1.4]) {
        note(880, start + offset, 0.48, alarm.volume * 0.4, bus, "sawtooth");
        note(1320, start + offset, 0.42, alarm.volume * 0.19, bus);
      }
    } else {
      [0, 0.23, 0.46, 1.02, 1.25, 1.48].forEach((offset, index) => {
        note(index % 3 === 2 ? 1040 : 880, start + offset, 0.19, alarm.volume * 0.48, bus, "square", undefined, true);
        note(440, start + offset, 0.19, alarm.volume * 0.12, bus, "sine", undefined, true);
      });
    }
  };
  play();
  if (alarm.repeat) alarmInterval = window.setInterval(play, 2500);
}

let bubbleTimeout = 0;

function bubble(start: number, volume: number, pitch = 300 + Math.random() * 380) {
  const audio = ready();
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const length = 0.05 + Math.random() * 0.07;
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(pitch, start);
  oscillator.frequency.exponentialRampToValueAtTime(pitch * (2.2 + Math.random()), start + length);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + length + 0.01);
}

function splash(start: number, volume: number) {
  const audio = ready();
  const buffer = audio.createBuffer(1, Math.floor(audio.sampleRate * 0.5), audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const source = audio.createBufferSource();
  const filter = audio.createBiquadFilter();
  const gain = audio.createGain();
  source.buffer = buffer;
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(1800, start);
  filter.frequency.exponentialRampToValueAtTime(500, start + 0.45);
  filter.Q.value = 0.8;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), start + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.48);
  source.connect(filter).connect(gain).connect(audio.destination);
  source.start(start);
}

export function bubbleClickSound(volume: number) {
  if (volume <= 0) return;
  bubble(ready().currentTime, volume * 0.16, 420 + Math.random() * 160);
}

export function bubbleBurstSound(volume: number) {
  if (volume <= 0) return;
  const now = ready().currentTime;
  splash(now, volume * 0.07);
  for (let i = 0; i < 9; i++) bubble(now + 0.05 + Math.random() * 0.7, volume * (0.08 + Math.random() * 0.08));
}

export function bubbleCompletedSound(volume: number) {
  if (volume <= 0) return;
  const audio = ready();
  for (let repeat = 0; repeat < 3; repeat++) {
    const start = audio.currentTime + repeat * 0.85;
    splash(start, volume * 0.06);
    note(587, start, 0.4, volume * 0.12, audio.destination);
    note(880, start + 0.2, 0.5, volume * 0.13, audio.destination);
    for (let i = 0; i < 5; i++) bubble(start + 0.05 + Math.random() * 0.55, volume * 0.13);
  }
}

export function setBubbleAmbience(volume: number) {
  window.clearTimeout(bubbleTimeout);
  bubbleTimeout = 0;
  if (volume <= 0) return;
  const play = () => {
    const now = ready().currentTime;
    const count = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) bubble(now + i * (0.08 + Math.random() * 0.12), volume * 0.05, 240 + Math.random() * 260);
    bubbleTimeout = window.setTimeout(play, 3500 + Math.random() * 6500);
  };
  bubbleTimeout = window.setTimeout(play, 1500);
}

export function deepWorkSound(volume: number) {
  if (volume <= 0) return;
  const audio = ready();
  const start = audio.currentTime + 0.02;
  const bus = audio.createGain();
  const filter = audio.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(400, start);
  filter.frequency.exponentialRampToValueAtTime(3200, start + 0.7);
  bus.connect(filter).connect(audio.destination);
  const buffer = audio.createBuffer(1, Math.floor(audio.sampleRate * 0.9), audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = audio.createBufferSource();
  const whoosh = audio.createGain();
  noise.buffer = buffer;
  whoosh.gain.setValueAtTime(0.0001, start);
  whoosh.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * 0.05), start + 0.35);
  whoosh.gain.exponentialRampToValueAtTime(0.0001, start + 0.85);
  noise.connect(whoosh).connect(bus);
  noise.start(start);
  note(110, start, 1.1, volume * 0.16, bus, "triangle", 220);
  note(440, start + 0.18, 1.3, volume * 0.09, bus);
  note(659, start + 0.3, 1.4, volume * 0.08, bus);
  note(988, start + 0.45, 1.5, volume * 0.05, bus);
}
