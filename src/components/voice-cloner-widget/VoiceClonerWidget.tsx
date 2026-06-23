import React from 'react';
import './voice-cloner-widget.scss';

interface VoiceClonerWidgetProps {
  onClose: () => void;
}

export const VoiceClonerWidget: React.FC<VoiceClonerWidgetProps> = ({ onClose }) => (
  <div className="voice-cloner-backdrop" onClick={onClose}>
    <div className="voice-cloner-widget" onClick={(e) => e.stopPropagation()}>
      <div className="voice-cloner-titlebar">
        <button className="voice-cloner-close-btn" onClick={onClose} aria-label="Close" />
      </div>
      <div className="voice-cloner-body">
        <iframe
          src="https://resembleai-chatterbox-multilingual-tts.hf.space/"
          className="voice-cloner-iframe"
          title="Voice Cloner Tool"
          allowFullScreen
        />
      </div>
    </div>
  </div>
);
