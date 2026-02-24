import { useEffect } from 'react';

import * as Platform from 'loot-core/shared/platform';

import { useFeatureFlag } from '@desktop-client/hooks/useFeatureFlag';
import { useNavigate } from '@desktop-client/hooks/useNavigate';

export function GlobalKeys() {
  const navigate = useNavigate();
  const financeOS = useFeatureFlag('financeOS');

  useEffect(() => {
    const handleKeys = (e: KeyboardEvent) => {
      // ⌘N: Quick Add — must work in browser mode, so handle before the isBrowser gate
      if (financeOS && (e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent('quick-add-open'));
        return;
      }

      // ?: Keyboard shortcut sheet — works everywhere
      if (financeOS && e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = e.target as HTMLElement;
        const tag = target?.tagName?.toLowerCase();
        if (tag !== 'input' && tag !== 'textarea' && !target?.isContentEditable) {
          e.preventDefault();
          document.dispatchEvent(new CustomEvent('shortcut-sheet-toggle'));
          return;
        }
      }

      if (Platform.isBrowser) {
        return;
      }

      if (e.metaKey) {
        // financeOS mode: keys 1-9 (+0) map to the command-center layout
        if (financeOS) {
          switch (e.key) {
            case '1':
              void navigate('/dashboard');
              break;
            case '2':
              void navigate('/accounts');
              break;
            case '3':
              void navigate('/ops');
              break;
            case '4':
              void navigate('/contracts');
              break;
            case '5':
              void navigate('/calendar');
              break;
            case '6':
              void navigate('/budget');
              break;
            case '7':
              void navigate('/reports');
              break;
            case '8':
              void navigate('/import');
              break;
            case '9':
              void navigate('/review');
              break;
            case '0':
              void navigate('/settings');
              break;
            case ',':
              if (Platform.OS === 'mac') {
                void navigate('/settings');
              }
              break;
            default:
          }
          return;
        }

        // Default mode shortcuts
        switch (e.key) {
          case '1':
            void navigate('/budget');
            break;
          case '2':
            void navigate('/reports');
            break;
          case '3':
            void navigate('/accounts');
            break;
          case ',':
            if (Platform.OS === 'mac') {
              void navigate('/settings');
            }
            break;
          default:
        }
      }
    };

    document.addEventListener('keydown', handleKeys);

    return () => document.removeEventListener('keydown', handleKeys);
  }, [navigate, financeOS]);

  return null;
}
