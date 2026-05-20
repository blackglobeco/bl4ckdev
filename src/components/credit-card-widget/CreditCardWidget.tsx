import React from 'react';
import './credit-card-widget.scss';

interface CreditCardWidgetProps {
  onClose: () => void;
}

export const CreditCardWidget: React.FC<CreditCardWidgetProps> = ({ onClose }) => {
  // Placeholder for handleIframeError and setIframeError, as they are not defined in the original snippet.
  // In a real scenario, these would be state setters from useState.
  const handleIframeError = () => {
    console.error("Iframe failed to load");
  };
  const setIframeError = (error: boolean) => {
    console.log("Iframe error status:", error);
  };

  const openInNewTab = () => {
    window.open('https://itaishek.github.io/CC_Generator/', '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="credit-card-backdrop" onClick={onClose}>
      <div className="credit-card-widget" onClick={(e) => e.stopPropagation()}>
        <button className="close-button" onClick={onClose}>×</button>
        <div className="credit-card-content">
          <div className="credit-card-container">
            <iframe
              src="https://itaishek.github.io/CC_Generator/"
              className="credit-card-iframe"
              title="Credit Card Generator Tool"
              allowFullScreen
              onError={handleIframeError}
              onLoad={(e) => {
                // Check if iframe loaded successfully
                const iframe = e.target as HTMLIFrameElement;
                try {
                  // If we can't access contentDocument, it's likely blocked
                  if (!iframe.contentDocument && !iframe.contentWindow) {
                    setIframeError(true);
                  }
                } catch (error) {
                  setIframeError(true);
                }
              }}
            />
          </div>
          <p><strong>URL:</strong>https://itaishek.github.io/CC_Generator/</p>
          <button onClick={openInNewTab}>Open in New Tab</button>
        </div>
      </div>
    </div>
  );
};
