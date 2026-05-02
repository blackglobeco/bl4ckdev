import React from 'react';
import './flipper-zero-widget.scss';

interface FlipperZeroWidgetProps {
  onClose: () => void;
}

export const FlipperZeroWidget: React.FC<FlipperZeroWidgetProps> = ({ onClose }) => {
  return (
    <div className="flipper-zero-backdrop" onClick={onClose}>
      <div className="flipper-zero-widget" onClick={(e) => e.stopPropagation()}>
        <button className="close-button" onClick={onClose}>×</button>
        <div className="flipper-zero-content">
          <div className="flipper-zero-container">
            <iframe
              src="https://black-fz.vercel.app/"
              className="flipper-zero-iframe"
              title="Flipper Zero Tool"
              allow="serial"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </div>
  );
};
