// src/components/BspAkaltaraSimulation.tsx

import React, { useEffect, useState } from 'react';

type TrainId = 'MEMU_LOCAL' | 'RAJDHANI' | 'JANSHATABDI' | 'UTKAL_EXP';

interface TrainSimState {
  id: TrainId;
  name: string;
  colorClass: string;   // Tailwind bg color
  trackIndex: number;   // 0 -> Track 1, 1 -> Track 2, 2 -> Track 3 (visual only)
}

// Distance model (km)
const TOTAL_DISTANCE = 65; // BSP (0) -> Akaltara (40) -> Champa (65)

// Simulation time: minutes from 12:00
//  0  = 12:00
// 10  = 12:10, etc.

const trainsConfig: TrainSimState[] = [
  {
    id: 'MEMU_LOCAL',
    name: 'MEMU Local (On Time)',
    colorClass: 'bg-emerald-400',
    trackIndex: 0, // Track 1
  },
  {
    id: 'RAJDHANI',
    name: 'Rajdhani Express (+15m)',
    colorClass: 'bg-yellow-400',
    trackIndex: 1, // Track 2
  },
  {
    id: 'JANSHATABDI',
    name: 'Janshatabdi (+30m)',
    colorClass: 'bg-red-400',
    trackIndex: 1, // Track 2 (same line, will show overtake effect)
  },
  {
    id: 'UTKAL_EXP',
    name: 'Utkal Express (+15m)',
    colorClass: 'bg-sky-400',
    trackIndex: 2, // Track 3
  },
];

// Helper: clamp value
const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

/**
 * Calculate position (in KM from BSP) for a train at given sim time
 */
function getPositionKm(trainId: TrainId, tMin: number): number {
  // MEMU Local:
  // 12:00–12:10  -> at BSP (0 km)
  // 12:10–12:50  -> BSP -> Akaltara (0 -> 40 km)
  // 12:50–13:00  -> hold at Akaltara (40 km)
  // 13:00–13:25  -> Akaltara -> Champa (40 -> 65 km)
  if (trainId === 'MEMU_LOCAL') {
    if (tMin < 10) return 0;
    if (tMin < 50) {
      // 40 minutes to cover 40 km -> 1 km/min
      const dt = tMin - 10;
      return clamp(dt, 0, 40);
    }
    if (tMin < 60) return 40;
    if (tMin <= 85) {
      const dt = tMin - 60; // 0–25 min
      return clamp(40 + (dt * 25) / 25, 40, 65);
    }
    return 65;
  }

  // Rajdhani:
  // 12:25–12:30 -> at BSP
  // 12:30–12:50 -> BSP -> Akaltara (0 -> 40 km)
  // 12:50–13:10 -> Akaltara -> Champa (40 -> 65 km), overtakes MEMU past Akaltara
  if (trainId === 'RAJDHANI') {
    if (tMin < 25) return 0;
    if (tMin < 30) return 0; // at BSP
    if (tMin < 50) {
      const dt = tMin - 30; // 0–20 -> 0–40 km
      return clamp((dt * 40) / 20, 0, 40);
    }
    if (tMin <= 70) {
      const dt = tMin - 50; // 0–20 -> 40–65 km
      return clamp(40 + (dt * 25) / 20, 40, 65);
    }
    return 65;
  }

  // Janshatabdi:
  // 12:50–13:00 -> at Champa (65 km)
  // 13:00–13:35 -> Champa -> Akaltara (65 -> 40 km)
  // 13:35–13:45 -> hold at Akaltara (40 km) while Utkal overtakes
  // 13:45–14:15 -> Akaltara -> BSP (40 -> 0 km) [beyond zone]
  if (trainId === 'JANSHATABDI') {
    if (tMin < 50) return 65;
    if (tMin < 60) return 65; // at Champa
    if (tMin < 95) {
      const dt = tMin - 60; // 0–35 -> 65 -> 40 (towards BSP)
      return clamp(65 - (dt * 25) / 35, 40, 65);
    }
    if (tMin < 105) return 40; // hold at Akaltara
    if (tMin <= 135) {
      const dt = tMin - 105; // 0–30 -> 40 -> 0
      return clamp(40 - (dt * 40) / 30, 0, 40);
    }
    return 0;
  }

  // Utkal Express:
  // 13:00–13:05 -> at Champa (65 km)
  // 13:05–13:35 -> Champa -> Akaltara (65 -> 40 km)
  // 13:35 onwards -> ahead of Janshatabdi towards BSP (overtake)
  if (trainId === 'UTKAL_EXP') {
    if (tMin < 60) return 65;
    if (tMin < 65) return 65; // at Champa
    if (tMin < 95) {
      const dt = tMin - 65; // 0–30 -> 65 -> 40
      return clamp(65 - (dt * 25) / 30, 40, 65);
    }
    if (tMin <= 125) {
      const dt = tMin - 95; // 0–30 -> 40 -> 0 (moving ahead)
      return clamp(40 - (dt * 40) / 30, 0, 40);
    }
    return 0;
  }

  return 0;
}

