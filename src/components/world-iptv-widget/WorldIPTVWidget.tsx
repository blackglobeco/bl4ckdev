
import React from 'react';
import './world-iptv-widget.scss';

interface WorldIPTVWidgetProps {
  onClose: () => void;
}

export const WorldIPTVWidget: React.FC<WorldIPTVWidgetProps> = ({ onClose }) => {
  return (
    <div className="world-iptv-backdrop" onClick={onClose}>
      <div className="world-iptv-widget" onClick={(e) => e.stopPropagation()}>
        <button className="close-button" onClick={onClose}>×</button>
        <div className="world-iptv-content">
          <div className="world-iptv-container">
            <iframe
              src="https://iptvnator.vercel.app/"
              className="world-iptv-iframe"
              title="World IPTV Player"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </div>
  );
};
