import React from 'react';
import './cyber-threat-map.scss';

interface CyberThreatMapWidgetProps {
  onClose: () => void;
}

export const CyberThreatMapWidget: React.FC<CyberThreatMapWidgetProps> = ({ onClose }) => (
  <div className="cyber-threat-backdrop" onClick={onClose}>
    <div className="cyber-threat-widget" onClick={(e) => e.stopPropagation()}>
      <div className="cyber-threat-titlebar">
        <button className="cyber-threat-close-btn" onClick={onClose} aria-label="Close" />
      </div>
      <div className="cyber-threat-body">
        <iframe
          src="https://cybermap.kaspersky.com/en/widget/dynamic/dark"
          className="cyber-threat-iframe"
          title="Cyber Threat Map"
          allowFullScreen
        />
      </div>
    </div>
  </div>
);
