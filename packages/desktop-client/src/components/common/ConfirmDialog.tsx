import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: 'destructive' | 'default';
  onConfirm: () => void;
};

/**
 * Reusable confirmation dialog.
 * Replaces all `window.confirm()` calls across the app.
 *
 * Uses shadcn Dialog (Radix) — no Redux modal registration needed.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  confirmLabel,
  variant = 'default',
  onConfirm,
}: Props) {
  const { t } = useTranslation();

  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
            <Button
              variant="bare"
              onPress={() => onOpenChange(false)}
            >
              <Trans>Cancel</Trans>
            </Button>
            <Button
              variant={variant === 'destructive' ? 'bare' : 'primary'}
              onPress={handleConfirm}
              style={
                variant === 'destructive'
                  ? { backgroundColor: theme.errorText, color: theme.buttonPrimaryText }
                  : undefined
              }
            >
              {confirmLabel ?? t('Confirm')}
            </Button>
          </View>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
