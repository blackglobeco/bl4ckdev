/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useRef, useState } from "react";
import "./App.scss";
import { LiveAPIProvider } from "./contexts/LiveAPIContext";

import { Altair } from "./components/altair/Altair";
import ControlTray from "./components/control-tray/ControlTray";
import { AnimatedBackground } from "./components/animated-background/AnimatedBackground";
import { MapWidget } from "./components/map-widget/MapWidget";
import { YouTubeWidget } from "./components/youtube-widget/YouTubeWidget";
import { CyberThreatMapWidget } from "./components/cyber-threat-map/CyberThreatMapWidget";
import { WorldMonitorMapWidget } from "./components/world-monitor-map/WorldMonitorMapWidget";
import { EmailSpooferWidget } from "./components/email-spoofer-widget/EmailSpooferWidget";
import { AndroidSpywareWidget } from './components/android-spyware-widget/AndroidSpywareWidget';
import { CreditCardWidget } from "./components/credit-card-widget/CreditCardWidget";
import { BitcoinPrivkeyWidget } from "./components/bitcoin-privkey-widget/BitcoinPrivkeyWidget";
import { SocialActivityTrackerWidget } from "./components/social-activity-tracker-widget/SocialActivityTrackerWidget";
import { PhotoGeoWidget } from "./components/photo-geo-widget/PhotoGeoWidget";
import { URLSpywareWidget } from "./components/url-spyware-widget/URLSpywareWidget";
import { PhishFilesStealerWidget } from "./components/phish-files-stealer-widget/PhishFilesStealerWidget";
import { DigitalFootprintWidget } from "./components/digital-footprint-widget/DigitalFootprintWidget";
import { URLMaskerWidget } from "./components/url-masker-widget/URLMaskerWidget";
import { WorldIPTVWidget } from "./components/world-iptv-widget/WorldIPTVWidget";
import { PhishMakerWidget } from "./components/phish-maker-widget/PhishMakerWidget";
import { DataBankWidget } from "./components/data-bank-widget/DataBankWidget";
import { VoiceClonerWidget } from "./components/voice-cloner-widget/VoiceClonerWidget";
import { MS365HijackerWidget } from "./components/ms365-hijacker-widget/MS365HijackerWidget";
import { FlightTrackerWidget } from "./components/flight-tracker-widget/FlightTrackerWidget";
import { DeviceActivityTrackerWidget } from "./components/device-activity-tracker-widget/DeviceActivityTrackerWidget";
import { CodeWidget } from "./components/code-widget/CodeWidget";
import { BitchatTrackerWidget } from "./components/bitchat-tracker-widget/BitchatTrackerWidget";
import { BlackEyesWidget } from "./components/black-eyes-widget/BlackEyesWidget";
import { Lockscreen } from "./components/lockscreen/Lockscreen";
import cn from "classnames";
import { LiveClientOptions } from "./types";


const API_KEY = process.env.REACT_APP_GEMINI_API_KEY as string;
if (typeof API_KEY !== "string") {
  throw new Error("set REACT_APP_GEMINI_API_KEY in .env");
}

const apiOptions: LiveClientOptions = {
  apiKey: API_KEY,
};

