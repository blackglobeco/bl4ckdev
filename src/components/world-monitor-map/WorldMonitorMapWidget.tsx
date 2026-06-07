import React from 'react';
import './world-monitor-map.scss';

interface WorldMonitorMapWidgetProps {
  onClose: () => void;
}

export const WorldMonitorMapWidget: React.FC<WorldMonitorMapWidgetProps> = ({ onClose }) => (
  <div className="world-monitor-backdrop" onClick={onClose}>
    <div className="world-monitor-widget" onClick={(e) => e.stopPropagation()}>
      <div className="world-monitor-titlebar">
        <button className="world-monitor-close-btn" onClick={onClose} aria-label="Close" />
      </div>
      <div className="world-monitor-body">
        <iframe
          src="https://world-monitor.com"
          className="world-monitor-iframe"
          title="World Monitor Map"
          allowFullScreen
        />
      </div>
    </div>
  </div>
);
