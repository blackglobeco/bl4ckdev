import React from 'react';
import './email-spoofer-widget.scss';

interface EmailSpooferWidgetProps {
  onClose: () => void;
}

export const EmailSpooferWidget: React.FC<EmailSpooferWidgetProps> = ({ onClose }) => (
  <div className="email-spoofer-backdrop" onClick={onClose}>
    <div className="email-spoofer-widget" onClick={(e) => e.stopPropagation()}>
      <div className="email-spoofer-titlebar">
        <button className="email-spoofer-close-btn" onClick={onClose} aria-label="Close" />
      </div>
      <div className="email-spoofer-body">
        <iframe
          src="https://bl4ck-mail.vercel.app/"
          className="email-spoofer-iframe"
          title="Email Spoofer Tool"
          allowFullScreen
        />
      </div>
    </div>
  </div>
);
