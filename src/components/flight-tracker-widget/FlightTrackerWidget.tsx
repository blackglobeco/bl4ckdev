import React from 'react';
import './flight-tracker-widget.scss';

interface FlightTrackerWidgetProps {
  onClose: () => void;
}

export const FlightTrackerWidget: React.FC<FlightTrackerWidgetProps> = ({ onClose }) => (
  <div className="flight-tracker-backdrop" onClick={onClose}>
    <div className="flight-tracker-widget" onClick={(e) => e.stopPropagation()}>
      <div className="flight-tracker-titlebar">
        <button className="flight-tracker-close-btn" onClick={onClose} aria-label="Close" />
      </div>
      <div className="flight-tracker-body">
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
);
