import { useEffect, useRef, useState, useCallback } from 'react';
import { useViewportInfo } from './useViewportInfo';

interface PerformanceMetrics {
  messageCount: number;
  averageRenderTime: number;
  memoryUsage: number;
  scrollPerformance: number;
  isHighPerformanceDevice: boolean;
}

interface PerformanceOptions {
  enableMetrics?: boolean;
  messageVirtualizationThreshold?: number;
  performanceMonitoringInterval?: number;
}

const DEFAULT_OPTIONS: PerformanceOptions = {
  enableMetrics: true,
  messageVirtualizationThreshold: 50,
  performanceMonitoringInterval: 5000
};

/**
 * Mobile performance optimization hook for chat applications
 * Features: performance monitoring, virtualization, memory management, scroll optimization
 */
export function useMobilePerformance(options: PerformanceOptions = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { width, height, isKeyboardVisible } = useViewportInfo();

  // Performance state
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    messageCount: 0,
    averageRenderTime: 0,
    memoryUsage: 0,
    scrollPerformance: 100,
    isHighPerformanceDevice: true
  });

  // Refs for performance tracking
  const renderTimesRef = useRef<number[]>([]);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const virtualizedMessagesRef = useRef<Set<string>>(new Set());
  const lastScrollTimeRef = useRef<number>(Date.now());
  const performanceObserverRef = useRef<PerformanceObserver | null>(null);

  // Detect device performance capability
  const detectDevicePerformance = useCallback(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

    let score = 0;

    // CPU cores (more cores = better performance)
    if ('hardwareConcurrency' in navigator) {
      score += (navigator.hardwareConcurrency || 2) * 10;
    }

    // Memory (if available)
    if ('deviceMemory' in navigator) {
      score += (navigator.deviceMemory || 4) * 15;
    }

    // WebGL support (indicates GPU capability)
    if (gl) {
      score += 30;
    }

    // Screen resolution (lower resolution = better performance on mobile)
    const pixelCount = width * height;
    if (pixelCount < 500000) score += 20; // Low resolution
    else if (pixelCount < 1000000) score += 10; // Medium resolution

    // Connection speed
    if ('connection' in navigator) {
      const conn = (navigator as any).connection;
      if (conn.effectiveType === '4g') score += 15;
      else if (conn.effectiveType === '3g') score += 5;
    }

    const isHighPerformance = score >= 70;

    return { isHighPerformance, score };
  }, [width, height]);

  // Monitor scroll performance
  const monitorScrollPerformance = useCallback(() => {
    const now = Date.now();
    const timeSinceLastScroll = now - lastScrollTimeRef.current;
    lastScrollTimeRef.current = now;

    // Update scroll performance metric (higher is better)
    const scrollPerformance = Math.max(0, Math.min(100, 100 - timeSinceLastScroll / 10));

    setMetrics(prev => ({
      ...prev,
      scrollPerformance
    }));
  }, []);

  // Setup performance monitoring
  useEffect(() => {
    if (!opts.enableMetrics) return;

    // Detect initial device performance
    const { isHighPerformanceDevice } = detectDevicePerformance();
    setMetrics(prev => ({ ...prev, isHighPerformanceDevice }));

    // Monitor memory usage if available
    const updateMemoryUsage = () => {
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        const usedMemory = memory.usedJSHeapSize / (1024 * 1024); // MB

        setMetrics(prev => ({
          ...prev,
          memoryUsage: Math.round(usedMemory * 100) / 100
        }));
      }
    };

    // Setup performance observer for render timing
    if ('PerformanceObserver' in window) {
      try {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry) => {
            if (entry.entryType === 'measure' && entry.name.includes('render')) {
              renderTimesRef.current.push(entry.duration);

              // Keep only last 10 measurements
              if (renderTimesRef.current.length > 10) {
                renderTimesRef.current.shift();
              }

              const averageRenderTime = renderTimesRef.current.reduce((a, b) => a + b, 0) / renderTimesRef.current.length;

              setMetrics(prev => ({
                ...prev,
                averageRenderTime: Math.round(averageRenderTime * 100) / 100
              }));
            }
          });
        });

        observer.observe({ entryTypes: ['measure', 'navigation'] });
        performanceObserverRef.current = observer;
      } catch (error) {
        console.warn('[MOBILE_PERFORMANCE] Performance observer not supported:', error);
      }
    }

    // Update metrics periodically
    const interval = setInterval(() => {
      updateMemoryUsage();
      monitorScrollPerformance();
    }, opts.performanceMonitoringInterval);

    return () => {
      clearInterval(interval);
      if (performanceObserverRef.current) {
        performanceObserverRef.current.disconnect();
      }
    };
  }, [opts.enableMetrics, opts.performanceMonitoringInterval, detectDevicePerformance, monitorScrollPerformance]);

  // Message virtualization logic
  const shouldVirtualizeMessage = useCallback((messageIndex: number, totalMessages: number) => {
    // Don't virtualize if message count is below threshold
    if (totalMessages < opts.messageVirtualizationThreshold!) {
      return false;
    }

    // On low-performance devices, be more aggressive with virtualization
    const virtualizationWindow = metrics.isHighPerformanceDevice ? 20 : 10;

    // Check if message is within visible window (with some buffer)
    const buffer = 5;
    const start = Math.max(0, totalMessages - virtualizationWindow - buffer);
    const end = totalMessages + buffer;

    return messageIndex < start || messageIndex > end;
  }, [metrics.isHighPerformanceDevice, opts.messageVirtualizationThreshold]);

  // Optimize scroll container
  const optimizeScrollContainer = useCallback((container: HTMLElement | null) => {
    if (!container) return;

    scrollContainerRef.current = container;

    // Enable hardware acceleration
    container.style.transform = 'translateZ(0)';
    container.style.willChange = 'transform';

    // Optimize touch scrolling for mobile
    container.style.webkitOverflowScrolling = 'touch';
    container.style.overflowScrolling = 'touch';

    // Add scroll listener for performance monitoring
    let scrollTimeout: NodeJS.Timeout;
    const handleScroll = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(monitorScrollPerformance, 100);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, [monitorScrollPerformance]);

  // Debounced function for expensive operations
  const debounce = useCallback(<T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void => {
    let timeout: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  }, []);

  // Throttled function for frequent events
  const throttle = useCallback(<T extends (...args: any[]) => any>(
    func: T,
    limit: number
  ): (...args: Parameters<T>) => void => {
    let inThrottle: boolean;
    return (...args: Parameters<T>) => {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }, []);

  // Cleanup function for unmounting
  const cleanup = useCallback(() => {
    virtualizedMessagesRef.current.clear();
    renderTimesRef.current = [];
    if (performanceObserverRef.current) {
      performanceObserverRef.current.disconnect();
    }
  }, []);

  // Auto-cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    metrics,
    shouldVirtualizeMessage,
    optimizeScrollContainer,
    debounce,
    throttle,
    cleanup,
    isHighPerformanceDevice: metrics.isHighPerformanceDevice,
    scrollContainerRef
  };
}