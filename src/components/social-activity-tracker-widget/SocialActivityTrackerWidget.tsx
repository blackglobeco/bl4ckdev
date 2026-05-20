
import React from 'react';
import './social-activity-tracker-widget.scss';

interface SocialActivityTrackerWidgetProps {
  onClose: () => void;
}

export const SocialActivityTrackerWidget: React.FC<SocialActivityTrackerWidgetProps> = ({ onClose }) => {
  return (
    <div className="social-activity-tracker-backdrop" onClick={onClose}>
      <div className="social-activity-tracker-widget" onClick={(e) => e.stopPropagation()}>
        <button className="close-button" onClick={onClose}>×</button>
        <div className="social-activity-tracker-content">
          <div className="social-activity-tracker-container">
            <iframe
              src="https://public.openmeasures.io/search"
              className="social-activity-tracker-iframe"
              title="Social Activity Tracker Tool"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </div>
  );
};
