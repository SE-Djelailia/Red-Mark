// Haptic feedback utilities for mobile devices

export const haptics = {
  /**
   * Light impact - for selections, toggles
   */
  light: () => {
    if ("vibrate" in navigator) {
      navigator.vibrate(10);
    }
  },

  /**
   * Medium impact - for navigation, confirmations
   */
  medium: () => {
    if ("vibrate" in navigator) {
      navigator.vibrate(20);
    }
  },

  /**
   * Heavy impact - for important actions, errors
   */
  heavy: () => {
    if ("vibrate" in navigator) {
      navigator.vibrate(30);
    }
  },

  /**
   * Success pattern - for successful operations
   */
  success: () => {
    if ("vibrate" in navigator) {
      navigator.vibrate([10, 50, 10]);
    }
  },

  /**
   * Error pattern - for errors or warnings
   */
  error: () => {
    if ("vibrate" in navigator) {
      navigator.vibrate([30, 50, 30, 50, 30]);
    }
  },

  /**
   * Selection changed - for checkboxes, radio buttons
   */
  selectionChanged: () => {
    if ("vibrate" in navigator) {
      navigator.vibrate(5);
    }
  },

  /**
   * Check if device supports haptic feedback
   */
  isSupported: (): boolean => {
    return "vibrate" in navigator;
  },
};

export default haptics;
