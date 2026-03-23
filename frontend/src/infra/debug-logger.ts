class DebugLogger {
    private static eventCounts = new Map<string, number>();
    private static MAX_ALERTS = 10;

    private static isReactNative(): boolean {
        return typeof navigator !== 'undefined' && navigator.product === 'ReactNative';
    }

    static log(event: string, message: string) {
        console.log(`[DEBUG] ${event}: ${message}`);

        if (!this.isReactNative()) return;

        try {
            const { Alert, Platform } = require('react-native');
            if (Platform.OS !== 'android') return;

            const count = (this.eventCounts.get(event) || 0) + 1;
            this.eventCounts.set(event, count);

            if (count <= this.MAX_ALERTS) {
                Alert.alert(`Debug #${count}: ${event}`, message);
            }
        } catch (e) {}
    }

    static error(event: string, message: string, error?: any) {
        const errorMsg = error ? `${message} (${error.message || error})` : message;
        console.error(`[DEBUG ERROR] ${event}: ${errorMsg}`, error);

        if (!this.isReactNative()) return;

        try {
            const { Alert, Platform } = require('react-native');
            if (Platform.OS !== 'android') return;

            const count = (this.eventCounts.get(`${event}_err`) || 0) + 1;
            this.eventCounts.set(`${event}_err`, count);

            if (count <= this.MAX_ALERTS) {
                Alert.alert(`Debug Error #${count}: ${event}`, errorMsg);
            }
        } catch (e) {}
    }
}

export default DebugLogger;
