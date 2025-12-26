/**
 * Formats request payloads for the Gemini RPC protocol.
 * This is the counterpart to gemini_parser.ts, which parses the responses.
 *
 * Real request format observed from the API:
 * f.req=[null,"[[message,0,null,null,null,null,0],[\"en\"],[conv_id,resp_id,choice_id,...],token,...]"]
 * at=NONCE
 *
 * The inner payload is a stringified array containing:
 * - Message array: [message, 0, null, null, null, null, 0]
 * - Language array: ["en"]
 * - Context array: [conv_id, resp_id, choice_id, null, null, null, null, null, null, session_token]
 * - Additional metadata fields
 */

export interface GeminiRequestOptions {
	/** The message content to send */
	message: string;
	/** Optional system prompt to prepend */
	systemPrompt?: string;
	/** Optional conversation ID for continuing a chat */
	conversationId?: string;
	/** Optional response ID for continuing a chat */
	responseId?: string;
	/** Optional choice ID for continuing a chat */
	choiceId?: string;
	/** Language code, defaults to "en" */
	language?: string;
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
 * Real format: [message, 0, null, null, null, null, 0]
 */
export function buildMessageArray(message: string, systemPrompt?: string): unknown[] {
	const formattedMessage = formatMessage(message, systemPrompt);
	return [formattedMessage, 0, null, null, null, null, 0];
}

/**
 * Builds the context array for conversation continuity.
 * Real format: [conv_id, resp_id, choice_id, null, null, null, null, null, null, ""]
 * For new conversations, most fields can be empty/null.
 */
export function buildContextArray(options: GeminiRequestOptions): unknown[] {
	const conversationId = options.conversationId || "";
	const responseId = options.responseId || null;
	const choiceId = options.choiceId || null;

	// Minimal context for new conversation
	// Real requests have many more fields, but these are the essential ones
	return [conversationId, responseId, choiceId, null, null, null, null, null, null, ""];
}

/**
 * Builds the inner payload array structure.
 * Real format: [[message,0,null,null,null,null,0],["lang"],[context...],...]
 */
export function buildInnerPayload(options: GeminiRequestOptions): string {
	const messageArray = buildMessageArray(options.message, options.systemPrompt);
	const languageArray = [options.language || "en"];
	const contextArray = buildContextArray(options);

	// The real payload has many more fields after these, but we include the essential ones
	// Additional null/empty fields are added to match the expected structure
	const payload = [messageArray, languageArray, contextArray, "", "", null, [], 0, [], 0, null, null, null, 0];

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
export function buildGeminiSearchParams(bl: string): URLSearchParams {
	const params = new URLSearchParams();
	params.append("bl", bl);
	params.append("_reqid", Math.floor(Math.random() * 100000).toString());
	params.append("rt", "c");
	return params;
}
