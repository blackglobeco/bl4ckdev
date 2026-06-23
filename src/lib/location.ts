/**
 * Utility for handling browser geolocation
 */

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export interface LocationError {
  code: number;
  message: string;
}

export const getCurrentLocation = (): Promise<LocationData> => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject({
        code: 0,
        message: 'Geolocation is not supported by this browser.'
      });
      return;
    }

    const options = {
      enableHighAccuracy: true,
      timeout: 20000, // Increased timeout for better GPS lock
      maximumAge: 60000 // Reduced cache time for fresher location
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        // Log accuracy information for debugging
        console.log(`Location obtained with ${position.coords.accuracy}m accuracy`);
        if (position.coords.accuracy > 1000) {
          console.warn(`Location accuracy is very poor (${position.coords.accuracy}m) - likely using IP geolocation`);
        } else if (position.coords.accuracy > 100) {
          console.warn(`Location accuracy is moderate (${position.coords.accuracy}m) - may be using Wi-Fi positioning`);
        }

        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp
        });
      },
      (error) => {
        let message = 'Unknown error occurred';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            message = 'Location access denied by user';
            break;
          case error.POSITION_UNAVAILABLE:
            message = 'Location information is unavailable';
            break;
          case error.TIMEOUT:
            message = 'Location request timed out';
            break;
        }
        reject({
          code: error.code,
          message
        });
      },
      options
    );
  });
};

export const watchLocation = (
  onLocationUpdate: (location: LocationData) => void,
  onError: (error: LocationError) => void
): number | null => {
  if (!navigator.geolocation) {
    onError({
      code: 0,
      message: 'Geolocation is not supported by this browser.'
    });
    return null;
  }

  const options = {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 60000 // 1 minute for real-time traffic updates
    };

  return navigator.geolocation.watchPosition(
    (position) => {
      onLocationUpdate({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp
      });
    },
    (error) => {
      let message = 'Unknown error occurred';
      switch (error.code) {
        case error.PERMISSION_DENIED:
          message = 'Location access denied by user';
          break;
        case error.POSITION_UNAVAILABLE:
          message = 'Location information is unavailable';
          break;
        case error.TIMEOUT:
          message = 'Location request timed out';
          break;
      }
      onError({
        code: error.code,
        message
      });
    },
    options
  );
};
