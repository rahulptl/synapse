import { useEffect, useState } from 'react';

interface ViewportInfo {
  width: number;
  height: number;
  baselineHeight: number;
  isKeyboardVisible: boolean;
}

const DEFAULT_INFO: ViewportInfo = {
  width: 0,
  height: 0,
  baselineHeight: 0,
  isKeyboardVisible: false,
};

const subscribers = new Set<(info: ViewportInfo) => void>();
let currentInfo: ViewportInfo = DEFAULT_INFO;
let initialized = false;
let listenerCount = 0;

const KEYBOARD_THRESHOLD = 120; // px difference before treating viewport shrink as keyboard

const getViewportDimensions = (): { width: number; height: number } => {
  if (typeof window === 'undefined') {
    return { width: 0, height: 0 };
  }
  const viewport = window.visualViewport;
  return {
    width: viewport?.width ?? window.innerWidth,
    height: viewport?.height ?? window.innerHeight,
  };
};

const updateViewportInfo = () => {
  if (typeof window === 'undefined') return;

  const { width, height } = getViewportDimensions();
  const baselineHeight = Math.max(currentInfo.baselineHeight || height, height);
  const isKeyboardVisible = baselineHeight - height > KEYBOARD_THRESHOLD;

  currentInfo = { width, height, baselineHeight, isKeyboardVisible };

  document.documentElement.style.setProperty('--app-vh', `${height}px`);

  subscribers.forEach((callback) => callback(currentInfo));
};

const handleViewportChange = () => {
  window.requestAnimationFrame(updateViewportInfo);
};

const addListeners = () => {
  if (typeof window === 'undefined' || initialized) return;
  initialized = true;

  const viewport = window.visualViewport;
  viewport?.addEventListener('resize', handleViewportChange);
  viewport?.addEventListener('scroll', handleViewportChange);
  window.addEventListener('resize', handleViewportChange, { passive: true });

  updateViewportInfo();
};

const removeListeners = () => {
  if (typeof window === 'undefined' || !initialized) return;

  const viewport = window.visualViewport;
  viewport?.removeEventListener('resize', handleViewportChange);
  viewport?.removeEventListener('scroll', handleViewportChange);
  window.removeEventListener('resize', handleViewportChange);

  initialized = false;
};

export function useViewportInfo(): ViewportInfo {
  const [info, setInfo] = useState<ViewportInfo>(() => currentInfo);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    listenerCount += 1;
    addListeners();

    const callback = (nextInfo: ViewportInfo) => setInfo(nextInfo);
    subscribers.add(callback);

    // Ensure state reflects latest value immediately
    setInfo(currentInfo);

    return () => {
      subscribers.delete(callback);
      listenerCount = Math.max(0, listenerCount - 1);

      if (listenerCount === 0) {
        removeListeners();
        currentInfo = DEFAULT_INFO;
      }
    };
  }, []);

  return info;
}
