// Real-Time WebSocket Connection & Audio Alarms Hook
// -------------------------------------------------------------
// This hook handles:
// 1. Connecting to the backend Ingestion Server (Port 3001).
// 2. Receiving live feeder updates, customer order status, and reload events.
// 3. Synthesizing two distinct, continuous acoustic alarms using the Web Audio API:
//    - Low Stock Warning: Gentle pleasant two-tone chime (640 Hz -> 580 Hz, gain ~0.20, repeats every 2.6s).
//    - Completely Empty: Very loud, urgent emergency siren (1150 Hz <-> 850 Hz, high gain ~0.88-0.90, repeats rapidly every 850ms).
//    - Replenishment: Completely silent, immediately stops any running alarms.

import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useSmtStore } from '../store/useSmtStore';
import type { SmtComponent, SmtLine, ReplenishmentEvent } from '../types';

const SOCKET_URL = 'http://localhost:3001';

export function useSmtSocket() {
  const updateComponentsBatch = useSmtStore((state) => state.updateComponentsBatch);
  const updateLines = useSmtStore((state) => state.updateLines);
  const addReplenishmentEvent = useSmtStore((state) => state.addReplenishmentEvent);
  const setReplenishmentHistory = useSmtStore((state) => state.setReplenishmentHistory);
  const soundAlertEnabled = useSmtStore((state) => state.soundAlertEnabled);
  const setActiveHeaderAlert = useSmtStore((state) => state.setActiveHeaderAlert);
  const activeLineId = useSmtStore((state) => state.activeLineId);

  const socketRef = useRef<Socket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Audio interval timers to keep repeating alarm sounds until resolved
  const warningIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const exhaustedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Remembers if an alarm is currently playing so we don't restart it unnecessarily
  const isWarningAlarmPlayingRef = useRef<boolean>(false);
  const isExhaustedAlarmPlayingRef = useRef<boolean>(false);

  // Gets or creates the browser's AudioContext (handles browser autoplay policies)
  const getAudioContext = () => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        audioCtxRef.current = new AudioCtx();
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  };

  // Plays a single pleasant two-tone warning chime (Threshold reached)
  const playThresholdWarningChime = () => {
    if (!soundAlertEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(640, now);
      osc.frequency.exponentialRampToValueAtTime(580, now + 0.18);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.20, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.36);

      // Second tone pulse
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      const t2 = now + 0.22;

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(740, t2);
      osc2.frequency.exponentialRampToValueAtTime(620, t2 + 0.20);

      gain2.gain.setValueAtTime(0.001, t2);
      gain2.gain.linearRampToValueAtTime(0.22, t2 + 0.03);
      gain2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.38);

      osc2.connect(gain2);
      gain2.connect(ctx.destination);

      osc2.start(t2);
      osc2.stop(t2 + 0.39);
    } catch {
      // Audio might be blocked if user hasn't clicked on the page yet
    }
  };

  // Starts the continuous repeating low-stock warning alarm (repeats every 2.6 seconds)
  const startThresholdWarningAlarm = () => {
    if (isWarningAlarmPlayingRef.current) return;
    isWarningAlarmPlayingRef.current = true;
    playThresholdWarningChime();
    warningIntervalRef.current = setInterval(() => {
      playThresholdWarningChime();
    }, 2600);
  };

  // Stops the low-stock warning alarm
  const stopThresholdWarningAlarm = () => {
    if (warningIntervalRef.current) {
      clearInterval(warningIntervalRef.current);
      warningIntervalRef.current = null;
    }
    isWarningAlarmPlayingRef.current = false;
  };

  // Plays a very loud, urgent emergency klaxon siren (Feeder completely empty / 0 pcs)
  const playExhaustedEmergencySiren = () => {
    if (!soundAlertEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;

      // Primary loud sawtooth horn (sweeps down from 1150 Hz to 850 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(1150, now);
      osc1.frequency.linearRampToValueAtTime(850, now + 0.28);

      gain1.gain.setValueAtTime(0.01, now);
      gain1.gain.linearRampToValueAtTime(0.88, now + 0.02);
      gain1.gain.setValueAtTime(0.85, now + 0.24);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.30);

      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.30);

      // Secondary loud square wave harmonic for high industrial penetration
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'square';
      osc2.frequency.setValueAtTime(575, now);
      osc2.frequency.linearRampToValueAtTime(425, now + 0.28);

      gain2.gain.setValueAtTime(0.01, now);
      gain2.gain.linearRampToValueAtTime(0.50, now + 0.02);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.30);

      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now);
      osc2.stop(now + 0.30);

      // Second siren blast shortly after
      const t2 = now + 0.32;
      const osc3 = ctx.createOscillator();
      const gain3 = ctx.createGain();
      osc3.type = 'sawtooth';
      osc3.frequency.setValueAtTime(1250, t2);
      osc3.frequency.linearRampToValueAtTime(900, t2 + 0.28);

      gain3.gain.setValueAtTime(0.01, t2);
      gain3.gain.linearRampToValueAtTime(0.90, t2 + 0.02);
      gain3.gain.setValueAtTime(0.88, t2 + 0.24);
      gain3.gain.exponentialRampToValueAtTime(0.01, t2 + 0.30);

      osc3.connect(gain3);
      gain3.connect(ctx.destination);
      osc3.start(t2);
      osc3.stop(t2 + 0.30);

      const osc4 = ctx.createOscillator();
      const gain4 = ctx.createGain();
      osc4.type = 'square';
      osc4.frequency.setValueAtTime(625, t2);
      osc4.frequency.linearRampToValueAtTime(450, t2 + 0.28);

      gain4.gain.setValueAtTime(0.01, t2);
      gain4.gain.linearRampToValueAtTime(0.52, t2 + 0.02);
      gain4.gain.exponentialRampToValueAtTime(0.01, t2 + 0.30);

      osc4.connect(gain4);
      gain4.connect(ctx.destination);
      osc4.start(t2);
      osc4.stop(t2 + 0.30);

    } catch {
      // Audio context might be waiting for user interaction
    }
  };

  // Starts the continuous very loud exhausted emergency siren (repeats rapidly every 850ms)
  const startExhaustedEmergencyAlarm = () => {
    // If warning alarm was running, stop it and prioritize the loud exhausted alarm
    stopThresholdWarningAlarm();

    if (isExhaustedAlarmPlayingRef.current) return;
    isExhaustedAlarmPlayingRef.current = true;
    playExhaustedEmergencySiren();
    exhaustedIntervalRef.current = setInterval(() => {
      playExhaustedEmergencySiren();
    }, 850);
  };

  // Stops the exhausted emergency alarm
  const stopExhaustedEmergencyAlarm = () => {
    if (exhaustedIntervalRef.current) {
      clearInterval(exhaustedIntervalRef.current);
      exhaustedIntervalRef.current = null;
    }
    isExhaustedAlarmPlayingRef.current = false;
  };

  // Stops all alarms immediately (e.g. when a feeder is replenished or when audio is muted)
  const stopAllAlarms = () => {
    stopThresholdWarningAlarm();
    stopExhaustedEmergencyAlarm();
  };

  // If user clicks the audio mute button, kill any playing alarms right away
  useEffect(() => {
    if (!soundAlertEnabled) {
      stopAllAlarms();
    }
  }, [soundAlertEnabled]);

  useEffect(() => {
    // Connect to the WebSocket server on port 3001
    const socket = io(SOCKET_URL, {
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    // Receive customer order updates
    socket.on('line_data_update', (lines: SmtLine[]) => {
      updateLines(lines);
    });

    // Receive initial reload history
    socket.on('replenishment_history', (events: ReplenishmentEvent[]) => {
      setReplenishmentHistory(events);
    });

    // Receive feeder stock and time-to-empty updates
    socket.on('inventory_batch_update', (batch: SmtComponent[]) => {
      updateComponentsBatch(batch);

      // Check feeders on the currently viewed SMT line for low stock or empty reels
      const activeLineFeeders = batch.filter(c => c.line_id === activeLineId);

      // Check if any feeder is completely exhausted (0 pcs or <= 10 pcs)
      const exhaustedFeeder = activeLineFeeders.find(c => c.current_quantity <= 10 || c.time_left_seconds === 0);

      // Check if any feeder has dropped below the warning threshold (< 90 seconds remaining)
      const thresholdFeeder = activeLineFeeders.find(c => c.status === 'warning' || c.status === 'critical');

      if (exhaustedFeeder) {
        setActiveHeaderAlert({
          type: 'exhausted',
          feeder_position: exhaustedFeeder.feeder_position,
          part_number: exhaustedFeeder.part_number,
          line_id: exhaustedFeeder.line_id,
          current_quantity: exhaustedFeeder.current_quantity,
          timestamp: Date.now()
        });
        startExhaustedEmergencyAlarm();
      } else if (thresholdFeeder) {
        setActiveHeaderAlert({
          type: 'threshold',
          feeder_position: thresholdFeeder.feeder_position,
          part_number: thresholdFeeder.part_number,
          line_id: thresholdFeeder.line_id,
          time_left_seconds: thresholdFeeder.time_left_seconds,
          current_quantity: thresholdFeeder.current_quantity,
          timestamp: Date.now()
        });
        startThresholdWarningAlarm();
      }
    });

    // When an operator reloads a reel, stop all alarms and show the success banner
    socket.on('replenishment_event', (event: ReplenishmentEvent) => {
      addReplenishmentEvent(event);

      if (event.line_id === activeLineId) {
        stopAllAlarms();
        setActiveHeaderAlert({
          type: 'replenished',
          feeder_position: event.feeder_position,
          part_number: event.part_number,
          line_id: event.line_id,
          replenished_amount: event.replenished_amount,
          timestamp: Date.now()
        });
      }
    });

    // Clean up connections and timers when component unmounts
    return () => {
      stopAllAlarms();
      socket.disconnect();
    };
  }, [activeLineId]);

  return {
    socket: socketRef.current,
    stopAllAlarms
  };
}