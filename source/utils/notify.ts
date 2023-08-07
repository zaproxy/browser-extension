import Browser, {Notifications} from 'webextension-polyfill';
import {
  ZEST_CLIENT_ELEMENT_CLICK,
  ZEST_CLIENT_ELEMENT_SEND_KEYS,
  ZEST_CLIENT_SWITCH_TO_FRAME,
} from './constants';

function clearNotification(notifyId: string): void {
  setTimeout(() => {
    Browser.notifications.clear(notifyId);
  }, 2000);
}

export const raiseNotification = async (data: string): Promise<void> => {
  try {
    let title: string;
    let message: string;
    const statement = JSON.parse(data);
    switch (statement.elementType) {
      case ZEST_CLIENT_ELEMENT_CLICK:
        title = 'Click Recorded';
        message = `Path Type: ${statement.type} Element: ${statement.element}`;
        break;
      case ZEST_CLIENT_ELEMENT_SEND_KEYS:
        title = `Input Recorded -> ${statement.value}`;
        message = `Path Type: ${statement.type} Element: ${statement.element}`;
        break;
      case ZEST_CLIENT_SWITCH_TO_FRAME:
        title = 'Frame Switch Recorded';
        message = `Frame Index: ${statement.frameIndex}`;
        break;
      default:
        // Don't raise notifcation
        return;
    }
    const options: Notifications.CreateNotificationOptions = {
      type: 'basic',
      title,
      iconUrl: '../assets/icons/zap32x32.png',
      message,
    };

    const notifyId = await Browser.notifications.create(options);
    clearNotification(notifyId);
  } catch (e) {
    console.log(e);
  }
};
