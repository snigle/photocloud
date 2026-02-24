export class GlobalLock {
    private static locks = new Map<string, Promise<void>>();

    static async acquire(name: string): Promise<() => void> {
        const existing = this.locks.get(name) || Promise.resolve();
        let resolveLock: () => void;
        const next = new Promise<void>(resolve => {
            resolveLock = resolve;
        });
        this.locks.set(name, next);

        await existing;
        return resolveLock!;
    }
}
