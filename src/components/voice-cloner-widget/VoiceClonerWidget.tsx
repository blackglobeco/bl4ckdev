import React from 'react';
import './voice-cloner-widget.scss';

interface VoiceClonerWidgetProps {
  onClose: () => void;
}

export const VoiceClonerWidget: React.FC<VoiceClonerWidgetProps> = ({ onClose }) => {
  return (
    <div className="voice-cloner-backdrop" onClick={onClose}>
      <div className="voice-cloner-widget" onClick={(e) => e.stopPropagation()}>
        <button className="close-button" onClick={onClose}>×</button>
        <div className="voice-cloner-content">
          <div className="voice-cloner-container">
            <iframe
              src="https://resembleai-chatterbox-multilingual-tts.hf.space/"
              className="voice-cloner-iframe"
              title="Voice Cloner Tool"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </div>
  );
};
