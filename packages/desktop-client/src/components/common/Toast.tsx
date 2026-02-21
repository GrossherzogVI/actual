import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';
import { css, keyframes } from '@emotion/css';

type ToastAction = {
  label: string;
  onPress: () => void;
};

type ToastType = 'info' | 'success' | 'error';

type ToastOptions = {
  action?: ToastAction;
  duration?: number;
  type?: ToastType;
};

type ToastItem = ToastOptions & {
  id: string;
  message: string;
  exiting: boolean;
};

type ToastContextValue = {
  show: (message: string, options?: ToastOptions) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const slideUp = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const fadeOut = keyframes`
  from { opacity: 1; }
  to   { opacity: 0; }
`;

const DEFAULT_DURATION = 5000;
const EXIT_DURATION = 250; // ms for fade-out animation

function typeColor(type: ToastType | undefined): string {
  if (type === 'success') return '#10b981';
  if (type === 'error') return '#ef4444';
  return theme.toastBackground;
}

type SingleToastProps = {
  item: ToastItem;
  onDismiss: (id: string) => void;
};

function SingleToast({ item, onDismiss }: SingleToastProps) {
  const { t } = useTranslation();
  const bg = typeColor(item.type);

  return (
    <View
      className={css({
        animation: item.exiting
          ? `${fadeOut} ${EXIT_DURATION}ms ease forwards`
          : `${slideUp} 200ms ease`,
        background: bg,
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
        color: theme.toastText,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        minWidth: 240,
        maxWidth: 420,
        marginTop: 8,
      })}
    >
      <Text
        style={{
          color: theme.toastText,
          fontSize: 14,
          flex: 1,
          lineHeight: '1.4',
        }}
      >
        {item.message}
      </Text>

      {item.action && (
        <Button
          variant="bare"
          onPress={() => {
            item.action!.onPress();
            onDismiss(item.id);
          }}
          style={{
            color: theme.toastText,
            fontWeight: 600,
            fontSize: 13,
            padding: '2px 6px',
            borderRadius: 4,
            opacity: 0.9,
            whiteSpace: 'nowrap',
          }}
        >
          {item.action.label}
        </Button>
      )}
    </View>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    // Start exit animation
    setToasts(prev =>
      prev.map(t => (t.id === id ? { ...t, exiting: true } : t)),
    );
    // Remove after animation
    const remove = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      timers.current.delete(id);
    }, EXIT_DURATION);
    timers.current.set(id + '-exit', remove);
  }, []);

  const show = useCallback(
    (message: string, options?: ToastOptions) => {
      const id = crypto.randomUUID();
      const duration = options?.duration ?? DEFAULT_DURATION;

      setToasts(prev => [
        ...prev,
        { id, message, exiting: false, ...options },
      ]);

      const timer = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      timers.current.forEach(t => clearTimeout(t));
    };
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}

      {/* Portal-like fixed overlay at bottom-center */}
      <View
        style={{
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          pointerEvents: 'none',
        }}
      >
        {toasts.map(item => (
          <View key={item.id} style={{ pointerEvents: 'auto' }}>
            <SingleToast item={item} onDismiss={dismiss} />
          </View>
        ))}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside <ToastProvider>');
  }
  return ctx;
}
