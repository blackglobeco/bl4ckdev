
import React from 'react';
import './flight-tracker-widget.scss';

interface FlightTrackerWidgetProps {
  onClose: () => void;
}

export const FlightTrackerWidget: React.FC<FlightTrackerWidgetProps> = ({ onClose }) => {
  return (
    <div className="flight-tracker-backdrop" onClick={onClose}>
      <div className="flight-tracker-widget" onClick={(e) => e.stopPropagation()}>
        <button className="close-button" onClick={onClose}>×</button>
        <div className="flight-tracker-content">
          <div className="flight-tracker-container">
            <iframe
              src="https://globe.adsbexchange.com"
              className="flight-tracker-iframe"
              title="Live Aircraft Tracker"
              allowFullScreen
              allow="geolocation; fullscreen"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
