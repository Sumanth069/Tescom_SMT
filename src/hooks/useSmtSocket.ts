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
import type { ReplenishmentEvent, SmtComponent, CategoryInventory } from '../types';

const SOCKET_URL = 'http://localhost:3001';

// ─── INDUSTRIAL MULTI-TONE AUDIO ENGINE ───────────────────────────────────────
let globalAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!globalAudioCtx || globalAudioCtx.state === 'closed') {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        globalAudioCtx = new AudioCtxClass();
      }
    }
    if (globalAudioCtx && globalAudioCtx.state === 'suspended') {
      globalAudioCtx.resume();
    }
    return globalAudioCtx;
  } catch {
    return null;
  }
}

/**
 * Sound 1: THRESHOLD WARNING ALARM (Approaching Depletion / Low Stock < 30s)
 * Standard comfortable volume dual-tone chime (640 Hz -> 580 Hz, Gain: ~0.20)
 */
function playThresholdWarningSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Tone 1: 640 Hz (E5) smooth sine wave
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(640, now);
    osc1.frequency.exponentialRampToValueAtTime(540, now + 0.16);
    gain1.gain.setValueAtTime(0.20, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.16);

    // Tone 2: 580 Hz (D5) smooth sine wave after 0.18s
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(580, now + 0.18);
    osc2.frequency.exponentialRampToValueAtTime(480, now + 0.36);
    gain2.gain.setValueAtTime(0.22, now + 0.18);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.18);
    osc2.stop(now + 0.36);
  } catch {
    // Autoplay handling
  }
}

/**
 * Sound 2: VERY VERY LOUD FULLY EXHAUSTED EMERGENCY SIREN (0 Quantity / Line Stop Hazard)
 * High-intensity maximum-gain dual sawtooth & square wave industrial klaxon (Gain: ~0.85 - 0.90).
 */
function playExhaustedAlarmSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Master High-Gain Output Stage
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.88, now);
    masterGain.connect(ctx.destination);

    // High Emergency Pulse 1: 1150 Hz -> 850 Hz piercing sawtooth siren
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(1150, now);
    osc1.frequency.linearRampToValueAtTime(850, now + 0.18);
    gain1.gain.setValueAtTime(0.80, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc1.connect(gain1);
    gain1.connect(masterGain);
    osc1.start(now);
    osc1.stop(now + 0.18);

    // High Emergency Pulse 2: 850 Hz -> 1180 Hz square wave for heavy factory presence
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(850, now + 0.18);
    osc2.frequency.linearRampToValueAtTime(1180, now + 0.38);
    gain2.gain.setValueAtTime(0.85, now + 0.18);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    osc2.connect(gain2);
    gain2.connect(masterGain);
    osc2.start(now + 0.18);
    osc2.stop(now + 0.38);

    // High Emergency Pulse 3: 1250 Hz -> 780 Hz piercing peak siren
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = 'sawtooth';
    osc3.frequency.setValueAtTime(1250, now + 0.38);
    osc3.frequency.linearRampToValueAtTime(780, now + 0.58);
    gain3.gain.setValueAtTime(0.90, now + 0.38);
    gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.58);
    osc3.connect(gain3);
    gain3.connect(masterGain);
    osc3.start(now + 0.38);
    osc3.stop(now + 0.58);
  } catch {
    // Autoplay handling
  }
}

