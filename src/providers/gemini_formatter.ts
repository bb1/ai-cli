/**
 * Formats request payloads for the Gemini RPC protocol.
 * This is the counterpart to gemini_parser.ts, which parses the responses.
 *
 * Based on the working python-gemini-api library format:
 * f.req=[null,"[[prompt], null, [cid, rid, rcid]]"]
 * at=NONCE
 *
 * The inner payload is a stringified array containing:
 * - Message array: [prompt] for new messages, or [prompt, 0, null, [[[image_data, 1]]]] with images
 * - null (placeholder)
 * - Context array: [conversationId, responseId, choiceId] for conversation continuity
 */

export interface GeminiRequestOptions {
    /** The message content to send */
    message: string;
    /** Optional system prompt to prepend */
    systemPrompt?: string;
    /** Optional conversation ID for continuing a chat */
    conversationId?: string | null;
    /** Optional response ID for continuing a chat */
    responseId?: string | null;
    /** Optional choice ID (rcid) for continuing a chat */
    choiceId?: string | null;
}

/**
 * Formats the message content, combining system prompt and user message.
 */
export function formatMessage(message: string, systemPrompt?: string): string {
    if (systemPrompt) {
        return `SYSTEM:\n${systemPrompt}\n\nUSER:\n${message}`;
    }
    return message;
}

/**
 * Builds the message array portion of the payload.
 * Format: [prompt] for simple text messages
 */
export function buildMessageArray(message: string, systemPrompt?: string): unknown[] {
    const formattedMessage = formatMessage(message, systemPrompt);
    return [formattedMessage];
}

/**
 * Builds the context array for conversation continuity.
 * Format: [conversationId, responseId, choiceId]
 * For new conversations, all values are null.
 */
export function buildContextArray(options: GeminiRequestOptions): (string | null)[] {
    return [
        options.conversationId ?? null,
        options.responseId ?? null,
        options.choiceId ?? null,
    ];
}

/**
 * Builds the inner payload array structure.
 * Format: [[prompt], null, [cid, rid, rcid]]
 */
export function buildInnerPayload(options: GeminiRequestOptions): string {
    const messageArray = buildMessageArray(options.message, options.systemPrompt);
    const contextArray = buildContextArray(options);

    const payload = [messageArray, null, contextArray];

    return JSON.stringify(payload);
}

/**
 * Builds the complete f.req parameter value.
 * Structure: [null, innerPayloadString]
 */
export function buildFReq(options: GeminiRequestOptions): string {
    const innerPayload = buildInnerPayload(options);
    return JSON.stringify([null, innerPayload]);
}

/**
 * Formats the complete request body for the Gemini API.
 * Returns a URL-encoded string ready to be used as the POST body.
 */
export function formatGeminiRequestBody(options: GeminiRequestOptions, snlm0e: string): string {
    const fReq = buildFReq(options);
    return `f.req=${encodeURIComponent(fReq)}&at=${snlm0e}`;
}

/**
 * Builds URL search parameters for the Gemini API endpoint.
 */
export function buildGeminiSearchParams(bl: string, language = "en"): URLSearchParams {
    const params = new URLSearchParams();
    params.append("bl", bl);
    params.append("hl", language);
    params.append("_reqid", Math.floor(Math.random() * 1000000).toString());
    params.append("rt", "c");
    return params;
}
