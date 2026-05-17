
import React from 'react';
import './device-activity-tracker-widget.scss';

interface DeviceActivityTrackerWidgetProps {
  onClose: () => void;
}

export const DeviceActivityTrackerWidget: React.FC<DeviceActivityTrackerWidgetProps> = ({ onClose }) => {
  return (
    <div className="device-activity-tracker-backdrop" onClick={onClose}>
      <div className="device-activity-tracker-widget" onClick={(e) => e.stopPropagation()}>
        <button className="close-button" onClick={onClose}>×</button>
        <div className="device-activity-tracker-content">
          <div className="device-activity-tracker-container">
            <iframe
              src="https://blackai-dat.onrender.com"
              className="device-activity-tracker-iframe"
              title="Device Activity Tracker"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </div>
  );
};
