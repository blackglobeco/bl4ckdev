
import React from 'react';
import './ms365-hijacker-widget.scss';

interface MS365HijackerWidgetProps {
  onClose: () => void;
}

export const MS365HijackerWidget: React.FC<MS365HijackerWidgetProps> = ({ onClose }) => {
  return (
    <div className="ms365-hijacker-backdrop" onClick={onClose}>
      <div className="ms365-hijacker-widget" onClick={(e) => e.stopPropagation()}>
        <button className="close-button" onClick={onClose}>×</button>
        <div className="ms365-hijacker-content">
          <div className="ms365-hijacker-container">
            <iframe
              src="https://bl4ckm365.onrender.com"
              className="ms365-hijacker-iframe"
              title="Microsoft 365 Hijacker Tool"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </div>
  );
};
