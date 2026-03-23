class DebugLogger {
    private static pendingMessages: string[] = [];
    private static timer: any = null;
    private static isShowing = false;

    private static isReactNative(): boolean {
        return typeof navigator !== 'undefined' && navigator.product === 'ReactNative';
    }

    static async showBuffer() {
        if (this.pendingMessages.length === 0 || this.isShowing) return;

        try {
            const { Alert, Platform } = require('react-native');
            if (Platform.OS !== 'android') {
                // Keep messages for manual check if needed
                return;
            }

            this.isShowing = true;
            const messages = [...this.pendingMessages];

            const fullMessage = messages.join('\n\n');

            await new Promise<void>((resolve) => {
                Alert.alert(
                    `Debug Summary (${messages.length} events)`,
                    fullMessage,
                    [{ text: 'Vider', style: 'destructive', onPress: () => {
                        this.pendingMessages = [];
                        resolve();
                    } }, { text: 'Fermer', onPress: () => resolve() }],
                    { onDismiss: () => resolve() }
                );
            });
        } catch (e) {
            console.error('DebugLogger failed to show alert', e);
        } finally {
            this.isShowing = false;
        }
    }

    private static queueMessage(level: string, event: string, message: string) {
        const timestamp = new Date().toLocaleTimeString();
        const formatted = `[${timestamp}] ${level} - ${event}: ${message}`;
        this.pendingMessages.push(formatted);

        // Keep buffer manageable
        if (this.pendingMessages.length > 100) {
            this.pendingMessages.shift();
        }

        if (!this.isReactNative()) return;

        // Auto-show disabled, keeping it for manual call via UI
    }

    static log(event: string, message: string) {
        console.log(`[DEBUG] ${event}: ${message}`);
        this.queueMessage('INFO', event, message);
    }

    static error(event: string, message: string, error?: any) {
        const errorMsg = error ? `${message} (${error.message || error})` : message;
        console.error(`[DEBUG ERROR] ${event}: ${errorMsg}`, error);
        this.queueMessage('ERROR', event, errorMsg);
    }
}

export default DebugLogger;
