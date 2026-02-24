import { useTranslation } from 'react-i18next';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type ShortcutGroup = {
  title: string;
  shortcuts: Array<{ keys: string; description: string }>;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function KeyboardShortcutSheet({ open, onOpenChange }: Props) {
  const { t } = useTranslation();

  const groups: ShortcutGroup[] = [
    {
      title: t('Navigation'),
      shortcuts: [
        { keys: '⌘ D', description: t('Go to Dashboard') },
        { keys: '⌘ K', description: t('Open Command Bar') },
        { keys: '⌘ N', description: t('Quick Add Transaction') },
        { keys: '?', description: t('Show Keyboard Shortcuts') },
      ],
    },
    {
      title: t('Quick Actions'),
      shortcuts: [
        { keys: '⌘ Enter', description: t('Save + New (Quick Add)') },
        { keys: '⌘ ⇧ Enter', description: t('Save + Duplicate (Quick Add)') },
        { keys: '⌘ P', description: t('Park for Later (Quick Add)') },
        { keys: 'Escape', description: t('Close / Dismiss') },
      ],
    },
    {
      title: t('List Navigation'),
      shortcuts: [
        { keys: 'j / ↓', description: t('Next item') },
        { keys: 'k / ↑', description: t('Previous item') },
        { keys: 'Enter', description: t('Open selected') },
        { keys: 'x', description: t('Toggle selection') },
        { keys: 'd', description: t('Delete (with confirmation)') },
      ],
    },
    {
      title: t('Dashboard'),
      shortcuts: [
        { keys: 'e', description: t('Toggle edit mode') },
        { keys: 'r', description: t('Refresh data') },
      ],
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={{
          maxWidth: 520,
          maxHeight: '80vh',
          overflow: 'auto',
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('Keyboard Shortcuts')}</DialogTitle>
        </DialogHeader>

        <View style={{ gap: 20, padding: '8px 0' }}>
          {groups.map(group => (
            <View key={group.title} style={{ gap: 6 }}>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: theme.pageTextSubdued,
                }}
              >
                {group.title}
              </Text>
              {group.shortcuts.map(s => (
                <View
                  key={s.keys}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '4px 0',
                  }}
                >
                  <Text style={{ fontSize: 13, color: theme.pageText }}>
                    {s.description}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    {s.keys.split(' ').map((key, i) => (
                      <Text
                        key={i}
                        style={{
                          fontSize: 11,
                          fontFamily: 'monospace',
                          fontWeight: 500,
                          padding: '2px 6px',
                          borderRadius: 4,
                          backgroundColor: theme.tableRowBackgroundHover,
                          color: theme.pageText,
                          border: `1px solid ${theme.tableBorder}`,
                        }}
                      >
                        {key}
                      </Text>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          ))}
        </View>
      </DialogContent>
    </Dialog>
  );
}
