/**
 * Bound a Promise so a hung Firestore getDoc/getDocs cannot leave a spinner forever.
 * Guest/offline web has no anonymous session; reads may neither resolve nor reject.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = 'operation timed out'): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(label)), ms);
        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (err) => {
                clearTimeout(timer);
                reject(err);
            },
        );
    });
}

export const FIRESTORE_GUEST_TIMEOUT_MS = 4000;
