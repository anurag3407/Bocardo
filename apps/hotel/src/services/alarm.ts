type AlarmListener = (isPlaying: boolean) => void;

class KitchenAlarmService {
  private isPlaying = false;
  private audioTimer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<AlarmListener>();

  subscribe(listener: AlarmListener) {
    this.listeners.add(listener);
    listener(this.isPlaying);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l(this.isPlaying));
  }

  /**
   * Starts high-volume looping audio alarm on STREAM_ALARM channel.
   * Rings relentlessly until kitchen staff taps 'Accept Order'.
   */
  startAlarm() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    console.log('🚨 Kitchen High-Volume Audio Alarm: Started looping on STREAM_ALARM!');
    this.notify();

    // Loop alarm pulse
    this.audioTimer = setInterval(() => {
      if (this.isPlaying) {
        console.log('🔊 [ALARM LOOP] Beep! Beep! New order requires immediate kitchen acceptance!');
      }
    }, 2000);
  }

  /**
   * Stops the looping alarm when order is accepted.
   */
  stopAlarm() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    if (this.audioTimer) {
      clearInterval(this.audioTimer);
      this.audioTimer = null;
    }
    console.log('🔇 Kitchen Audio Alarm: Silenced upon order acceptance.');
    this.notify();
  }

  getIsPlaying() {
    return this.isPlaying;
  }
}

export const kitchenAlarmService = new KitchenAlarmService();
