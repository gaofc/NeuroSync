import React, { useState, useEffect, useCallback, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import '../types'; // Import types for side effects

interface PiPContainerProps {
  children: ReactNode;
  pipWindow: Window | null;
  setPipWindow: (win: Window | null) => void;
}

export const PiPContainer: React.FC<PiPContainerProps> = ({ children, pipWindow, setPipWindow }) => {
  const [containerEl, setContainerEl] = useState<HTMLElement | null>(null);

  const copyStyles = useCallback((targetDoc: Document) => {
    // 1. Copy Tailwind CDN
    const script = document.querySelector('script[src*="tailwindcss"]');
    if (script) {
        const newScript = targetDoc.createElement('script');
        newScript.src = (script as HTMLScriptElement).src;
        targetDoc.head.appendChild(newScript);
    }

    // 2. Copy other styles
    Array.from(document.styleSheets).forEach((styleSheet) => {
      try {
        if (styleSheet.href) {
            const newLink = targetDoc.createElement('link');
            newLink.rel = 'stylesheet';
            newLink.href = styleSheet.href;
            targetDoc.head.appendChild(newLink);
        } else if (styleSheet.cssRules) {
            const newStyle = targetDoc.createElement('style');
            Array.from(styleSheet.cssRules).forEach(rule => {
                newStyle.appendChild(targetDoc.createTextNode(rule.cssText));
            });
            targetDoc.head.appendChild(newStyle);
        }
      } catch (e) {
        // console.warn('Could not copy stylesheet:', e);
      }
    });
  }, []);

  useEffect(() => {
    if (!pipWindow) return;

    const pipDoc = pipWindow.document;
    
    // NOTE: Browsers do not currently support true OS-level transparency for PiP windows.
    // We use a deep radial gradient to simulate a "lit" glass or holographic screen effect.
    pipDoc.body.style.margin = '0';
    pipDoc.body.style.overflow = 'hidden';
    
    // Deep Blue/Black Gradient - "Cyber Void"
    pipDoc.body.style.background = 'radial-gradient(circle at center, #172554 0%, #020617 100%)'; 
    
    const newContainer = pipDoc.createElement('div');
    newContainer.id = 'pip-root';
    
    // CHANGED: Use inline styles for absolute sizing to ensure the container fills the window completely.
    // Removed 'flex items-center justify-center' which was constraining the child's growth.
    // We use 'display: block' and 'width: 100vw', 'height: 100vh' to guarantee full viewport coverage.
    newContainer.style.width = '100vw';
    newContainer.style.height = '100vh';
    newContainer.style.overflow = 'hidden';
    newContainer.style.display = 'block';
    
    // Tailwind classes as fallback/utility
    newContainer.className = 'bg-transparent';
    
    pipDoc.body.appendChild(newContainer);
    setContainerEl(newContainer);

    copyStyles(pipDoc);

    return () => {
      setContainerEl(null);
    };
  }, [pipWindow, copyStyles]);

  if (pipWindow && containerEl) {
    return createPortal(children, containerEl);
  }

  return <>{children}</>;
};

export const usePiPWindow = () => {
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    if ('documentPictureInPicture' in window) {
      setIsSupported(true);
    }
  }, []);

  const togglePiP = useCallback(async (width = 600, height = 400) => {
    if (pipWindow) {
      pipWindow.close();
      setPipWindow(null);
      return;
    }

    if (!window.documentPictureInPicture) {
      alert("Document Picture-in-Picture API is not supported in this browser.");
      return;
    }

    try {
      const win = await window.documentPictureInPicture.requestWindow({
        width,
        height,
        disallowReturnToOpener: true, // Hide the "Back to tab" overlay
      });

      win.addEventListener("pagehide", () => {
        setPipWindow(null);
      });

      setPipWindow(win);
    } catch (err) {
      console.error("Failed to open PiP window:", err);
    }
  }, [pipWindow]);

  return { pipWindow, setPipWindow, togglePiP, isSupported };
};