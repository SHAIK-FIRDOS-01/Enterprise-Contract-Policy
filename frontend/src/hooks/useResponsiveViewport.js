import { useState, useEffect } from 'react';

/**
 * Institutional Responsive Viewport Hook.
 * Breakpoint contract:
 * - Desktop: >= 1280px (Persistent dual-pane)
 * - Tablet: 768px – 1279px (Tabbed/Segmented split-pane)
 * - Mobile: < 768px (Compact stack / segmented controls)
 */
export function useResponsiveViewport() {
  const getSnapshot = () => {
    const width = typeof window !== 'undefined' ? window.innerWidth : 1440;
    return {
      width,
      isMobile: width < 768,
      isTablet: width >= 768 && width < 1024,
      isCompact: width < 1024,
      isDesktop: width >= 1024,
    };
  };

  const [state, setState] = useState(getSnapshot);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      setState(getSnapshot());
    };

    window.addEventListener('resize', handleResize);
    // Initial sync
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return state;
}

export default useResponsiveViewport;
