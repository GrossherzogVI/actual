import { useTranslation } from 'react-i18next';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { v4 as uuidv4 } from 'uuid';

import { send } from 'loot-core/platform/client/connection';
import type {
  GlobalPrefs,
  MetadataPrefs,
  SyncedPrefs,
} from 'loot-core/types/prefs';

import { prefQueries } from './queries';

import { addNotification } from '@desktop-client/notifications/notificationsSlice';
import { useDispatch } from '@desktop-client/redux';
import type { AppDispatch } from '@desktop-client/redux/store';

function dispatchErrorNotification(
  dispatch: AppDispatch,
  message: string,
  error?: Error,
) {
  dispatch(
    addNotification({
      notification: {
        id: uuidv4(),
        type: 'error',
        message,
        pre: error ? error.message : undefined,
      },
    }),
  );
}

type SaveMetadataPrefsPayload = MetadataPrefs;

export function useSaveMetadataPrefsMutation() {
  const queryClient = useQueryClient();
  const dispatch = useDispatch();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async (metadataPrefs: SaveMetadataPrefsPayload) => {
      const existing = await queryClient.ensureQueryData(
        prefQueries.listMetadata(),
      );

      const prefsToSave = diff(metadataPrefs, existing);

      if (Object.keys(prefsToSave).length > 0) {
        await send('save-prefs', prefsToSave);
      }

      return prefsToSave;
    },
    onSuccess: changedPrefs => {
      if (changedPrefs && Object.keys(changedPrefs).length > 0) {
        queryClient.setQueryData(
          prefQueries.listMetadata().queryKey,
          oldData => {
            return oldData
              ? {
                  ...oldData,
                  ...changedPrefs,
                }
              : oldData;
          },
        );

        // Invalidate individual pref caches in case any components are subscribed to those directly
        // const queryKeys = Object.keys(changedPrefs).map(
        //   prefName =>
        //     prefQueries.detailMetadata(prefName as keyof MetadataPrefs)
        //       .queryKey,
        // );
        // queryKeys.forEach(key => invalidateQueries(queryClient, key));
      }
    },
    onError: error => {
      console.error('Error saving metadata preferences:', error);
      dispatchErrorNotification(
        dispatch,
        t(
          'There was an error saving the metadata preferences. Please try again.',
        ),
        error,
      );
      throw error;
    },
  });
}

type SaveGlobalPrefsPayload = GlobalPrefs;

export function useSaveGlobalPrefsMutation() {
  const queryClient = useQueryClient();
  const dispatch = useDispatch();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async (globalPrefs: SaveGlobalPrefsPayload) => {
      const existing = await queryClient.ensureQueryData(
        prefQueries.listGlobal(),
      );

      const prefsToSave = diff(globalPrefs, existing);

      if (Object.keys(prefsToSave).length > 0) {
        await send('save-global-prefs', prefsToSave);
      }

      return prefsToSave;
    },
    onSuccess: changedPrefs => {
      if (changedPrefs && Object.keys(changedPrefs).length > 0) {
        queryClient.setQueryData(prefQueries.listGlobal().queryKey, oldData => {
          return oldData
            ? {
                ...oldData,
                ...changedPrefs,
              }
            : oldData;
        });

        // Invalidate individual pref caches in case any components are subscribed to those directly
        // const queryKeys = Object.keys(changedPrefs).map(
        //   prefName =>
        //     prefQueries.detailGlobal(prefName as keyof GlobalPrefs).queryKey,
        // );
        // queryKeys.forEach(key => invalidateQueries(queryClient, key));
      }
    },
    onError: error => {
      console.error('Error saving global preferences:', error);
      dispatchErrorNotification(
        dispatch,
        t(
          'There was an error saving the global preferences. Please try again.',
        ),
        error,
      );
      throw error;
    },
  });
}

type SaveSyncedPrefsPayload = SyncedPrefs;

export function useSaveSyncedPrefsMutation() {
  const queryClient = useQueryClient();
  const dispatch = useDispatch();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async (syncedPrefs: SaveSyncedPrefsPayload) => {
      const existing = await queryClient.ensureQueryData(
        prefQueries.listSynced(),
      );

      const prefsToSave = diff(syncedPrefs, existing);

      if (Object.keys(prefsToSave).length > 0) {
        await Promise.all(
          Object.entries(prefsToSave).map(([syncedPrefName, value]) =>
            send('preferences/save', {
              id: syncedPrefName as keyof SyncedPrefs,
              value,
            }),
          ),
        );
      }

      return prefsToSave;
    },
    onSuccess: changedPrefs => {
      if (changedPrefs && Object.keys(changedPrefs).length > 0) {
        queryClient.setQueryData(prefQueries.listSynced().queryKey, oldData => {
          return oldData
            ? {
                ...oldData,
                ...changedPrefs,
              }
            : oldData;
        });

        // Invalidate individual pref caches in case any components are subscribed to those directly
        // const queryKeys = Object.keys(changedPrefs).map(
        //   prefName =>
        //     prefQueries.detailSynced(prefName as keyof SyncedPrefs).queryKey,
        // );
        // queryKeys.forEach(key => invalidateQueries(queryClient, key));
      }
    },
    onError: error => {
      console.error('Error saving synced preferences:', error);
      dispatchErrorNotification(
        dispatch,
        t(
          'There was an error saving the synced preferences. Please try again.',
        ),
        error,
      );
      throw error;
    },
  });
}

// type SaveServerPrefsPayload = ServerPrefs;

// export function useSaveServerPrefsMutation() {
//   const queryClient = useQueryClient();
//   const dispatch = useDispatch();
//   const { t } = useTranslation();

//   return useMutation({
//     mutationFn: async (serverPrefs: SaveServerPrefsPayload) => {
//       const result = await send('save-server-prefs', {
//         prefs: serverPrefs,
//       });
//       if (result && 'error' in result) {
//         return { error: result.error };
//       }
//     },
//     onSuccess: () => invalidateQueries(queryClient, prefQueries.listServer().queryKey),
//     onError: error => {
//       console.error('Error saving server preferences:', error);
//       dispatchErrorNotification(
//         dispatch,
//         t(
//           'There was an error saving the server preferences. Please try again.',
//         ),
//         error,
//       );
//       throw error;
//     },
//   });
// }

function diff<T extends object>(
  incoming: T,
  existing?: T | null,
): Partial<T> {
  const changed: Partial<T> = {};
  for (const [key, value] of Object.entries(incoming) as Array<
    [keyof T, T[keyof T]]
  >) {
    if (!existing || existing[key] !== value) {
      (changed as Record<keyof T, T[keyof T]>)[key] = value;
    }
  }
  return changed;
}