function App() {
  // this video reference is used for displaying the active stream, whether that is the webcam or screen capture
  // feel free to style as you see fit
  const videoRef = useRef<HTMLVideoElement>(null);
  // either the screen capture, the video or null, if null we hide it
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  // lockscreen state
  const [isLocked, setIsLocked] = useState<boolean>(true);
  // map widget state
  const [showMapWidget, setShowMapWidget] = useState<boolean>(false);
  const [mapLocation, setMapLocation] = useState<string>("");
  // youtube widget state
  const [showYouTubeWidget, setShowYouTubeWidget] = useState<boolean>(false);
  const [youTubeQuery, setYouTubeQuery] = useState<string>("");
  // cyber threat map widget state
  const [showCyberThreatWidget, setShowCyberThreatWidget] = useState<boolean>(false);
  // world monitor widget state
  const [showWorldMonitorWidget, setShowWorldMonitorWidget] = useState<boolean>(false);
  // email spoofer widget state
  const [showEmailSpooferWidget, setShowEmailSpooferWidget] = useState<boolean>(false);
  // credit card widget state
  const [showCreditCardWidget, setShowCreditCardWidget] = useState<boolean>(false);
  // bitcoin privkey widget state
  const [showBitcoinPrivkeyWidget, setShowBitcoinPrivkeyWidget] = useState<boolean>(false);
  // social activity tracker widget state
  const [showSocialActivityTrackerWidget, setShowSocialActivityTrackerWidget] = useState<boolean>(false);
  // photo geo widget state
  const [showPhotoGeoWidget, setShowPhotoGeoWidget] = useState<boolean>(false);
  // url spyware widget state
  const [showURLSpywareWidget, setShowURLSpywareWidget] = useState<boolean>(false);
  // phish files stealer spyware widget state
  const [showPhishFilesStealerWidget, setShowPhishFilesStealerWidget] = useState<boolean>(false);
  // digital footprint widget state
  const [showDigitalFootprintWidget, setShowDigitalFootprintWidget] = useState<boolean>(false);
  // url masker widget state
  const [showURLMaskerWidget, setShowURLMaskerWidget] = useState<boolean>(false);
  // world iptv widget state
  const [showWorldIPTVWidget, setShowWorldIPTVWidget] = useState<boolean>(false);
  // phish maker widget state
  const [showPhishMakerWidget, setShowPhishMakerWidget] = useState<boolean>(false);
  // data bank widget state
  const [showDataBankWidget, setShowDataBankWidget] = useState<boolean>(false);
  // Android Spyware widget state
  const [showAndroidSpywareWidget, setShowAndroidSpywareWidget] = useState<boolean>(false);
  // Voice Cloner widget state
  const [showVoiceClonerWidget, setShowVoiceClonerWidget] = useState<boolean>(false);
  // MS365 Hijacker widget state
  const [showMS365HijackerWidget, setShowMS365HijackerWidget] = useState<boolean>(false);
  // Flight Tracker widget state
  const [showFlightTrackerWidget, setShowFlightTrackerWidget] = useState<boolean>(false);
  // Device Activity Tracker widget state
  const [showDeviceActivityTrackerWidget, setShowDeviceActivityTrackerWidget] = useState<boolean>(false);
  // Code widget state
  const [showCodeWidget, setShowCodeWidget] = useState<boolean>(false);
  const [codeWidgetData, setCodeWidgetData] = useState<{ code: string; language: string }>({ code: '', language: 'python' });
  // BitChat Tracker widget state
  const [showBitchatTrackerWidget, setShowBitchatTrackerWidget] = useState<boolean>(false);
  // Black Eyes IP Camera widget state
  const [showBlackEyesWidget, setShowBlackEyesWidget] = useState<boolean>(false);


  // Close all widgets function to ensure clean state
  const closeAllWidgets = () => {
    setShowMapWidget(false);
    setShowYouTubeWidget(false);
    setShowCyberThreatWidget(false);
    setShowWorldMonitorWidget(false);
    setShowEmailSpooferWidget(false);
    setShowCreditCardWidget(false);
    setShowBitcoinPrivkeyWidget(false);
    setShowSocialActivityTrackerWidget(false);
    setShowPhotoGeoWidget(false);
    setShowURLSpywareWidget(false);
    setShowPhishFilesStealerWidget(false);
    setShowDigitalFootprintWidget(false);
    setShowURLMaskerWidget(false);
    setShowWorldIPTVWidget(false);
    setShowPhishMakerWidget(false);
    setShowDataBankWidget(false);
    setShowAndroidSpywareWidget(false);
    setShowVoiceClonerWidget(false);
    setShowMS365HijackerWidget(false);
    setShowFlightTrackerWidget(false);
    setShowDeviceActivityTrackerWidget(false);
    setShowCodeWidget(false);
    setCodeWidgetData({ code: '', language: 'python' });
    setShowBitchatTrackerWidget(false);
    setShowBlackEyesWidget(false);
    setMapLocation('');
    setYouTubeQuery('');
  };

  // Handle unlock
  const handleUnlock = () => {
    setIsLocked(false);
    
    // Set up cleanup for when user leaves or closes tab
    const handleBeforeUnload = () => {
      const activePasscode = sessionStorage.getItem('activePasscode');
      if (activePasscode) {
        // Release the passcode session
        try {
          const sessions = JSON.parse(localStorage.getItem('activeSessions') || '{}');
          const sessionId = sessions[activePasscode];
          
          if (sessionId) {
            delete sessions[activePasscode];
            localStorage.setItem('activeSessions', JSON.stringify(sessions));
          }
        } catch (error) {
          console.error('Error releasing passcode:', error);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
  };

  // Show lockscreen if locked
  if (isLocked) {
    return <Lockscreen onUnlock={handleUnlock} />;
  }

  return (
    <div className="App">
      <AnimatedBackground />
      <LiveAPIProvider options={apiOptions}>
        <div className="streaming-console">
          <main>
            <div className="main-app-area">
              {/* APP goes here */}
              <Altair
                onShowMap={(location) => {
                  closeAllWidgets();
                  setMapLocation(location);
                  setTimeout(() => {
                    setShowMapWidget(true);
                  }, 100);
                }}
                onSearchYouTube={(query) => {
                  closeAllWidgets();
                  setTimeout(() => {
                    setYouTubeQuery(query);
                    setShowYouTubeWidget(true);
                  }, 100);
                }}
                onShowCyberThreatMap={() => {
                  closeAllWidgets();
                  setTimeout(() => {
                    setShowCyberThreatWidget(true);
                  }, 100);
                }}
                onShowWorldMonitorMap={() => {
                  closeAllWidgets();
                  setTimeout(() => {
                    setShowWorldMonitorWidget(true);
                  }, 100);
                }}
                onShowEmailSpoofer={() => {
                  closeAllWidgets();
                  setTimeout(() => {
                    setShowEmailSpooferWidget(true);
                  }, 100);
                }}
                onShowAndroidSpyware={() => {
                  closeAllWidgets();
                  setTimeout(() => {
                    setShowAndroidSpywareWidget(true);
                  }, 100);
                }}
                onShowCreditCard={() => {
                  closeAllWidgets();
                  setTimeout(() => {
                    setShowCreditCardWidget(true);
                  }, 100);
                }}
                onShowBitcoinPrivkey={() => {
                  closeAllWidgets();
                  setTimeout(() => {
                    setShowBitcoinPrivkeyWidget(true);
                  }, 100);
                }}
                onShowSocialActivityTracker={() => {
                  closeAllWidgets();
                  setTimeout(() => {
                    setShowSocialActivityTrackerWidget(true);
                  }, 100);
                }}
                onShowPhotoGeo={() => {
                  closeAllWidgets();
                  setTimeout(() => {
                    setShowPhotoGeoWidget(true);
                  }, 100);
                }}
                onShowURLSpyware={() => {
                  closeAllWidgets();
                  setTimeout(() => {
                    setShowURLSpywareWidget(true);
                  }, 100);
                }}
                onShowPhishFilesStealer={() => {
                  closeAllWidgets();
                  setTimeout(() => {
                    setShowPhishFilesStealerWidget(true);
                  }, 100);
                }}
                onShowDigitalFootprint={() => {
                  closeAllWidgets();
                  setTimeout(() => {
                    setShowDigitalFootprintWidget(true);
                  }, 100);
                }}
                onShowURLMasker={() => {
                  closeAllWidgets();
                  setTimeout(() => {
                    setShowURLMaskerWidget(true);
                  }, 100);
                }}
                onShowWorldIPTV={() => {
                  closeAllWidgets();
                  setTimeout(() => {
                    setShowWorldIPTVWidget(true);
                  }, 100);
                }}
                onShowPhishMaker={() => {
                  closeAllWidgets();
                  setTimeout(() => {
                    setShowPhishMakerWidget(true);
                  }, 100);
                }}
                onShowDataBank={() => {
                  closeAllWidgets();
                  setTimeout(() => {
                    setShowDataBankWidget(true);
                  }, 100);
                }}
                onShowVoiceCloner={() => {
                  closeAllWidgets();
                  setTimeout(() => {
                    setShowVoiceClonerWidget(true);
                  }, 100);
                }}
                onShowMS365Hijacker={() => {
                  closeAllWidgets();
                  setTimeout(() => {
                    setShowMS365HijackerWidget(true);
                  }, 100);
                }}
                onShowFlightTracker={() => {
                  closeAllWidgets();
                  setTimeout(() => {
                    setShowFlightTrackerWidget(true);
                  }, 100);
                }}
                onShowDeviceActivityTracker={() => {
                  closeAllWidgets();
                  setTimeout(() => {
                    setShowDeviceActivityTrackerWidget(true);
                  }, 100);
                }}
                onShowCode={(code: string, language: string) => {
                  closeAllWidgets();
                  setTimeout(() => {
                    setCodeWidgetData({ code, language });
                    setShowCodeWidget(true);
                  }, 100);
                }}
                onShowBitchatTracker={() => {
                  closeAllWidgets();
                  setTimeout(() => {
                    setShowBitchatTrackerWidget(true);
                  }, 100);
                }}
                onShowBlackEyes={() => {
                  closeAllWidgets();
                  setTimeout(() => {
                    setShowBlackEyesWidget(true);
                  }, 100);
                }}
              />
              <video
                className={cn("stream", {
                  hidden: !videoRef.current || !videoStream,
                })}
                ref={videoRef}
                autoPlay
                playsInline
              />
            </div>

            <ControlTray
              videoRef={videoRef}
              supportsVideo={true}
              onVideoStreamChange={setVideoStream}
              enableEditingSettings={false}
            >
              {/* put your own buttons here */}
            </ControlTray>
          </main>
        </div>

        {showMapWidget && (
          <MapWidget
            location={mapLocation}
            onClose={closeAllWidgets}
          />
        )}

        {showYouTubeWidget && (
          <YouTubeWidget
            searchQuery={youTubeQuery}
            onClose={closeAllWidgets}
          />
        )}

        {showCyberThreatWidget && (
          <CyberThreatMapWidget
            onClose={closeAllWidgets}
          />
        )}

        {showWorldMonitorWidget && (
          <WorldMonitorMapWidget
            onClose={closeAllWidgets}
          />
        )}

        {showEmailSpooferWidget && (
          <EmailSpooferWidget
            onClose={closeAllWidgets}
          />
        )}

        {showCreditCardWidget && (
          <CreditCardWidget
            onClose={closeAllWidgets}
          />
        )}

        {showBitcoinPrivkeyWidget && (
          <BitcoinPrivkeyWidget
            onClose={closeAllWidgets}
          />
        )}

        {showDataBankWidget && (
          <DataBankWidget
            onClose={closeAllWidgets}
          />
        )}

        {showSocialActivityTrackerWidget && (
          <SocialActivityTrackerWidget
            onClose={closeAllWidgets}
          />
        )}

        {showPhotoGeoWidget && (
          <PhotoGeoWidget
            onClose={closeAllWidgets}
          />
        )}

        {showURLSpywareWidget && (
          <URLSpywareWidget
            onClose={closeAllWidgets}
          />
        )}

        {showPhishFilesStealerWidget && (
          <PhishFilesStealerWidget
            onClose={closeAllWidgets}
          />
        )}

        {showDigitalFootprintWidget && (
          <DigitalFootprintWidget
            onClose={closeAllWidgets}
          />
        )}

        {showURLMaskerWidget && (
          <URLMaskerWidget
            onClose={closeAllWidgets}
          />
        )}

        {showWorldIPTVWidget && (
          <WorldIPTVWidget
            onClose={closeAllWidgets}
          />
        )}

        {showPhishMakerWidget && (
          <PhishMakerWidget
            onClose={closeAllWidgets}
          />
        )}

        {showAndroidSpywareWidget && (
          <AndroidSpywareWidget 
            onClose={closeAllWidgets} 
          />
        )}

        {showVoiceClonerWidget && (
          <VoiceClonerWidget
            onClose={closeAllWidgets}
          />
        )}

        {showMS365HijackerWidget && (
          <MS365HijackerWidget
            onClose={closeAllWidgets}
          />
        )}

        {showFlightTrackerWidget && (
          <FlightTrackerWidget
            onClose={closeAllWidgets}
          />
        )}

        {showDeviceActivityTrackerWidget && (
          <DeviceActivityTrackerWidget
            onClose={closeAllWidgets}
          />
        )}

        {showCodeWidget && (
          <CodeWidget
            code={codeWidgetData.code}
            language={codeWidgetData.language}
            onClose={closeAllWidgets}
          />
        )}

        {showBitchatTrackerWidget && (
          <BitchatTrackerWidget
            onClose={closeAllWidgets}
          />
        )}

        {showBlackEyesWidget && (
          <BlackEyesWidget
            onClose={closeAllWidgets}
          />
        )}

      </LiveAPIProvider>
    </div>
  );
}

export default App;
