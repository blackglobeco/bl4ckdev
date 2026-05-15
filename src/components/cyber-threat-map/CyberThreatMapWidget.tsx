
import React from 'react';
import './cyber-threat-map.scss';

interface CyberThreatMapWidgetProps {
  onClose: () => void;
}

export const CyberThreatMapWidget: React.FC<CyberThreatMapWidgetProps> = ({ onClose }) => {
  return (
    <div className="cyber-threat-backdrop" onClick={onClose}>
      <div className="cyber-threat-widget" onClick={(e) => e.stopPropagation()}>
        <button className="close-button" onClick={onClose}>×</button>
        <div className="cyber-threat-content">
          <div className="cyber-threat-container">
            <iframe
              width="900"
              height="700"
              src="https://cybermap.kaspersky.com/en/widget/dynamic/dark"
              frameBorder="0"
              className="cyber-threat-iframe"
              title="Kaspersky Cyber Threat Map"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </div>
  );
};