/**
 * BSP–Akaltara–Champa 3-track animated simulation
 */
const BspAkaltaraSimulation: React.FC = () => {
  const [simTime, setSimTime] = useState<number>(0); // minutes since 12:00
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [speed, setSpeed] = useState<number>(5); // simulation minutes per real second

  // Animation loop
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setSimTime((prev) => {
        const next = prev + speed * 0.2; // every 200ms -> 0.2s
        // Loop after 150 minutes
        if (next > 150) return 0;
        return next;
      });
    }, 200);

    return () => clearInterval(interval);
  }, [isPlaying, speed]);

  const startTimeLabel = '12:00';
  const currentClock = (() => {
    const totalMinutes = 12 * 60 + simTime;
    const h = Math.floor(totalMinutes / 60);
    const m = Math.floor(totalMinutes % 60)
      .toString()
      .padStart(2, '0');
    return `${h}:${m}`;
  })();

  return (
    <div className="mt-4 p-4 bg-rail-light rounded-lg shadow-lg border border-gray-700">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-xl font-bold text-rail-accent flex items-center gap-2">
          🚆 BSP–Akaltara Overtake Simulation
        </h2>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-400">Sim Time:</span>
          <span className="text-white font-mono">{currentClock}</span>

          <button
            onClick={() => setIsPlaying((p) => !p)}
            className="ml-3 px-2 py-1 rounded bg-rail-dark border border-rail-accent/60 text-rail-accent hover:bg-rail-mid"
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>

          <button
            onClick={() => setSimTime(0)}
            className="px-2 py-1 rounded bg-rail-dark border border-gray-500 text-gray-300 hover:bg-rail-mid"
          >
            Reset
          </button>

          <div className="ml-3 flex items-center gap-1">
            <span className="text-gray-400">Speed:</span>
            {[1, 5, 10].map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`px-2 py-1 rounded border text-xs ${
                  speed === s
                    ? 'bg-rail-accent text-rail-dark border-rail-accent'
                    : 'bg-rail-dark text-gray-300 border-gray-600 hover:bg-rail-mid'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Station labels */}
      <div className="flex justify-between text-xs text-gray-400 mb-1 px-3">
        <span>BSP (0 km) – {startTimeLabel}</span>
        <span>Akaltara (40 km)</span>
        <span>Champa (65 km)</span>
      </div>

      {/* Track Area */}
      <div className="relative w-full space-y-3 pt-2 pb-1">

        {[0, 1, 2].map((trackIdx) => (
          <div key={trackIdx} className="relative">
            {/* Track line */}
            <div className="h-3 rounded-full bg-rail-mid border border-rail-accent/40" />

            {/* Track label */}
            <span className="absolute -left-2 -top-4 text-[10px] text-gray-300">
              Track {trackIdx + 1}
            </span>

            {/* Trains on this track */}
            {trainsConfig
              .filter((t) => t.trackIndex === trackIdx)
              .map((t) => {
                const km = getPositionKm(t.id, simTime);
                const leftPercent = (km / TOTAL_DISTANCE) * 100;

                return (
                  <div
                    key={t.id}
                    className="absolute -top-3"
                    style={{ left: `${clamp(leftPercent, 0, 100)}%` }}
                  >
                    <div
                      className={`px-2 py-1 rounded-full shadow-lg border border-black/40 text-[10px] text-rail-dark ${t.colorClass}`}
                    >
                      <div className="font-bold">{t.name.split(' ')[0]}</div>
                      <div className="text-[9px]">
                        {t.name.includes('+') ? t.name.split(' ').slice(1).join(' ') : ''}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-gray-300">
        <div>
          <div className="font-semibold text-white mb-1">Scenario Summary</div>
          <ul className="list-disc list-inside space-y-1">
            <li>MEMU Local BSP → Akaltara pe pahle pahuchti, waha hold hoti hai.</li>
            <li>Rajdhani, MEMU ko Akaltara ke baad overtake karti hai.</li>
            <li>Janshatabdi Champa se late, Akaltara pe hold hoti hai.</li>
            <li>Utkal Express Janshatabdi ko Akaltara ke paas overtake karta hai.</li>
          </ul>
        </div>
        <div>
          <div className="font-semibold text-white mb-1">Color Legend</div>
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-400" /> MEMU Local
            </span>
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-yellow-400" /> Rajdhani Express
            </span>
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-400" /> Janshatabdi
            </span>
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-sky-400" /> Utkal Express
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BspAkaltaraSimulation;
