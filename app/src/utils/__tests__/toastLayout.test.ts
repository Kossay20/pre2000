import { toastFixedPosition } from '../toastLayout';

describe('toastFixedPosition', () => {
    it('anchors the toast at the top, never at the bottom', () => {
        const pos = toastFixedPosition();
        expect(pos.top).toBe(56);
        expect(pos.left).toBe(20);
        expect(pos.right).toBe(20);
        expect(pos).not.toHaveProperty('bottom');
    });
});
