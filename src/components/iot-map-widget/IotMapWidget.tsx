import React, { useState, useEffect, useRef } from 'react';
import './iot-map-widget.scss';

interface IotMapWidgetProps {
  location: string;
  onClose: () => void;
}

const isWebView = () => {
  const ua = navigator.userAgent || navigator.vendor || '';
  const standalone = (window.navigator as any).standalone === true;
  const isIOSWebView = /iPhone|iPod|iPad/.test(ua) && !standalone && !/Safari/.test(ua);
  const isAndroidWebView = /\bwv\b/.test(ua) || (/Android.*Version\/[\d.]+.*Chrome/.test(ua) && !/Chrome\/\d{2,}/.test(ua));
  return isIOSWebView || isAndroidWebView;
};

export const IotMapWidget: React.FC<IotMapWidgetProps> = ({ location, onClose }) => {
  const [mapUrl, setMapUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isHidden, setIsHidden] = useState<boolean>(false);

  useEffect(() => {
    if (isWebView()) {
      setIsHidden(true);
      return;
    }

    const buildMap = async () => {
      if (!location) return;

      setLoading(true);
      setError(null);

      try {
        const coordPattern = /^-?\d+\.?\d*,-?\d+\.?\d*$/;
        const isCurrentUnavailable = location === 'current-location-unavailable';

        let lat = 20;
        let lon = 0;
        let zoom = 2;
        let label = '';

        if (isCurrentUnavailable) {
          lat = 20;
          lon = 0;
          zoom = 2;
          label = 'Location Unavailable';
        } else if (coordPattern.test(location)) {
          const [parsedLat, parsedLon] = location.split(',').map(Number);
          lat = parsedLat;
          lon = parsedLon;
          zoom = 16;
          label = 'Target Location';
        } else {
          // Geocode via Nominatim (OpenStreetMap's free geocoder)
          const geoRes = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`,
            { headers: { 'Accept-Language': 'en' } }
          );
          const geoData = await geoRes.json();
          if (geoData && geoData.length > 0) {
            lat = parseFloat(geoData[0].lat);
            lon = parseFloat(geoData[0].lon);
            zoom = 14;
            label = geoData[0].display_name || location;
          } else {
            throw new Error('Location not found');
          }
        }

        const mapHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; background: #0a0a0a; }
    #map { width: 100%; height: 100vh; }

    /* No filter needed — CartoDB Dark Matter tiles are natively dark */

    /* Scanline overlay */
    body::after {
      content: '';
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: repeating-linear-gradient(
        0deg,
        transparent,
        transparent 2px,
        rgba(0, 255, 100, 0.015) 2px,
        rgba(0, 255, 100, 0.015) 4px
      );
      pointer-events: none;
      z-index: 999;
    }

    /* Pulsing red circle marker */
    .iot-marker-container {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .iot-marker-pulse {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(220, 38, 38, 0.25);
      border: 2px solid rgba(220, 38, 38, 0.6);
      animation: iotPulse 2s ease-out infinite;
      position: absolute;
    }
    .iot-marker-pulse:nth-child(2) { animation-delay: 0.6s; }
    .iot-marker-pulse:nth-child(3) { animation-delay: 1.2s; }
    .iot-marker-core {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #dc2626;
      border: 2px solid #fff;
      box-shadow: 0 0 12px #dc2626, 0 0 24px rgba(220, 38, 38, 0.5);
      position: relative;
      z-index: 1;
    }
    @keyframes iotPulse {
      0% { transform: scale(0.5); opacity: 1; }
      100% { transform: scale(2.5); opacity: 0; }
    }

    /* Crosshair reticle around marker */
    .iot-reticle {
      position: absolute;
      width: 60px;
      height: 60px;
    }
    .iot-reticle::before, .iot-reticle::after {
      content: '';
      position: absolute;
      background: rgba(220, 38, 38, 0.7);
    }
    .iot-reticle::before {
      width: 100%; height: 1px;
      top: 50%; left: 0;
      transform: translateY(-50%);
    }
    .iot-reticle::after {
      width: 1px; height: 100%;
      left: 50%; top: 0;
      transform: translateX(-50%);
    }

    /* Leaflet popup dark style */
    .leaflet-popup-content-wrapper {
      background: rgba(10, 10, 10, 0.95) !important;
      border: 1px solid rgba(220, 38, 38, 0.5) !important;
      border-radius: 4px !important;
      box-shadow: 0 0 20px rgba(220, 38, 38, 0.3) !important;
      color: #e5e5e5 !important;
      font-family: 'Courier New', monospace !important;
    }
    .leaflet-popup-tip { background: rgba(10, 10, 10, 0.95) !important; }
    .leaflet-popup-content { font-size: 12px !important; line-height: 1.6 !important; }
    .leaflet-popup-close-button { color: #dc2626 !important; }

    /* Coordinate display */
    .iot-coords {
      position: fixed;
      bottom: 16px;
      left: 16px;
      background: rgba(0,0,0,0.8);
      border: 1px solid rgba(220,38,38,0.4);
      color: #dc2626;
      font-family: 'Courier New', monospace;
      font-size: 11px;
      padding: 6px 10px;
      border-radius: 3px;
      z-index: 1000;
      letter-spacing: 0.05em;
    }

    /* Attribution dark */
    .leaflet-control-attribution {
      background: rgba(0,0,0,0.7) !important;
      color: #555 !important;
      font-size: 9px !important;
    }
    .leaflet-control-attribution a { color: #444 !important; }

    /* Zoom control dark */
    .leaflet-control-zoom a {
      background: rgba(10,10,10,0.9) !important;
      border-color: rgba(220,38,38,0.3) !important;
      color: #dc2626 !important;
    }
    .leaflet-control-zoom a:hover {
      background: rgba(220,38,38,0.15) !important;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <div class="iot-coords" id="coords">
    LAT: ${lat.toFixed(6)} &nbsp;|&nbsp; LON: ${lon.toFixed(6)}
  </div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
  <script>
    var map = L.map('map', {
      center: [${lat}, ${lon}],
      zoom: ${zoom},
      minZoom: 2,
      maxZoom: 19,
      zoomControl: true,
      attributionControl: true,
      maxBounds: [[-90, -180], [90, 180]],
      maxBoundsViscosity: 1.0
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      minZoom: 2,
      maxZoom: 19
    }).addTo(map);

    ${!isCurrentUnavailable && zoom > 2 ? `
    // Custom red circle marker
    var markerHtml = '<div class="iot-marker-container">' +
      '<div class="iot-reticle"></div>' +
      '<div class="iot-marker-pulse"></div>' +
      '<div class="iot-marker-pulse"></div>' +
      '<div class="iot-marker-pulse"></div>' +
      '<div class="iot-marker-core"></div>' +
    '</div>';

    var customIcon = L.divIcon({
      html: markerHtml,
      className: '',
      iconSize: [60, 60],
      iconAnchor: [30, 30],
      popupAnchor: [0, -30]
    });

    var marker = L.marker([${lat}, ${lon}], { icon: customIcon }).addTo(map);
    marker.bindPopup(
      '<div style="color:#dc2626;font-weight:bold;margin-bottom:4px;">&#9679; TARGET ACQUIRED</div>' +
      '<div style="color:#aaa;">${label.replace(/'/g, "\\'").substring(0, 80)}${label.length > 80 ? '...' : ''}</div>' +
      '<div style="color:#666;margin-top:4px;font-size:10px;">LAT: ${lat.toFixed(6)}<br>LON: ${lon.toFixed(6)}</div>'
    );
    ` : ''}

    // Update coords on map move
    map.on('mousemove', function(e) {
      document.getElementById('coords').innerHTML =
        'LAT: ' + e.latlng.lat.toFixed(6) + ' &nbsp;|&nbsp; LON: ' + e.latlng.lng.toFixed(6);
    });
    map.on('mouseout', function() {
      document.getElementById('coords').innerHTML =
        'LAT: ${lat.toFixed(6)} &nbsp;|&nbsp; LON: ${lon.toFixed(6)}';
    });
  </script>
</body>
</html>`;

        const url = `data:text/html;charset=utf-8,${encodeURIComponent(mapHtml)}`;
        setMapUrl(url);
      } catch (err) {
        console.error('IOT Map error:', err);
        setError('Target location not found. Try coordinates (lat,lon) or a place name.');
      } finally {
        setLoading(false);
      }
    };

    buildMap();
  }, [location]);

  if (isHidden) return null;

  return (
    <div className="iot-map-backdrop" onClick={onClose}>
      <div className="iot-map-widget" onClick={(e) => e.stopPropagation()}>
        <button className="iot-close-button" onClick={onClose}>✕</button>

        {loading && (
          <div className="iot-map-loading">
            <div className="iot-loading-ring" />
            <span>ACQUIRING TARGET...</span>
          </div>
        )}

        {error && !loading && (
          <div className="iot-map-error">
            <span className="iot-error-icon">⚠</span>
            <span>{error}</span>
          </div>
        )}

        {mapUrl && !loading && (
          <iframe
            src={mapUrl}
            className="iot-map-iframe"
            allowFullScreen
            loading="lazy"
            title="IOT Map"
          />
        )}
      </div>
    </div>
  );
};
