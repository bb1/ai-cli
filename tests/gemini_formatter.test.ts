import { describe, expect, test } from "bun:test";
import {
    formatMessage,
    buildMessageArray,
    buildContextArray,
    buildInnerPayload,
    buildFReq,
    formatGeminiRequestBody,
    buildGeminiSearchParams,
    type GeminiRequestOptions,
} from "../src/providers/gemini_formatter";
import { parseGeminiResponse } from "../src/providers/gemini_parser";

describe("Gemini Formatter", () => {
    describe("formatMessage", () => {
        test("returns message as-is when no system prompt", () => {
            const result = formatMessage("Hello, world!");
            expect(result).toBe("Hello, world!");
        });

        test("combines system prompt and message when system prompt provided", () => {
            const result = formatMessage("Hello!", "You are a helpful assistant.");
            expect(result).toBe("SYSTEM:\nYou are a helpful assistant.\n\nUSER:\nHello!");
        });

        test("handles empty system prompt", () => {
            const result = formatMessage("Hello!", "");
            expect(result).toBe("Hello!");
        });

        test("handles multiline messages", () => {
            const result = formatMessage("Line 1\nLine 2", "System\nPrompt");
            expect(result).toBe("SYSTEM:\nSystem\nPrompt\n\nUSER:\nLine 1\nLine 2");
        });
    });

    describe("buildMessageArray", () => {
        test("builds message array with correct structure", () => {
            const result = buildMessageArray("Hello");
            expect(result).toEqual(["Hello"]);
        });

        test("builds message array with system prompt", () => {
            const result = buildMessageArray("Hello", "Be helpful");
            expect(result[0]).toBe("SYSTEM:\nBe helpful\n\nUSER:\nHello");
            expect(result.length).toBe(1);
        });
    });

    describe("buildContextArray", () => {
        test("builds context with null values for new conversation", () => {
            const options: GeminiRequestOptions = { message: "Hello" };
            const result = buildContextArray(options);

            expect(result[0]).toBeNull(); // conversationId
            expect(result[1]).toBeNull(); // responseId
            expect(result[2]).toBeNull(); // choiceId
            expect(result.length).toBe(3);
        });

        test("builds context with conversation IDs", () => {
            const options: GeminiRequestOptions = {
                message: "Continue",
                conversationId: "c_123",
                responseId: "r_456",
                choiceId: "rc_789",
            };
            const result = buildContextArray(options);

            expect(result[0]).toBe("c_123");
            expect(result[1]).toBe("r_456");
            expect(result[2]).toBe("rc_789");
            expect(result.length).toBe(3);
        });
    });

    describe("buildInnerPayload", () => {
        test("builds payload with correct structure", () => {
            const options: GeminiRequestOptions = { message: "Hello" };
            const result = buildInnerPayload(options);
            const parsed = JSON.parse(result);

            expect(parsed).toBeArray();
            expect(parsed.length).toBe(3);
            // Message array at index 0: [prompt]
            expect(parsed[0]).toEqual(["Hello"]);
            // Null at index 1
            expect(parsed[1]).toBeNull();
            // Context array at index 2: [cid, rid, rcid]
            expect(parsed[2]).toEqual([null, null, null]);
        });

        test("builds payload with conversation context", () => {
            const options: GeminiRequestOptions = {
                message: "Continue",
                conversationId: "c_test123",
                responseId: "r_test456",
                choiceId: "rc_test789",
            };
            const result = buildInnerPayload(options);
            const parsed = JSON.parse(result);

            expect(parsed[0]).toEqual(["Continue"]);
            expect(parsed[1]).toBeNull();
            expect(parsed[2][0]).toBe("c_test123");
            expect(parsed[2][1]).toBe("r_test456");
            expect(parsed[2][2]).toBe("rc_test789");
        });
    });

    describe("buildFReq", () => {
        test("wraps inner payload in outer array", () => {
            const options: GeminiRequestOptions = { message: "Test" };
            const result = buildFReq(options);
            const parsed = JSON.parse(result);

            expect(parsed).toBeArray();
            expect(parsed.length).toBe(2);
            expect(parsed[0]).toBeNull();
            expect(typeof parsed[1]).toBe("string");

            // Inner payload should be valid JSON
            const innerParsed = JSON.parse(parsed[1]);
            expect(innerParsed[0][0]).toBe("Test"); // message at [0][0]
        });
    });

    describe("formatGeminiRequestBody", () => {
        test("formats body with f.req and at parameters", () => {
            const options: GeminiRequestOptions = { message: "Hello" };
            const result = formatGeminiRequestBody(options, "test-nonce-123");

            expect(result).toContain("f.req=");
            expect(result).toContain("&at=test-nonce-123");
        });

        test("URL-encodes the f.req parameter", () => {
            const options: GeminiRequestOptions = { message: "Hello & Goodbye" };
            const result = formatGeminiRequestBody(options, "nonce");

            const parts = result.split("&at=");
            expect(parts.length).toBe(2);
            expect(parts[0].startsWith("f.req=")).toBe(true);
            expect(parts[0]).not.toContain("&");
        });

        test("can decode the f.req back to original structure", () => {
            const options: GeminiRequestOptions = {
                message: "Test message",
                systemPrompt: "System prompt",
            };
            const result = formatGeminiRequestBody(options, "nonce123");

            const fReqMatch = result.match(/f\.req=([^&]+)/);
            expect(fReqMatch).not.toBeNull();

            const decoded = decodeURIComponent(fReqMatch![1]);
            const parsed = JSON.parse(decoded);
            const innerPayload = JSON.parse(parsed[1]);

            expect(innerPayload[0][0]).toBe("SYSTEM:\nSystem prompt\n\nUSER:\nTest message");
        });
    });

    describe("buildGeminiSearchParams", () => {
        test("includes bl parameter", () => {
            const params = buildGeminiSearchParams("test-version");
            expect(params.get("bl")).toBe("test-version");
        });

        test("includes _reqid parameter as numeric string", () => {
            const params = buildGeminiSearchParams("test");
            const reqid = params.get("_reqid");
            expect(reqid).not.toBeNull();
            expect(Number.parseInt(reqid!)).toBeLessThan(1000000);
            expect(Number.parseInt(reqid!)).toBeGreaterThanOrEqual(0);
        });

        test("includes hl parameter for language", () => {
            const params = buildGeminiSearchParams("test", "de");
            expect(params.get("hl")).toBe("de");
        });

        test("defaults hl to en", () => {
            const params = buildGeminiSearchParams("test");
            expect(params.get("hl")).toBe("en");
        });

        test("includes rt=c parameter", () => {
            const params = buildGeminiSearchParams("test");
            expect(params.get("rt")).toBe("c");
        });

        test("generates different _reqid on each call", () => {
            const reqids = new Set<string>();
            for (let i = 0; i < 10; i++) {
                reqids.add(buildGeminiSearchParams("test").get("_reqid")!);
            }
            expect(reqids.size).toBeGreaterThan(1);
        });
    });
});

