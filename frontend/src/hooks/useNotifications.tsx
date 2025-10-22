import { useState, useEffect, useCallback } from 'react';

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      console.warn('Notifications not supported');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    const result = await Notification.requestPermission();
    setPermission(result);
    return result === 'granted';
  }, []);

  const showNotification = useCallback(
    (title: string, options?: NotificationOptions) => {
      if (Notification.permission !== 'granted') {
        console.warn('Notification permission not granted');
        return null;
      }

      return new Notification(title, {
        icon: '/favicon.ico', // Update with your app icon
        badge: '/favicon.ico',
        ...options,
      });
    },
    []
  );

  return {
    permission,
    isGranted: permission === 'granted',
    isDenied: permission === 'denied',
    requestPermission,
    showNotification,
  };
}