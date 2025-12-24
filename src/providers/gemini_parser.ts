/**
 * Parses the raw RPC response from Gemini.
 * The format typically starts with `)]}'` followed by newline-delimited JSON or length-prefixed JSON.
 * Example structure:
 * )]}'
 * 123
 * [["wrb.fr", ...]]
 */
export function parseGeminiResponse(text: string): string {
	// 1. Strip XSSI prefix
	let cleanText = text;
	if (text.startsWith(")]}'")) {
		cleanText = text.substring(4).trimStart();
	}

	// 2. Parse the stream
	// The stream is a series of parsed JSON arrays.
	// We'll try to find valid JSON blocks.
	// Since it's length prefixed (often), we can try to split by finding the length-like lines
	// or just regex for the JSON arrays.

	// A simple heuristic is that each chunk starts on a new line and is a valid JSON array.
	// However, the length prefix might be on its own line.

	const lines = cleanText.split("\n");
	const chunks: any[] = [];

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		// Skip length prefixes (numeric lines)
		if (/^\d+$/.test(trimmed)) continue;

		try {
			const parsed = JSON.parse(trimmed);
			chunks.push(parsed);
		} catch (e) {
			// Not valid JSON, maybe part of a stream or partial line?
			// For now, ignore invalid lines.
		}
	}

	// 3. Extract text
	for (const chunk of chunks) {
		// Look for the array that contains "wrb.fr"
		// Structure: [["wrb.fr", null, "STRINGIFIED_JSON", ...]]
		const inner = chunk[0];
		if (Array.isArray(inner) && inner[0] === "wrb.fr") {
			const payloadStr = inner[2];
			if (typeof payloadStr === "string") {
				try {
					const payload = JSON.parse(payloadStr);
					// Payload structure: [null, [conv_id, resp_id], null, null, candidates_array, ...]
					// candidates_array: [[candidate_id, ["TEXT_RESPONSE"], ...]]

					const candidates = payload[4];
					if (Array.isArray(candidates) && candidates.length > 0) {
						const firstCandidate = candidates[0];
						if (Array.isArray(firstCandidate) && firstCandidate.length > 1) {
							const textParts = firstCandidate[1];
							if (Array.isArray(textParts) && textParts.length > 0) {
								return textParts[0];
							}
						}
					}
				} catch (e) {
					console.error("Failed to parse inner payload:", e);
				}
			}
		}
	}

	return cleanText; // Fallback to raw text if parsing fails to find the structure
}