describe("Formatter and Parser Integration", () => {
    /**
     * Creates a mock Gemini response matching the real streaming format.
     * Real format: ["wrb.fr", null, "PAYLOAD", null, null, null, "generic"]
     * where PAYLOAD contains candidates at index 4.
     */
    function createMockGeminiResponse(responseText: string, convId = "c_123", respId = "r_456"): string {
        // Real payload structure from streaming response
        const payload = [null, [convId, respId], null, null, [["rc_choice", [responseText]]]];
        const payloadStr = JSON.stringify(payload);

        // Real response uses null for RPC name in chat responses
        const outer = [["wrb.fr", null, payloadStr]];
        const outerStr = JSON.stringify(outer);

        return `)]}'\n${outerStr.length}\n${outerStr}`;
    }

    test("parser correctly extracts text from mock response", () => {
        const mockResponse = createMockGeminiResponse("Hello from Gemini!");
        const result = parseGeminiResponse(mockResponse);
        expect(result).toBe("Hello from Gemini!");
    });

    test("request message can be echoed back through mock response", () => {
        const originalMessage = "What is 2+2?";
        const options: GeminiRequestOptions = { message: originalMessage };
        const requestBody = formatGeminiRequestBody(options, "test-nonce");

        const fReqMatch = requestBody.match(/f\.req=([^&]+)/);
        const decoded = decodeURIComponent(fReqMatch![1]);
        const parsed = JSON.parse(decoded);
        const innerPayload = JSON.parse(parsed[1]);
        const sentMessage = innerPayload[0][0]; // message is at [0][0] in new format

        expect(sentMessage).toBe(originalMessage);

        const mockResponse = createMockGeminiResponse(`You asked: ${originalMessage}`);
        const responseText = parseGeminiResponse(mockResponse);
        expect(responseText).toBe(`You asked: ${originalMessage}`);
    });

    test("system prompt is properly formatted in request", () => {
        const options: GeminiRequestOptions = {
            message: "Hello",
            systemPrompt: "You are a math tutor",
        };
        const requestBody = formatGeminiRequestBody(options, "nonce");

        const fReqMatch = requestBody.match(/f\.req=([^&]+)/);
        const decoded = decodeURIComponent(fReqMatch![1]);
        const parsed = JSON.parse(decoded);
        const innerPayload = JSON.parse(parsed[1]);
        const sentMessage = innerPayload[0][0];

        expect(sentMessage).toBe("SYSTEM:\nYou are a math tutor\n\nUSER:\nHello");
    });

    test("conversation context is preserved in request format", () => {
        const options: GeminiRequestOptions = {
            message: "Continue our chat",
            conversationId: "c_conversation-abc",
            responseId: "r_response-xyz",
            choiceId: "rc_choice-123",
        };
        const requestBody = formatGeminiRequestBody(options, "nonce");

        const fReqMatch = requestBody.match(/f\.req=([^&]+)/);
        const decoded = decodeURIComponent(fReqMatch![1]);
        const parsed = JSON.parse(decoded);
        const innerPayload = JSON.parse(parsed[1]);
        const contextArray = innerPayload[2]; // context is at index 2

        expect(contextArray[0]).toBe("c_conversation-abc");
        expect(contextArray[1]).toBe("r_response-xyz");
        expect(contextArray[2]).toBe("rc_choice-123");
    });

    test("parser handles multiline response text", () => {
        const multilineText = "Line 1\nLine 2\nLine 3";
        const mockResponse = createMockGeminiResponse(multilineText);
        const result = parseGeminiResponse(mockResponse);
        expect(result).toBe(multilineText);
    });

    test("parser handles special characters in response", () => {
        const specialText = 'Code: `const x = 1;` and "quotes" and <html>';
        const mockResponse = createMockGeminiResponse(specialText);
        const result = parseGeminiResponse(mockResponse);
        expect(result).toBe(specialText);
    });

    test("parser handles unicode in response", () => {
        const unicodeText = "Hello 你好 مرحبا 👋";
        const mockResponse = createMockGeminiResponse(unicodeText);
        const result = parseGeminiResponse(mockResponse);
        expect(result).toBe(unicodeText);
    });
});

