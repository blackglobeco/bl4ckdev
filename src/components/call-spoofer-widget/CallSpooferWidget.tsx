import React from 'react';
import './call-spoofer-widget.scss';

interface CallSpooferWidgetProps {
  onClose: () => void;
}

export const CallSpooferWidget: React.FC<CallSpooferWidgetProps> = ({ onClose }) => (
  <div className="call-spoofer-backdrop" onClick={onClose}>
    <div className="call-spoofer-widget" onClick={(e) => e.stopPropagation()}>
      <div className="call-spoofer-titlebar">
        <button className="call-spoofer-close-btn" onClick={onClose} aria-label="Close" />
      </div>
      <div className="call-spoofer-body">
        <iframe
          src="https://web.magnusbilling.net/"
          className="call-spoofer-iframe"
          title="Call Spoofer Tool"
          sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads"
          allow="microphone; camera; autoplay; speaker-selection; display-capture"
          allowFullScreen
        />
      </div>
    </div>
  </div>
);
