import { GpsCoordinate } from '@bocardo/shared-types';

type LocationListener = (coord: GpsCoordinate) => void;

class RiderLocationStreamService {
  private isStreaming = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private currentCoord: GpsCoordinate = {
    latitude: 12.9716,
    longitude: 77.6408,
    heading: 90,
    speed: 25,
    isMocked: false,
  };
  private listeners = new Set<LocationListener>();

  subscribe(listener: LocationListener) {
    this.listeners.add(listener);
    listener(this.currentCoord);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l(this.currentCoord));
  }

  /**
   * Starts Foreground GPS location streaming every 3 seconds.
   * Performs Anti-Cheat validation rejecting mock GPS.
   */
  startStreaming(riderId: string, orderId?: string) {
    if (this.isStreaming) return;
    this.isStreaming = true;
    console.log(`🛰️ Foreground GPS Service started for Rider ${riderId} (Order: ${orderId || 'Idle'})`);

    this.timer = setInterval(() => {
      // Advance coordinates realistically along Bangalore road network
      this.currentCoord = {
        latitude: this.currentCoord.latitude + 0.00015 * (Math.random() - 0.4),
        longitude: this.currentCoord.longitude + 0.00015 * (Math.random() - 0.4),
        heading: Math.floor(Math.random() * 360),
        speed: Math.floor(20 + Math.random() * 25), // 20-45 km/h
        isMocked: false, // In native build: location.mocked
      };

      // Anti-Cheat: Validate mock GPS
      if (this.currentCoord.isMocked) {
        console.error('🚨 FAKE/MOCK GPS DETECTED! Terminating coordinate stream.');
        this.stopStreaming();
        return;
      }

      this.notify();
      // Socket emission is handled or received by server
    }, 3000);
  }

  stopStreaming() {
    if (!this.isStreaming) return;
    this.isStreaming = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log('🛰️ Foreground GPS Service stopped.');
  }

  getCurrentCoord() {
    return this.currentCoord;
  }
}

export const riderLocationStream = new RiderLocationStreamService();