// ─── SMT SOCKET HOOK ─────────────────────────────────────────────────────────
export const useSmtSocket = () => {
  const socketRef = useRef<Socket | null>(null);
  const inventorySocketRef = useRef<Socket | null>(null);
  const previousStateRef = useRef<{ hadExhausted: boolean; hadThreshold: boolean }>({
    hadExhausted: false,
    hadThreshold: false
  });

  const updateInventoryBatch = useSmtStore((state) => state.updateInventoryBatch);
  const updateLineStatus = useSmtStore((state) => state.updateLineStatus);
  const updateLinesData = useSmtStore((state) => state.updateLinesData);
  const addReplenishmentEvent = useSmtStore((state) => state.addReplenishmentEvent);
  const setReplenishmentHistory = useSmtStore((state) => state.setReplenishmentHistory);
  const soundAlertEnabled = useSmtStore((state) => state.soundAlertEnabled);
  const headerAlert = useSmtStore((state) => state.headerAlert);
  const setHeaderAlert = useSmtStore((state) => state.setHeaderAlert);
  const setReelInventory = useSmtStore((state) => state.setReelInventory);
  const updateReelCategory = useSmtStore((state) => state.updateReelCategory);

  // ── DEDICATED CONTINUOUS AUDIO LOOPS FOR THRESHOLD VS EXHAUSTED ─────────────
  useEffect(() => {
    if (!soundAlertEnabled || !headerAlert) return;

    if (headerAlert.type === 'exhausted') {
      // 1. FULLY EXHAUSTED: VERY LOUD rapid emergency siren every 850ms
      playExhaustedAlarmSound();
      const interval = setInterval(() => {
        playExhaustedAlarmSound();
      }, 850);

      return () => clearInterval(interval);
    } else if (headerAlert.type === 'threshold' || headerAlert.type === 'critical') {
      // 2. BELOW THRESHOLD: Standard volume warning chime every 2.6 seconds
      playThresholdWarningSound();
      const interval = setInterval(() => {
        playThresholdWarningSound();
      }, 2600);

      return () => clearInterval(interval);
    }
  }, [headerAlert?.type, headerAlert?.message, soundAlertEnabled]);

  // ── SMT IIOT INGESTION WEBSOCKET (PORT 3001) ──────────────────────────────────
  useEffect(() => {
    // Connect to the WebSocket server on port 3001
    const socket = io(SOCKET_URL, {
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socketRef.current.on('connect', () => {
      socketRef.current?.emit('request_replenishment_history');
    });

    socketRef.current.on('disconnect', () => {
      ['line_1', 'line_2', 'line_3', 'line_4'].forEach(id => updateLineStatus(id, 'offline'));
      setHeaderAlert({
        type: 'warning',
        message: 'Lost connection to backend service',
        timestamp: Date.now()
      });
    });

    // Listen for Component Batch Updates
    socketRef.current.on('inventory_batch_update', (data: SmtComponent[]) => {
      updateInventoryBatch(data);

      let exhaustedCount = 0;
      let lastExhaustedFeeder = '';
      let thresholdCount = 0;
      let lastThresholdFeeder = '';

      data.forEach(comp => {
        const timeLeft = comp.time_left_seconds;
        const isDepleted = comp.current_quantity <= 0 || (typeof timeLeft === 'number' && timeLeft <= 0) || comp.current_quantity <= 25;
        const isThreshold = comp.status === 'critical' || (typeof timeLeft === 'number' && timeLeft <= 30);

        if (isDepleted) {
          exhaustedCount++;
          lastExhaustedFeeder = `${comp.feeder_position} (${comp.part_number})`;
        } else if (isThreshold) {
          thresholdCount++;
          lastThresholdFeeder = `${comp.feeder_position} (${comp.part_number})`;
        }
      });

      // Priority 1: Fully Exhausted Feeder (VERY LOUD Continuous Alarm)
      if (exhaustedCount > 0) {
        const msg = exhaustedCount === 1
          ? `FEEDER EXHAUSTED: ${lastExhaustedFeeder} (0 Parts Left) — MACHINE STOP RISK!`
          : `CRITICAL ALERT: ${exhaustedCount} Feeders FULLY EXHAUSTED (0 Parts Left)!`;

        setHeaderAlert({
          type: 'exhausted',
          message: msg,
          count: exhaustedCount,
          feeder: lastExhaustedFeeder,
          timestamp: Date.now()
        });
      }
      // Priority 2: Reaching Low Threshold (< 30s remaining / Low Stock)
      else if (thresholdCount > 0) {
        const msg = thresholdCount === 1
          ? `LOW STOCK THRESHOLD: ${lastThresholdFeeder} < 30s remaining — Prepare Refill!`
          : `THRESHOLD WARNING: ${thresholdCount} Feeders below threshold (< 30s remaining)!`;

        setHeaderAlert({
          type: 'threshold',
          message: msg,
          count: thresholdCount,
          feeder: lastThresholdFeeder,
          timestamp: Date.now()
        });
      }
      // All replenished / safe
      else if (previousStateRef.current.hadExhausted || previousStateRef.current.hadThreshold) {
        setHeaderAlert(null);
      }

      previousStateRef.current = {
        hadExhausted: exhaustedCount > 0,
        hadThreshold: thresholdCount > 0
      };
    });

    // Listen for ERP / Line Status Updates
    socketRef.current.on('line_data_update', (linesArray: any[]) => {
      updateLinesData(linesArray);
    });

    // Listen for Reel Replenishment Events (Silent without chime, visual banner only)
    socketRef.current.on('replenishment_event', (event: ReplenishmentEvent) => {
      addReplenishmentEvent(event);
      const msg = `REEL REPLENISHED [${event.line_id.toUpperCase()}]: ${event.feeder_position} (${event.part_number}) +${event.replenished_amount.toLocaleString()} parts`;

      setHeaderAlert({
        type: 'info',
        message: msg,
        timestamp: Date.now()
      });
    });

    // Initial replenishment history dump
    socketRef.current.on('replenishment_history', (events: ReplenishmentEvent[]) => {
      setReplenishmentHistory(events);
    });

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, [updateInventoryBatch, updateLineStatus, updateLinesData, addReplenishmentEvent, setReplenishmentHistory, setHeaderAlert, soundAlertEnabled]);

  // ── INVENTORY SERVER WEBSOCKET (PORT 3002) ──────────────────────────────────
  useEffect(() => {
    inventorySocketRef.current = io(INVENTORY_SOCKET_URL);

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