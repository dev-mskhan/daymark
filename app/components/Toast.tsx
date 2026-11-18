/**
 * Task 8.53: Success toast with celebration icon
 */

import { useEffect } from 'react';
import { CheckCircle, X, WarningCircle, Info } from '@phosphor-icons/react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  message: string;
  type?: ToastType;
  duration?: number;
  onClose: () => void;
}

export function Toast({ message, type = 'success', duration = 4000, onClose }: ToastProps) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const icons = {
    success: <CheckCircle size={24} weight="fill" className="celebration-icon" />,
    error: <WarningCircle size={24} weight="fill" />,
    warning: <WarningCircle size={24} weight="fill" />,
    info: <Info size={24} weight="fill" />,
  };

  return (
    <div className={`toast toast--${type} success-toast`} role="alert">
      <div className="toast-icon">{icons[type]}</div>
      <div className="toast-message">{message}</div>
      <button
        type="button"
        className="toast-close"
        onClick={onClose}
        aria-label="Close notification"
      >
        <X size={18} weight="bold" />
      </button>
    </div>
  );
}
