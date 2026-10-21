/**
 * Toast chrome lives in ToastContext. Pin it to the TOP of the viewport.
 *
 * Bottom-anchored toasts (legacy `bottom: 80`) sat on top of AuthChoice's
 * "Continue as guest" CTA and the chatbot composer — a primary-path blocker
 * on web where the toast is a full-width bar.
 */
export function toastFixedPosition(): { top: number; left: number; right: number } {
    return { top: 56, left: 20, right: 20 };
}
