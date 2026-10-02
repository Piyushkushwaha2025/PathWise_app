import { create } from 'zustand';
import * as Notifications from 'expo-notifications';
import { uploadPdf, createAssignment, createNotification, AssignmentData, NotificationData } from '../lib/db';

export interface UploadTask {
  id: string;
  type: 'assignment' | 'announcement';
  title: string;
  sectionCode?: string;
}

interface UploadStoreState {
  currentUpload: UploadTask | null;
  isUploading: boolean;
  lastCompletedType: 'assignment' | 'announcement' | null;
  lastCompletedAt: number;
  uploadError: string | null;

  publishAssignmentInBackground: (params: {
    userId: string;
    title: string;
    subject: string;
    description: string;
    dueDate: Date;
    pdfFile: { uri: string; name: string; type: string; size?: number } | null;
    sectionCode?: string;
  }) => Promise<void>;

  publishAnnouncementInBackground: (params: {
    userId: string;
    title: string;
    message: string;
    expiresAt: string;
    sectionCode: string;
    docFile: { uri: string; name: string; type?: string; size?: number } | null;
  }) => Promise<void>;
}

export const useUploadStore = create<UploadStoreState>((set, get) => ({
  currentUpload: null,
  isUploading: false,
  lastCompletedType: null,
  lastCompletedAt: 0,
  uploadError: null,

  publishAssignmentInBackground: async ({
    userId,
    title,
    subject,
    description,
    dueDate,
    pdfFile,
    sectionCode,
  }) => {
    const taskId = 'assign_' + Date.now();
    const task: UploadTask = {
      id: taskId,
      type: 'assignment',
      title,
      sectionCode,
    };

    set({
      currentUpload: task,
      isUploading: true,
      uploadError: null,
    });

    let notifId: string | null = null;
    try {
      // 1. Trigger sticky phone system notification
      notifId = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Uploading Assignment... 📤',
          body: `Publishing "${title}" in background`,
          data: { taskId, type: 'assignment' },
          sound: false,
          priority: Notifications.AndroidNotificationPriority.HIGH,
          sticky: true,
        },
        trigger: null,
      });
    } catch (e) {
      console.warn('Could not schedule ongoing upload notification', e);
    }

    try {
      // 2. Perform file upload if attachment present
      let pdf_key: string | undefined;
      let pdf_filename: string | undefined;

      if (pdfFile) {
        const uploaded = await uploadPdf(userId, pdfFile);
        pdf_key = uploaded.pdf_key;
        pdf_filename = uploaded.pdf_filename;
      }

      // 3. Create assignment in backend
      await createAssignment(userId, {
        title: title.trim(),
        subject: subject.trim(),
        description: description.trim(),
        dueDate: dueDate.toISOString(),
        pdf_key,
        pdf_filename,
        section_code: sectionCode,
      });

      // 4. Dismiss ongoing notification and pop completion notification
      if (notifId) {
        await Notifications.dismissNotificationAsync(notifId).catch(() => {});
      }

      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Assignment Published! 🚀',
          body: `"${title}" is now live for your class!`,
          sound: 'ting.mp3',
          priority: Notifications.AndroidNotificationPriority.MAX,
        },
        trigger: null,
      }).catch(() => {});

      set({
        currentUpload: null,
        isUploading: false,
        lastCompletedType: 'assignment',
        lastCompletedAt: Date.now(),
        uploadError: null,
      });
    } catch (error: any) {
      console.error('Background assignment upload failed:', error);
      if (notifId) {
        await Notifications.dismissNotificationAsync(notifId).catch(() => {});
      }

      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Assignment Upload Failed ⚠️',
          body: `Could not publish "${title}": ${error?.message || 'Network error'}`,
          sound: 'mario_death.mp3',
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null,
      }).catch(() => {});

      set({
        currentUpload: null,
        isUploading: false,
        uploadError: error?.message || 'Failed to upload assignment',
      });
    }
  },

  publishAnnouncementInBackground: async ({
    userId,
    title,
    message,
    expiresAt,
    sectionCode,
    docFile,
  }) => {
    const taskId = 'notif_' + Date.now();
    const task: UploadTask = {
      id: taskId,
      type: 'announcement',
      title,
      sectionCode,
    };

    set({
      currentUpload: task,
      isUploading: true,
      uploadError: null,
    });

    let notifId: string | null = null;
    try {
      // 1. Trigger sticky phone system notification
      notifId = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Publishing Announcement... 📢',
          body: `Publishing "${title}" in background`,
          data: { taskId, type: 'announcement' },
          sound: false,
          priority: Notifications.AndroidNotificationPriority.HIGH,
          sticky: true,
        },
        trigger: null,
      });
    } catch (e) {
      console.warn('Could not schedule ongoing announcement notification', e);
    }

    try {
      // 2. Perform document upload if attached
      let pdf_key: string | undefined;
      let pdf_filename: string | undefined;

      if (docFile) {
        const uploaded = await uploadPdf(userId, docFile as any);
        pdf_key = uploaded.pdf_key;
        pdf_filename = uploaded.pdf_filename;
      }

      // 3. Create notification in backend
      await createNotification(
        userId,
        title.trim(),
        message.trim(),
        expiresAt,
        sectionCode,
        pdf_key,
        pdf_filename
      );

      // 4. Dismiss ongoing notification and pop completion notification
      if (notifId) {
        await Notifications.dismissNotificationAsync(notifId).catch(() => {});
      }

      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Announcement Published! 📢',
          body: `"${title}" has been shared with your class!`,
          sound: 'ting.mp3',
          priority: Notifications.AndroidNotificationPriority.MAX,
        },
        trigger: null,
      }).catch(() => {});

      set({
        currentUpload: null,
        isUploading: false,
        lastCompletedType: 'announcement',
        lastCompletedAt: Date.now(),
        uploadError: null,
      });
    } catch (error: any) {
      console.error('Background announcement upload failed:', error);
      if (notifId) {
        await Notifications.dismissNotificationAsync(notifId).catch(() => {});
      }

      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Announcement Failed ⚠️',
          body: `Could not publish "${title}": ${error?.message || 'Network error'}`,
          sound: 'mario_death.mp3',
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null,
      }).catch(() => {});

      set({
        currentUpload: null,
        isUploading: false,
        uploadError: error?.message || 'Failed to publish announcement',
      });
    }
  },
}));
