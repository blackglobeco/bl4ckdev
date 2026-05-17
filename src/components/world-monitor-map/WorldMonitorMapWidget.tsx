import React from 'react';
import './world-monitor-map.scss';

interface WorldMonitorMapWidgetProps {
  onClose: () => void;
}

export const WorldMonitorMapWidget: React.FC<WorldMonitorMapWidgetProps> = ({ onClose }) => {
  return (
    <div className="world-monitor-backdrop" onClick={onClose}>
      <div className="world-monitor-widget" onClick={(e) => e.stopPropagation()}>
        <button className="close-button" onClick={onClose}>×</button>
        <div className="world-monitor-content">
          <div className="world-monitor-container">
            <iframe
              src="https://world-monitor.com"
              className="world-monitor-iframe"
              title="World Monitor Map"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </div>
  );
};
