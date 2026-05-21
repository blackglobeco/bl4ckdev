
import React from 'react';
import './email-spoofer-widget.scss';

interface EmailSpooferWidgetProps {
  onClose: () => void;
}

export const EmailSpooferWidget: React.FC<EmailSpooferWidgetProps> = ({ onClose }) => {
  return (
    <div className="email-spoofer-backdrop" onClick={onClose}>
      <div className="email-spoofer-widget" onClick={(e) => e.stopPropagation()}>
        <button className="close-button" onClick={onClose}>×</button>
        <div className="email-spoofer-content">
          <div className="email-spoofer-container">
            <iframe
              src="https://bl4ck-mail.vercel.app/"
              className="email-spoofer-iframe"
              title="Email Spoofer Tool"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </div>
  );
};
