/**
 * Task 8.9-8.14: Leaflet map with interactive markers and controls
 */

"use client";

import { useEffect, useRef, useState } from 'react';
import type { Place } from '@/lib/domain';
import { ArrowsOut, ArrowsIn, Path, MapPin, Target, MagnifyingGlass } from '@phosphor-icons/react';

interface LeafletMapProps {
  points: Place[];
  isDarkTheme: boolean;
  highlightedActivityId?: string | null;
  onMarkerClick?: (placeId: string) => void;
  fullScreen?: boolean;
  onToggleFullScreen?: () => void;
  showRoute?: boolean;
  onToggleRoute?: () => void;
  onAddPlace?: (place: Place) => void;
  className?: string;
}

export function LeafletMap({
  points,
  isDarkTheme,
  highlightedActivityId,
  onMarkerClick,
  fullScreen = false,
  onToggleFullScreen,
  showRoute = true,
  onToggleRoute,
  onAddPlace,
  className = '',
}: LeafletMapProps) {
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const polylineRef = useRef<any>(null);
  const searchMarkerRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [searchResult, setSearchResult] = useState<Place | null>(null);

  // Initialize Leaflet map
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let L: any;
    let map: any;

    const initMap = async () => {
      // Dynamically import Leaflet (client-side only)
      L = (await import('leaflet')).default;
      
      // Fix Leaflet default marker icon paths
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      });

      const container = document.getElementById('leaflet-map-container');
      if (!container) return;

      // Create map
      map = L.map(container, {
        center: [40.7128, -74.0060], // NYC default
        zoom: 13,
        zoomControl: false, // We'll add custom controls
      });

      // Add tile layer — Geoapify map tiles (uses NEXT_PUBLIC_GEOAPIFY_API_KEY)
      const geoKey = process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY ?? '';
      const tileStyle = isDarkTheme ? 'dark-matter' : 'osm-bright';
      const tileUrl = `https://maps.geoapify.com/v1/tile/${tileStyle}/{z}/{x}/{y}.png?apiKey=${geoKey}`;

      L.tileLayer(tileUrl, {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://www.geoapify.com/">Geoapify</a>',
        maxZoom: 20,
      }).addTo(map);

      mapRef.current = map;
      setMapReady(true);
    };

    initMap();

    return () => {
      if (map) {
        map.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update map theme (Task 8.13)
  useEffect(() => {
    if (!mapReady || !mapRef.current || typeof window === 'undefined') return;

    const updateTheme = async () => {
      const L = (await import('leaflet')).default;
      const map = mapRef.current;

      // Remove existing tile layers
      map.eachLayer((layer: any) => {
        if (layer instanceof L.TileLayer) {
          map.removeLayer(layer);
        }
      });

      // Add new tile layer with updated theme
      const geoKey = process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY ?? '';
      const tileStyle = isDarkTheme ? 'dark-matter' : 'osm-bright';
      const tileUrl = `https://maps.geoapify.com/v1/tile/${tileStyle}/{z}/{x}/{y}.png?apiKey=${geoKey}`;

      L.tileLayer(tileUrl, {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://www.geoapify.com/">Geoapify</a>',
        maxZoom: 20,
      }).addTo(map);
    };

    updateTheme();
  }, [isDarkTheme, mapReady]);

  // Task 8.66-8.68: Map click to search and add places
  useEffect(() => {
    if (!mapReady || !mapRef.current || typeof window === 'undefined') return;

    const handleMapClick = async (e: any) => {
      if (!searchMode) return;

      const L = (await import('leaflet')).default;
      const map = mapRef.current;
      const { lat, lng } = e.latlng;

      // Remove previous search marker
      if (searchMarkerRef.current) {
        searchMarkerRef.current.remove();
        searchMarkerRef.current = null;
      }

      // Show loading marker
      const loadingMarker = L.marker([lat, lng], {
        icon: L.divIcon({
          html: `
            <div style="
              background: var(--accent);
              border: 3px solid var(--ink);
              color: var(--ink);
              width: 36px;
              height: 36px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: 700;
              animation: pulse 1s infinite;
            ">
              ?
            </div>
          `,
          className: '',
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        }),
      }).addTo(map);

      searchMarkerRef.current = loadingMarker;

      // Reverse geocode to find place
      try {
        const response = await fetch(
          `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lng}&format=json&apiKey=${process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY || ''}`
        );
        const data = await response.json();

        if (data.results && data.results.length > 0) {
          const result = data.results[0];
          const place: Place = {
            id: `geoapify:${result.place_id || `${lat},${lng}`}`,
            name: result.name || result.address_line1 || 'Unknown Place',
            address: result.formatted || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
            latitude: lat,
            longitude: lng,
            types: result.categories || [],
            source: 'geoapify',
          };

          setSearchResult(place);

          // Update marker with place info
          loadingMarker.setIcon(L.divIcon({
            html: `
              <div style="
                background: #22c55e;
                border: 3px solid var(--ink);
                color: var(--ink);
                width: 36px;
                height: 36px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: 700;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
              ">
                +
              </div>
            `,
            className: '',
            iconSize: [36, 36],
            iconAnchor: [18, 18],
          }));

          // Task 8.67: Show place preview popup
          loadingMarker.bindPopup(`
            <div style="padding: 8px; min-width: 200px;">
              <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">${place.name}</h3>
              <p style="margin: 0 0 8px 0; font-size: 12px; color: #666;">${place.address}</p>
              ${place.types.length > 0 ? `<p style="margin: 0 0 12px 0; font-size: 11px; color: #888;">${place.types.slice(0, 3).join(', ')}</p>` : ''}
              <button 
                id="add-place-btn-${place.id}"
                style="
                  width: 100%;
                  padding: 8px;
                  background: #ffb81c;
                  color: #0d3b40;
                  border: none;
                  border-radius: 8px;
                  font-weight: 600;
                  font-size: 13px;
                  cursor: pointer;
                "
              >
                Add to itinerary
              </button>
            </div>
          `).openPopup();

          // Task 8.68: Handle "Add this place" action
          setTimeout(() => {
            const btn = document.getElementById(`add-place-btn-${place.id}`);
            if (btn) {
              btn.addEventListener('click', () => {
                onAddPlace?.(place);
                setSearchMode(false);
                setSearchResult(null);
                if (searchMarkerRef.current) {
                  searchMarkerRef.current.remove();
                  searchMarkerRef.current = null;
                }
              });
            }
          }, 100);
        }
      } catch (error) {
        console.error('Reverse geocode failed:', error);
        loadingMarker.remove();
        searchMarkerRef.current = null;
      }
    };

    const map = mapRef.current;
    map.on('click', handleMapClick);

    return () => {
      map.off('click', handleMapClick);
    };
  }, [mapReady, searchMode, onAddPlace]);

  // Update markers and route (Task 8.11, 8.12)
  useEffect(() => {
    if (!mapReady || !mapRef.current || typeof window === 'undefined') return;

    const updateMarkers = async () => {
      const L = (await import('leaflet')).default;
      const map = mapRef.current;

      // Clear existing markers
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];

      // Clear existing polyline
      if (polylineRef.current) {
        polylineRef.current.remove();
        polylineRef.current = null;
      }

      if (points.length === 0) return;

      // Create custom icon with number
      const createNumberedIcon = (number: number, isHighlighted: boolean) => {
        const color = isHighlighted ? '#ffb81c' : '#0d3b40';
        const bgColor = isHighlighted ? '#0d3b40' : '#ffb81c';
        
        return L.divIcon({
          html: `
            <div class="leaflet-marker-custom ${isHighlighted ? 'leaflet-marker-highlighted' : ''}" style="
              background: ${bgColor};
              border: 3px solid ${color};
              color: ${color};
              width: 36px;
              height: 36px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: 700;
              font-size: 14px;
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
              transition: all 0.2s ease;
            ">
              ${number}
            </div>
          `,
          className: '',
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });
      };

      // Add markers
      const latLngs: [number, number][] = [];
      points.forEach((point, index) => {
        const isHighlighted = highlightedActivityId === point.id;
        const marker = L.marker(
          [point.latitude, point.longitude],
          { icon: createNumberedIcon(index + 1, isHighlighted) }
        );

        // Task 8.11: Click handler
        marker.on('click', () => {
          onMarkerClick?.(point.id);
        });

        // Add popup
        marker.bindPopup(`
          <div style="text-align: center; padding: 4px;">
            <strong>${point.name}</strong><br/>
            <small>${point.address}</small>
          </div>
        `);

        marker.addTo(map);
        markersRef.current.push(marker);
        latLngs.push([point.latitude, point.longitude]);
      });

      // Task 8.13: Add route polyline if enabled
      if (showRoute && latLngs.length > 1) {
        polylineRef.current = L.polyline(latLngs, {
          color: isDarkTheme ? '#9fbab8' : '#0d3b40',
          weight: 3,
          opacity: 0.6,
          dashArray: '10, 10',
        }).addTo(map);
      }

      // Task 8.14: Fit bounds to show all markers
      if (latLngs.length > 0) {
        map.fitBounds(latLngs, { padding: [50, 50] });
      }
    };

    updateMarkers();
  }, [points, mapReady, highlightedActivityId, showRoute, isDarkTheme, onMarkerClick]);

  // Task 8.12: Pulse highlighted marker
  useEffect(() => {
    if (!highlightedActivityId || typeof window === 'undefined') return;

    const pulseMarker = async () => {
      const highlightedIndex = points.findIndex(p => p.id === highlightedActivityId);
      if (highlightedIndex === -1) return;

      const marker = markersRef.current[highlightedIndex];
      if (!marker) return;

      const element = marker.getElement();
      if (element) {
        element.classList.add('marker-pulse');
        setTimeout(() => {
          element.classList.remove('marker-pulse');
        }, 600);
      }
    };

    pulseMarker();
  }, [highlightedActivityId, points]);

  // Task 8.14: Fit to trip button handler
  const handleFitToTrip = async () => {
    if (!mapRef.current || points.length === 0 || typeof window === 'undefined') return;

    const L = (await import('leaflet')).default;
    const latLngs: [number, number][] = points.map(p => [p.latitude, p.longitude]);
    mapRef.current.fitBounds(latLngs, { padding: [50, 50], animate: true });
  };

  return (
    <div className={`leaflet-map-wrapper ${fullScreen ? 'leaflet-map-fullscreen' : ''} ${className}`}>
      <div id="leaflet-map-container" className="leaflet-map-container" />
      
      {/* Task 8.13-8.14: Map controls */}
      <div className="leaflet-map-controls">
        {/* Task 8.65: Search places on map */}
        {onAddPlace && (
          <button
            type="button"
            className={`map-control-button ${searchMode ? 'map-control-active' : ''}`}
            onClick={() => {
              setSearchMode(!searchMode);
              if (searchMarkerRef.current) {
                searchMarkerRef.current.remove();
                searchMarkerRef.current = null;
              }
              setSearchResult(null);
            }}
            aria-label={searchMode ? 'Cancel search' : 'Search places on map'}
            title={searchMode ? 'Cancel search' : 'Click map to add places'}
          >
            <MagnifyingGlass size={20} weight="bold" />
          </button>
        )}
        
        {onToggleFullScreen && (
          <button
            type="button"
            className="map-control-button"
            onClick={onToggleFullScreen}
            aria-label={fullScreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            title={fullScreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {fullScreen ? <ArrowsIn size={20} weight="bold" /> : <ArrowsOut size={20} weight="bold" />}
          </button>
        )}
        
        {onToggleRoute && (
          <button
            type="button"
            className={`map-control-button ${showRoute ? 'map-control-active' : ''}`}
            onClick={onToggleRoute}
            aria-label={showRoute ? 'Hide route' : 'Show route'}
            title={showRoute ? 'Hide route' : 'Show route'}
          >
            <Path size={20} weight="bold" />
          </button>
        )}
        
        <button
          type="button"
          className="map-control-button"
          onClick={handleFitToTrip}
          aria-label="Fit to trip"
          title="Fit to trip"
          disabled={points.length === 0}
        >
          <Target size={20} weight="bold" />
        </button>
      </div>
      
      {searchMode && (
        <div className="map-search-hint">
          <MagnifyingGlass size={16} weight="bold" />
          <span>Click anywhere on the map to add a place</span>
          <button
            type="button"
            onClick={() => {
              setSearchMode(false);
              if (searchMarkerRef.current) {
                searchMarkerRef.current.remove();
                searchMarkerRef.current = null;
              }
            }}
          >
            Cancel
          </button>
        </div>
      )}
      
      {!mapReady && (
        <div className="map-loading">
          <div className="spinner" />
          <span>Loading map...</span>
        </div>
      )}
    </div>
  );
}
