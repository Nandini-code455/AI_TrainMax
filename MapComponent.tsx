// src/components/MapComponent.tsx

import React, { useRef, useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { TrainData, WeatherData } from '../types/types';

// NOTE: your actual Mapbox token
mapboxgl.accessToken =
  'pk.eyJ1IjoiZGlnZXNoOTIiLCJhIjoiY21pM3o5N3d6MHVwMDJqcXI0M3N4MWJxMSJ9.yX4uDG2ZK_uLyUc_Ol_Shg';

interface Props {
  trains: TrainData[];
  weather: WeatherData;
  activeDB: 'india_db' | 'cg_db';
}

// Approximate centers
const INDIA_CENTER: [number, number] = [77.0, 23.0];
const CG_CENTER: [number, number] = [82.0, 21.5];
const BSP_AKALTARA_CENTER: [number, number] = [82.075, 22.07];

const MapComponent: React.FC<Props> = ({ trains, weather, activeDB }) => {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  // 1. Initialize Map (runs once; StrictMode double-run safe)
  useEffect(() => {
    if (mapRef.current || !mapContainer.current) return;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: activeDB === 'cg_db' ? CG_CENTER : INDIA_CENTER,
      zoom: activeDB === 'cg_db' ? 6 : 4,
    });

    mapRef.current = map;

    map.on('load', () => {
      // Source for detailed track section (BSP-Akaltara)
      map.addSource('tracks-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'tracks-layer',
        type: 'line',
        source: 'tracks-source',
        paint: {
          'line-width': 4,
          'line-color': [
            'match',
            ['get', 'track'],
            1,
            '#4F46E5',
            2,
            '#F97316',
            3,
            '#10B981',
            '#666666',
          ],
        },
      });

      // Trains source
      map.addSource('trains-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'trains-layer',
        type: 'circle',
        source: 'trains-source',
        paint: {
          'circle-radius': 8,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
          'circle-color': [
            'match',
            ['get', 'priority'],
            'High (🟢)',
            '#34D399',
            'Medium (🟡)',
            '#FBBF24',
            '#EF4444',
          ],
          'circle-opacity': 1,
        },
      });

      map.addLayer({
        id: 'trains-labels',
        type: 'symbol',
        source: 'trains-source',
        layout: {
          'text-field': ['get', 'train_label'],
          'text-size': 12,
          'text-offset': [0, -1.6],
          'text-anchor': 'bottom',
        },
        paint: {
          'text-color': '#FFFFFF',
          'text-halo-color': '#000000',
          'text-halo-width': 1,
        },
      });

      // Load BSP-Akaltara section from backend
      fetch('/api/map/section/bsp-akaltara')
        .then((res) => res.json())
        .then((data) => {
          const features = (data.features || []).map((f: any) => ({
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: f.coordinates,
            },
            properties: {
              track: f.track || 1,
            },
          }));

          const src = map.getSource('tracks-source') as mapboxgl.GeoJSONSource;
          src.setData({
            type: 'FeatureCollection',
            features,
          });
        })
        .catch((err) =>
          console.error('Failed to load BSP-Akaltara GeoJSON:', err)
        );
    });

    // CLEANUP: destroy map and reset ref
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null; // IMPORTANT: so other effects don't use a destroyed map
      }
    };
  }, []); // we only want to init once

  // 2. Update train markers when data changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let src: mapboxgl.GeoJSONSource | undefined;
    try {
      src = map.getSource('trains-source') as mapboxgl.GeoJSONSource;
    } catch {
      // Source missing / map not ready yet
      return;
    }
    if (!src) return;

    const features: any[] = trains
      .filter((t) => t.current_lat && t.current_lon)
      .map((t) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [t.current_lon, t.current_lat],
        },
        properties: {
          ...t,
          train_label: `${t.train_no} ${t.train_name}`,
        },
      }));

    src.setData({
      type: 'FeatureCollection',
      features,
    });
  }, [trains]);

  // 3. Blink Held trains
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let visible = true;
    const id = window.setInterval(() => {
      const m = mapRef.current;
      if (!m || !m.getLayer('trains-layer')) return;

      const opacityExpr: any = [
        'case',
        ['==', ['get', 'status'], 'Held'],
        visible ? 1 : 0.2,
        1,
      ];

      m.setPaintProperty('trains-layer', 'circle-opacity', opacityExpr);
      visible = !visible;
    }, 500);

    return () => window.clearInterval(id);
  }, []);

  // 4. React to DB change: fly between India / CG
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const center = activeDB === 'cg_db' ? CG_CENTER : INDIA_CENTER;
    const zoom = activeDB === 'cg_db' ? 6 : 4;
    map.flyTo({ center, zoom, essential: true });
  }, [activeDB]);

  // Navigation buttons
  const navigateToIndia = () =>
    mapRef.current?.flyTo({ center: INDIA_CENTER, zoom: 4, essential: true });
  const navigateToCG = () =>
    mapRef.current?.flyTo({ center: CG_CENTER, zoom: 6, essential: true });
  const navigateToBSPSection = () =>
    mapRef.current?.flyTo({
      center: BSP_AKALTARA_CENTER,
      zoom: 12,
      essential: true,
    });

  return (
    <div className="h-full w-full relative">
      <div ref={mapContainer} className="h-full w-full map-container" />

      {/* Map Navigation Controls */}
      <div className="absolute top-4 left-4 z-10 space-y-2 flex flex-col">
        <button
          onClick={navigateToIndia}
          className="p-2 bg-rail-light hover:bg-rail-mid text-white rounded shadow-lg border border-rail-accent/50 text-sm"
        >
          1. India Level
        </button>
        <button
          onClick={navigateToCG}
          className="p-2 bg-rail-light hover:bg-rail-mid text-white rounded shadow-lg border border-rail-accent/50 text-sm"
        >
          2. Chhattisgarh Level
        </button>
        <button
          onClick={navigateToBSPSection}
          className="p-2 bg-rail-light hover:bg-rail-mid text-white rounded shadow-lg border border-rail-accent text-sm"
        >
          3. BSP-Akaltara Section
        </button>
      </div>

      {/* Weather Icon */}
      <div
        className={`absolute top-4 right-4 z-10 p-3 bg-rail-light rounded-full shadow-xl text-3xl border-2 transition-colors duration-300
          ${
            weather.alert_level === 'RED'
              ? 'text-priority-low border-priority-low'
              : weather.alert_level === 'YELLOW'
              ? 'text-priority-medium border-priority-medium'
              : 'text-priority-high border-priority-high'
          }`}
      >
        <span role="img" aria-label={weather.current_condition}>
          {weather.icon}
        </span>
      </div>
    </div>
  );
};

export default MapComponent;
