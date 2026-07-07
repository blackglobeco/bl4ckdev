import React from 'react';
import './black-iptv-widget.scss';

interface BlackIPTVWidgetProps {
  onClose: () => void;
}

export const BlackIPTVWidget: React.FC<BlackIPTVWidgetProps> = ({ onClose }) => (
  <div className="black-iptv-backdrop" onClick={onClose}>
    <div className="black-iptv-widget" onClick={(e) => e.stopPropagation()}>
      <div className="black-iptv-titlebar">
        <button className="black-iptv-close-btn" onClick={onClose} aria-label="Close" />
      </div>
      <div className="black-iptv-body">
        <iframe
          src="https://black4788.vercel.app"
          className="black-iptv-iframe"
          title="Black IPTV"
          allowFullScreen
        />
      </div>
    </div>
  </div>
);
