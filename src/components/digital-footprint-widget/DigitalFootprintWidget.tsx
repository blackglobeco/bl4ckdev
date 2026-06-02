import React from 'react';
import './digital-footprint-widget.scss';

interface DigitalFootprintWidgetProps {
  onClose: () => void;
}

export const DigitalFootprintWidget: React.FC<DigitalFootprintWidgetProps> = ({ onClose }) => {
  return (
    <div className="digital-footprint-backdrop" onClick={onClose}>
      <div className="digital-footprint-widget" onClick={(e) => e.stopPropagation()}>
        <button className="close-button" onClick={onClose}>×</button>
        <div className="digital-footprint-content">
          <div className="digital-footprint-container">
            <iframe
              src="https://bl4ckdf.onrender.com"
              className="digital-footprint-iframe"
              title="Digital Footprint Tool"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </div>
  );
};
