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
