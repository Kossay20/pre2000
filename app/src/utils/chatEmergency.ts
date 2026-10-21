/**
 * When the chat keeps the emergency call action pinned above the input.
 *
 * The call button lives inside the red-flag reply, at the very end of the list. The
 * list scrolled to the end before that reply had finished laying out, so on a phone
 * the "URGENCE" title showed while the call button sat under the suggestion chips and
 * the input. Pinning the call action while the conversation is on an emergency means it
 * cannot be scrolled or laid out out of reach.
 */

export interface ChatMessageLike {
    sender: 'user' | 'bot';
    data?: { type?: string; redFlag?: { severity?: string } } | null;
}

/**
 * True while the latest bot ANSWER is an emergency red flag. Her own follow-up message
 * (waiting for the next reply) keeps it pinned; a network error or the rate-limit notice
 * is not an answer and does not unpin it; the next real answer that is not an emergency
 * does. The welcome message carries no data and never counts.
 */
export const shouldPinEmergencyCall = (messages: readonly ChatMessageLike[]): boolean => {
    for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m.sender !== 'bot' || !m.data || m.data.type === 'error') continue;
        return m.data.type === 'red_flag' && m.data.redFlag?.severity === 'emergency';
    }
    return false;
};

/**
 * Where the chat list should rest after a new message lays out.
 *
 * Always the end, except for a long ANSWER: scrolling to the end of a reply taller than
 * the list left the reader in its last lines, with her own question cut off under the
 * disclaimer. A long answer is anchored so her question sits at the top of the list and
 * the reply starts right under it. That includes a red-flag reply (the emergency call is
 * pinned above the input while it is on screen, so it no longer needs the list to rest on
 * the end; resting there hid her own bubble under the disclaimer strip). Only an error
 * keeps the end.
 */
export type ChatScrollTarget = 'end' | { index: number };

// A reply taller than this share of the list no longer fits next to the question.
const LONG_REPLY_SHARE = 0.6;

export const chatScrollTarget = (
    messages: readonly ChatMessageLike[],
    lastMessageHeight: number,
    listHeight: number,
): ChatScrollTarget => {
    const last = messages[messages.length - 1];
    const prev = messages[messages.length - 2];
    if (!last || last.sender !== 'bot' || !prev || prev.sender !== 'user') return 'end';
    if (last.data?.type === 'error') return 'end';
    if (!(lastMessageHeight > 0) || !(listHeight > 0)) return 'end';
    return lastMessageHeight > listHeight * LONG_REPLY_SHARE
        ? { index: messages.length - 2 }
        : 'end';
};
