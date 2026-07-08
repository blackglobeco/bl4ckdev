import React from 'react';
import './device-activity-tracker-widget.scss';

interface DeviceActivityTrackerWidgetProps {
  onClose: () => void;
}

export const DeviceActivityTrackerWidget: React.FC<DeviceActivityTrackerWidgetProps> = ({ onClose }) => (
  <div className="device-activity-tracker-backdrop" onClick={onClose}>
    <div className="device-activity-tracker-widget" onClick={(e) => e.stopPropagation()}>
      <div className="device-activity-tracker-titlebar">
        <button className="device-activity-tracker-close-btn" onClick={onClose} aria-label="Close" />
      </div>
      <div className="device-activity-tracker-body">
        <iframe
          src="https://blackai-dat.onrender.com"
          className="device-activity-tracker-iframe"
          title="Device Activity Tracker"
          allowFullScreen
        />
      </div>
    </div>
  </div>
);
