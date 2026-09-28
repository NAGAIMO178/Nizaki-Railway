// Web Push API & Service Worker Integration Helper

export interface NotificationPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

let swRegistration: ServiceWorkerRegistration | null = null;

/**
 * Register Service Worker for Web Push notifications
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    console.warn('Service Worker is not supported in this environment.');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('./sw.js', {
      scope: './',
    });
    swRegistration = registration;
    console.log('Service Worker registered successfully:', registration.scope);
    return registration;
  } catch (error) {
    console.error('Service Worker registration failed:', error);
    return null;
  }
}

/**
 * Check if the browser is running on iOS (iPhone/iPad)
 */
export function isIOSBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Check if the app is currently running in standalone (PWA) mode
 */
export function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

/**
 * Check if Web Notification is supported
 */
export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * Get current browser notification permission state
 */
export function getNotificationPermissionState(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) {
    return 'unsupported';
  }
  try {
    return Notification.permission;
  } catch {
    return 'unsupported';
  }
}

/**
 * Request notification permission from browser user
 */
export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!isNotificationSupported()) {
    return 'unsupported';
  }

  try {
    // Ensure service worker is registered first
    await registerServiceWorker();

    if (typeof Notification.requestPermission === 'function') {
      const permission = await Notification.requestPermission();
      return permission;
    }
    return Notification.permission;
  } catch (error) {
    console.warn('Error requesting notification permission:', error);
    try {
      return Notification.permission;
    } catch {
      return 'unsupported';
    }
  }
}

/**
 * Send a real browser push notification using Service Worker or Notification API
 */
export async function sendLocalPushNotification(payload: NotificationPayload): Promise<boolean> {
  if (!isNotificationSupported()) {
    return false;
  }

  let currentPermission: NotificationPermission | 'unsupported' = 'unsupported';
  try {
    currentPermission = Notification.permission;
  } catch {
    return false;
  }

  if (currentPermission === 'default') {
    currentPermission = await requestNotificationPermission();
  }

  if (currentPermission !== 'granted') {
    return false;
  }

  // 1. Primary Method: Service Worker Registration showNotification (supported on desktop & mobile Chrome/Android)
  try {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      if (!swRegistration) {
        swRegistration = await registerServiceWorker();
      }

      // Check active registration or await ready state
      let activeReg = swRegistration && swRegistration.active ? swRegistration : null;
      if (!activeReg) {
        try {
          activeReg = await Promise.race([
            navigator.serviceWorker.ready,
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 800)),
          ]);
        } catch {
          activeReg = null;
        }
      }

      if (activeReg && typeof activeReg.showNotification === 'function') {
        await activeReg.showNotification(payload.title, {
          body: payload.body,
          icon: './icon.png',
          badge: './icon.png',
          tag: payload.tag || 'kanzaki-railway',
          data: { url: payload.url || './' },
          vibrate: [200, 100, 200],
        } as NotificationOptions);
        return true;
      }
    }
  } catch (swError) {
    console.warn('Service Worker notification failed, attempting desktop fallback:', swError);
  }

  // 2. Fallback Method: Standard Desktop Notification constructor (guarded against Android Chrome / iframe Illegal constructor)
  try {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const NotificationCtor = window.Notification;
      if (typeof NotificationCtor === 'function') {
        try {
          new NotificationCtor(payload.title, {
            body: payload.body,
            icon: './icon.png',
            tag: payload.tag || 'kanzaki-railway',
          });
          return true;
        } catch (ctorError) {
          // In Android Chrome, iOS WebViews, and sandboxed iframes, new Notification throws TypeError: Illegal constructor
          console.warn('Notification constructor unsupported or prohibited in this context:', ctorError);
          return false;
        }
      }
    }
  } catch (fallbackError) {
    console.warn('Notification dispatch fallback was suppressed:', fallbackError);
    return false;
  }

  return false;
}
