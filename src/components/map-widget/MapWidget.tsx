
import React, { useState, useEffect } from 'react';
import './map-widget.scss';

interface MapWidgetProps {
  location: string;
  onClose: () => void;
}

interface MapData {
  location: string;
  mapUrl: string;
  lastUpdated: string;
}

const isWebView = () => {
  const ua = navigator.userAgent || navigator.vendor || '';
  const standalone = (window.navigator as any).standalone === true;

  const isIOSWebView = /iPhone|iPod|iPad/.test(ua) && !standalone && !/Safari/.test(ua);
  const isAndroidWebView = /\bwv\b/.test(ua) || (/Android.*Version\/[\d.]+.*Chrome/.test(ua) && !/Chrome\/\d{2,}/.test(ua));

  return isIOSWebView || isAndroidWebView;
};

export const MapWidget: React.FC<MapWidgetProps> = ({ location, onClose }) => {
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isHidden, setIsHidden] = useState<boolean>(false);

  useEffect(() => {
    if (isWebView()) {
      setIsHidden(true);
      return;
    }

    const loadMapData = async () => {
      if (!location) return;

      setLoading(true);
      setError(null);

      try {
        const mapHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
    #map { height: 100vh; width: 100%; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    let map;
    let trafficLayer;
    
    function initMap() {
      map = new google.maps.Map(document.getElementById('map'), {
        zoom: 15,
        center: { lat: 3.1319, lng: 101.6958 },
        mapTypeId: 'roadmap'
      });

      // Initialize traffic layer
      trafficLayer = new google.maps.TrafficLayer();
      trafficLayer.setMap(map);

      // Apply dark mode styling
      map.setOptions({
        styles: [
          {elementType: 'geometry', stylers: [{color: '#212121'}]},
          {elementType: 'labels.text.stroke', stylers: [{color: '#212121'}]},
          {elementType: 'labels.text.fill', stylers: [{color: '#757575'}]},
          {
            featureType: 'administrative.locality',
            elementType: 'labels.text.fill',
            stylers: [{color: '#bdbdbd'}]
          },
          {
            featureType: 'poi',
            elementType: 'labels.text.fill',
            stylers: [{color: '#757575'}]
          },
          {
            featureType: 'poi.park',
            elementType: 'geometry',
            stylers: [{color: '#181818'}]
          },
          {
            featureType: 'poi.park',
            elementType: 'labels.text.fill',
            stylers: [{color: '#616161'}]
          },
          {
            featureType: 'road',
            elementType: 'geometry',
            stylers: [{color: '#1b1b1b'}]
          },
          {
            featureType: 'road',
            elementType: 'geometry.stroke',
            stylers: [{color: '#2c2c2c'}]
          },
          {
            featureType: 'road',
            elementType: 'labels.text.fill',
            stylers: [{color: '#8a8a8a'}]
          },
          {
            featureType: 'road.highway',
            elementType: 'geometry',
            stylers: [{color: '#3c3c3c'}]
          },
          {
            featureType: 'road.highway',
            elementType: 'geometry.stroke',
            stylers: [{color: '#4e4e4e'}]
          },
          {
            featureType: 'road.highway',
            elementType: 'labels.text.fill',
            stylers: [{color: '#616161'}]
          },
          {
            featureType: 'transit',
            elementType: 'geometry',
            stylers: [{color: '#757575'}]
          },
          {
            featureType: 'transit.station',
            elementType: 'labels.text.fill',
            stylers: [{color: '#616161'}]
          },
          {
            featureType: 'water',
            elementType: 'geometry',
            stylers: [{color: '#000000'}]
          },
          {
            featureType: 'water',
            elementType: 'labels.text.fill',
            stylers: [{color: '#3d3d3d'}]
          },
          {
            featureType: 'water',
            elementType: 'labels.text.stroke',
            stylers: [{color: '#000000'}]
          }
        ]
      });

      // Check if location is GPS coordinates (lat,lng format) or special case
      const coordPattern = /^-?\\d+.?\\d*,-?\\d+.?\\d*$/;
      if ('${location}' === 'current-location-unavailable') {
        // Handle case where current location is not available
        map.setCenter({ lat: 0, lng: 0 });
        map.setZoom(2); // World view
        const infoWindow = new google.maps.InfoWindow({
          content: '<div style="color: #333; padding: 10px;"><strong>Current Location Unavailable</strong><br>Please enable location services or try again.</div>',
          position: { lat: 0, lng: 0 }
        });
        infoWindow.open(map);
      } else if (coordPattern.test('${location}')) {
        const [lat, lng] = '${location}'.split(',').map(Number);
        const position = { lat, lng };
        map.setCenter(position);
        map.setZoom(16); // Higher zoom for precise location
        const marker = new google.maps.Marker({
          position: position,
          map: map,
          icon: {
            url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(\`
              <svg width="24" height="40" viewBox="0 0 32 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M16 0C7.163 0 0 7.163 0 16c0 1.886.348 3.69.976 5.358L16 48l15.024-26.642A15.895 15.895 0 0032 16c0-8.837-7.163-16-16-16z" fill="#EA4335"/>
                <circle cx="16" cy="16" r="6" fill="#990000"/>
              </svg>
            \`),
            scaledSize: new google.maps.Size(24, 40),
            anchor: new google.maps.Point(12, 40)
          }
        });
      } else {
        // Use geocoding for address-based locations
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ address: '${location}' }, (results, status) => {
          if (status === 'OK' && results[0]) {
            map.setCenter(results[0].geometry.location);
            const marker = new google.maps.Marker({
              position: results[0].geometry.location,
              map: map,
              title: '${location}'
            });
          }
        });
      }

      // Refresh traffic data every 2 minutes
      setInterval(function() {
        if (trafficLayer) {
          trafficLayer.setMap(null);
          trafficLayer = new google.maps.TrafficLayer();
          trafficLayer.setMap(map);
        }
      }, 120000); // 2 minutes
    }
  </script>
  <script src="https://maps.googleapis.com/maps/api/js?key=${process.env.REACT_APP_GOOGLE_MAPS_API_KEY || 'demo-key'}&callback=initMap&libraries=geometry"></script>
</body>
</html>`;

        const mapUrl = `data:text/html;charset=utf-8,${encodeURIComponent(mapHtml)}`;

        setMapData({
          location: location,
          mapUrl: mapUrl,
          lastUpdated: new Date().toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: 'numeric',
            hour12: true
          })
        });
      } catch (err) {
        console.error('Failed to load map data:', err);
        setError('Failed to load map data. Please try again.');

        setMapData({
          location: location,
          mapUrl: '',
          lastUpdated: new Date().toLocaleTimeString()
        });
      } finally {
        setLoading(false);
      }
    };

    loadMapData();

    // Set up auto-refresh for traffic data every 2 minutes
    const refreshInterval = setInterval(() => {
      if (mapData && !loading) {
        loadMapData();
      }
    }, 120000); // 2 minutes

    return () => {
      clearInterval(refreshInterval);
    };
  }, [location, loading, mapData]);

  if (isHidden) return null;

  if (loading || !mapData) {
    return (
      <div className="map-backdrop" onClick={onClose}>
        <div className="map-widget loading" onClick={(e) => e.stopPropagation()}>
          <button className="close-button" onClick={onClose}>×</button>
          <div className="loading-spinner">
            {loading ? 'Loading map...' : 'No map data available'}
          </div>
        </div>
      </div>
    );
  }

  if (error && !mapData.mapUrl) {
    return (
      <div className="map-backdrop" onClick={onClose}>
        <div className="map-widget error" onClick={(e) => e.stopPropagation()}>
          <button className="close-button" onClick={onClose}>×</button>
          <div className="error-message">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="map-backdrop" onClick={onClose}>
      <div className="map-widget" onClick={(e) => e.stopPropagation()}>
        <button className="close-button" onClick={onClose}>×</button>
        <div className="map-content">
          <div className="map-container">
            <iframe
              src={mapData.mapUrl}
              className="map-iframe"
              allowFullScreen
              loading="lazy"
              title={`Map for ${/^-?\d+.?\d*,-?\d+.?\d*$/.test(mapData.location) ? 'Your Current Location' : mapData.location}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