describe("Real-world API Format Tests", () => {
    describe("Parser with real API responses", () => {
        test("parses real streaming response chunk", () => {
            // Simplified version of a real streaming chunk
            const realChunk = `)]}'\n\n893\n[["wrb.fr",null,"[null,[\\"c_223d949670c9e5ef\\",\\"r_8a7bd47aa356eb72\\"],null,null,[[\\"rc_6a7d9fccc258786b\\",[\\"My \\\\\\"assignment\\\\\\" is to\\"],null,null,null,null,true,null,[1],\\"en\\"]]]"]]`;
            const result = parseGeminiResponse(realChunk);
            expect(result).toBeDefined();
        });

        test("parses PCck7e RPC response", () => {
            const realResponse = `)]}'\n\n107\n[["wrb.fr","PCck7e","[]",null,null,null,"generic"],["di",317],["af.httprm",317,"4859437413626184299",24]]\n25\n[["e",4,null,null,143]]`;
            const result = parseGeminiResponse(realResponse);
            expect(result).toBeDefined();
        });

        test("parses aPya6c RPC response", () => {
            const realResponse = `)]}'\n\n116\n[["wrb.fr","aPya6c","[false,0,[]]",null,null,null,"generic"],["di",86],["af.httprm",86,"-1479886261386544582",25]]\n25\n[["e",4,null,null,152]]`;
            const result = parseGeminiResponse(realResponse);
            expect(result).toBeDefined();
        });

        test("correctly strips XSSI prefix from real responses", () => {
            const realResponse = `)]}'\n\n107\n[["wrb.fr","PCck7e","[]",null,null,null,"generic"]]`;
            const result = parseGeminiResponse(realResponse);
            expect(result).not.toStartWith(")]}");
        });
    });

    describe("Request format verification", () => {
        test("request format matches python-gemini-api structure", () => {
            // Format: [null, "[[prompt], null, [cid, rid, rcid]]"]
            const options: GeminiRequestOptions = { message: "What is your assignment?" };
            const fReq = buildFReq(options);
            const parsed = JSON.parse(fReq);

            // Outer: [null, "stringified_inner"]
            expect(parsed[0]).toBeNull();
            expect(typeof parsed[1]).toBe("string");

            // Inner structure: [[prompt], null, [cid, rid, rcid]]
            const inner = JSON.parse(parsed[1]);
            expect(inner.length).toBe(3);
            // [0] = message array: [msg]
            expect(inner[0]).toEqual(["What is your assignment?"]);
            // [1] = null
            expect(inner[1]).toBeNull();
            // [2] = context array: [null, null, null] for new conversation
            expect(inner[2]).toEqual([null, null, null]);
        });

        test("document real request format structure - PCck7e", () => {
            const realFReq = '[[["PCck7e","[\\"r_e0343c7d3f963e0d\\"]",null,"generic"]]]';
            const parsed = JSON.parse(realFReq);

            expect(parsed[0][0][0]).toBe("PCck7e");
            expect(parsed[0][0][1]).toBe('["r_e0343c7d3f963e0d"]');
            expect(parsed[0][0][3]).toBe("generic");
        });
    });

    describe("Response format analysis", () => {
        test("response wrb.fr structure has null RPC name for chat", () => {
            // Real chat response: ["wrb.fr", null, "PAYLOAD"]
            const realResponseChunk = '[["wrb.fr",null,"[null,[\\"c_id\\",\\"r_id\\"]]"]]';
            const parsed = JSON.parse(realResponseChunk);

            expect(parsed[0][0]).toBe("wrb.fr");
            expect(parsed[0][1]).toBeNull(); // null for chat, RPC name for other calls
            expect(typeof parsed[0][2]).toBe("string"); // Payload is stringified
        });

        test("chat response payload structure", () => {
            // Real payload: [null, [conv_id, resp_id], null, null, [[choice_id, [text]]]]
            const payloadStr = '[null,["c_123","r_456"],null,null,[["rc_choice",["Hello world"]]]]';
            const payload = JSON.parse(payloadStr);

            expect(payload[0]).toBeNull();
            expect(payload[1][0]).toBe("c_123"); // conversation ID
            expect(payload[1][1]).toBe("r_456"); // response ID
            expect(payload[4][0][0]).toBe("rc_choice"); // choice ID
            expect(payload[4][0][1][0]).toBe("Hello world"); // actual text
        });

        test("parser extracts text from real payload structure", () => {
            // Construct response using real structure
            const payload = [null, ["c_test", "r_test"], null, null, [["rc_test", ["Test response text"]]]];
            const outer = [["wrb.fr", null, JSON.stringify(payload)]];
            const response = `)]}'\n${JSON.stringify(outer).length}\n${JSON.stringify(outer)}`;

            const result = parseGeminiResponse(response);
            expect(result).toBe("Test response text");
        });
    });

    describe("Real chat message format", () => {
        test("request body structure matches real API", () => {
            const options: GeminiRequestOptions = {
                message: "What is your assignment?",
                conversationId: "c_223d949670c9e5ef",
                responseId: "r_e0343c7d3f963e0d",
                choiceId: "rc_a8d1bcd6f1a8b59a",
            };
            const body = formatGeminiRequestBody(options, "APwZiao5vdDJgMNysDG7yjXFWAhc:1766763052133");

            expect(body).toStartWith("f.req=");
            expect(body).toContain("&at=APwZiao5vdDJgMNysDG7yjXFWAhc:1766763052133");

            // Decode and verify structure
            const fReqMatch = body.match(/f\.req=([^&]+)/);
            const decoded = decodeURIComponent(fReqMatch![1]);
            const parsed = JSON.parse(decoded);

            expect(parsed[0]).toBeNull();

            const inner = JSON.parse(parsed[1]);
            expect(inner[0][0]).toBe("What is your assignment?");
            expect(inner[1]).toBeNull();
            expect(inner[2][0]).toBe("c_223d949670c9e5ef");
            expect(inner[2][1]).toBe("r_e0343c7d3f963e0d");
            expect(inner[2][2]).toBe("rc_a8d1bcd6f1a8b59a");
        });
    });
});
