
import React from 'react';
import './subdomain-finder-widget.scss';

interface SubdomainFinderWidgetProps {
  onClose: () => void;
}

export const SubdomainFinderWidget: React.FC<SubdomainFinderWidgetProps> = ({ onClose }) => {
  return (
    <div className="subdomain-finder-backdrop" onClick={onClose}>
      <div className="subdomain-finder-widget" onClick={(e) => e.stopPropagation()}>
        <button className="close-button" onClick={onClose}>×</button>
        <div className="subdomain-finder-content">
          <div className="subdomain-finder-container">
            <iframe
              src="https://subdomainfinder.c99.nl/"
              className="subdomain-finder-iframe"
              title="Subdomain Finder Tool"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </div>
  );
};
