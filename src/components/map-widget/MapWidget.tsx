import React, { useState, useEffect } from 'react';
import './map-widget.scss';

interface MapWidgetProps {
  location: string;
  onClose: () => void;
}

const isWebView = () => {
  const ua = navigator.userAgent || navigator.vendor || '';
  const standalone = (window.navigator as any).standalone === true;
  const isIOSWebView = /iPhone|iPod|iPad/.test(ua) && !standalone && !/Safari/.test(ua);
  const isAndroidWebView =
    /\bwv\b/.test(ua) ||
    (/Android.*Version\/[\d.]+.*Chrome/.test(ua) && !/Chrome\/\d{2,}/.test(ua));
  return isIOSWebView || isAndroidWebView;
};

export const MapWidget: React.FC<MapWidgetProps> = ({ location, onClose }) => {
  const [mapUrl, setMapUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isWebView()) { setLoading(false); return; }

    const mapHtml = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { margin: 0; padding: 0; }
    #map { height: 100vh; width: 100%; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    let map, trafficLayer;
    function initMap() {
      map = new google.maps.Map(document.getElementById('map'), {
        zoom: 15,
        center: { lat: 3.1319, lng: 101.6958 },
        mapTypeId: 'roadmap',
        styles: [
          {elementType:'geometry',stylers:[{color:'#212121'}]},
          {elementType:'labels.text.stroke',stylers:[{color:'#212121'}]},
          {elementType:'labels.text.fill',stylers:[{color:'#757575'}]},
          {featureType:'road',elementType:'geometry',stylers:[{color:'#1b1b1b'}]},
          {featureType:'road.highway',elementType:'geometry',stylers:[{color:'#3c3c3c'}]},
          {featureType:'water',elementType:'geometry',stylers:[{color:'#000000'}]}
        ]
      });
      trafficLayer = new google.maps.TrafficLayer();
      trafficLayer.setMap(map);

      const coord = /^-?\\d+\\.?\\d*,-?\\d+\\.?\\d*$/.test('${location}');
      if (coord) {
        const [lat, lng] = '${location}'.split(',').map(Number);
        map.setCenter({ lat, lng });
        map.setZoom(16);
        new google.maps.Marker({ position: { lat, lng }, map });
      } else if ('${location}' !== 'current-location-unavailable') {
        new google.maps.Geocoder().geocode({ address: '${location}' }, (results, status) => {
          if (status === 'OK' && results[0]) {
            map.setCenter(results[0].geometry.location);
            new google.maps.Marker({ position: results[0].geometry.location, map });
          }
        });
      }
    }
  </script>
  <script src="https://maps.googleapis.com/maps/api/js?key=${process.env.REACT_APP_GOOGLE_MAPS_API_KEY || 'demo-key'}&callback=initMap&libraries=geometry"></script>
</body>
</html>`;

    try {
      setMapUrl(`data:text/html;charset=utf-8,${encodeURIComponent(mapHtml)}`);
    } catch {
      setError('Failed to load map.');
    } finally {
      setLoading(false);
    }
  }, [location]);

  if (isWebView()) return null;

  return (
    <div className="map-backdrop" onClick={onClose}>
      <div
        className={`map-widget${loading ? ' loading' : ''}${error ? ' error' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="map-titlebar">
          <button className="map-close-btn" onClick={onClose} aria-label="Close" />
        </div>

        {loading && <p className="map-status">Loading map…</p>}
        {error && <p className="map-status map-error">{error}</p>}
        {!loading && !error && mapUrl && (
          <div className="map-body">
            <iframe
              src={mapUrl}
              className="map-iframe"
              allowFullScreen
              loading="lazy"
              title="Map"
            />
          </div>
        )}
      </div>
    </div>
  );
};
