import React from 'react';
import './world-iptv-widget.scss';

interface WorldIPTVWidgetProps {
  onClose: () => void;
}

export const WorldIPTVWidget: React.FC<WorldIPTVWidgetProps> = ({ onClose }) => (
  <div className="world-iptv-backdrop" onClick={onClose}>
    <div className="world-iptv-widget" onClick={(e) => e.stopPropagation()}>
      <div className="world-iptv-titlebar">
        <button className="world-iptv-close-btn" onClick={onClose} aria-label="Close" />
      </div>
      <div className="world-iptv-body">
        <iframe
          src="https://elliptoiptv.vercel.app/"
          className="world-iptv-iframe"
          title="World IPTV Player"
          allowFullScreen
        />
      </div>
    </div>
  </div>
);
