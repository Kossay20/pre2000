import { Linking, Alert, Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import { createLogger } from '../utils/logger';
// The address the website and the privacy policy publish (see config/contact.ts for why
// support@mamabebe.app, which bounced, is no longer used).
import { SUPPORT_EMAIL } from '../config/contact';

const log = createLogger('SupportService');

export const openSupportEmail = async (t: (key: string, options?: any) => string) => {
    try {
        const subject = `[${t('common.appName')}] ${t('support.reportProblemSubject')}`;
        const body = `
${t('support.emailBodyIntro')}

--------------------------------
${t('support.deviceInfo')}:
App Version: ${Constants.expoConfig?.version || '1.0.0'}
Device: ${Device.modelName || 'Unknown'}
OS: ${Platform.OS} ${Platform.Version}
--------------------------------
`;

        const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

        try {
            const canOpen = await Linking.canOpenURL(`mailto:${SUPPORT_EMAIL}`);
            if (canOpen) {
                await Linking.openURL(url);
            } else {
                // Fallback for Simulator or devices without default mail app
                throw new Error('No mail client');
            }
        } catch (e) {
            log.warn('No mail client available, copying to clipboard instead.');
            try {
                await Clipboard.setStringAsync(SUPPORT_EMAIL);
                Alert.alert(
                    t('support.reportProblem'),
                    t('support.mailUnavailableCopied', { email: SUPPORT_EMAIL })
                );
            } catch (clipboardError) {
                Alert.alert(
                    t('common.error'),
                    t('support.pleaseWriteUs', { email: SUPPORT_EMAIL })
                );
            }
        }
    } catch (error) {
        log.error('Unexpected error opening support email:', error);
        Alert.alert(t('common.error'), t('support.genericError'));
    }
};
