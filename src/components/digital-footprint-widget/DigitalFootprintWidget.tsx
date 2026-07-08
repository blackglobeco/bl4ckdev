import React from 'react';
import './digital-footprint-widget.scss';

interface DigitalFootprintWidgetProps {
  onClose: () => void;
}

export const DigitalFootprintWidget: React.FC<DigitalFootprintWidgetProps> = ({ onClose }) => (
  <div className="digital-footprint-backdrop" onClick={onClose}>
    <div className="digital-footprint-widget" onClick={(e) => e.stopPropagation()}>
      <div className="digital-footprint-titlebar">
        <button className="digital-footprint-close-btn" onClick={onClose} aria-label="Close" />
      </div>
      <div className="digital-footprint-body">
        <iframe
          src="https://bl4ckdf.onrender.com"
          className="digital-footprint-iframe"
          title="Digital Footprint"
          allowFullScreen
        />
      </div>
    </div>
  </div>
);
