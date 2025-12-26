import { describe, expect, test } from "bun:test";
import { parseGeminiResponse } from "../src/providers/gemini_parser";

describe("Gemini Parser", () => {
    describe("XSSI prefix handling", () => {
        test("strips )]}' prefix from response", () => {
            const response = `)]}'\n[["wrb.fr",null,"[null,null,null,null,[[\\\"rc_1\\\",[\\\"Hello\\\"]]]]"]]`;
            const result = parseGeminiResponse(response);
            expect(result).not.toStartWith(")]}");
        });

        test("handles response without XSSI prefix", () => {
            const response = `[["wrb.fr",null,"[null,null,null,null,[[\\\"rc_1\\\",[\\\"Hello\\\"]]]]"]]`;
            const result = parseGeminiResponse(response);
            expect(result).toBeDefined();
        });
    });

    describe("length-prefixed chunks", () => {
        test("skips numeric length prefix lines", () => {
            const response = `)]}'\n\n107\n[["wrb.fr",null,"[null,null,null,null,[[\\\"rc_1\\\",[\\\"Test\\\"]]]]"]]`;
            const result = parseGeminiResponse(response);
            expect(result).toBe("Test");
        });

        test("handles multiple length-prefixed chunks", () => {
            const response = `)]}'\n\n50\n[["wrb.fr",null,"[null,null,null,null,[[\\\"rc_1\\\",[\\\"Hello\\\"]]]]"]]\n25\n[["e",4,null,null,143]]`;
            const result = parseGeminiResponse(response);
            expect(result).toBe("Hello");
        });
    });

    describe("wrb.fr response structure", () => {
        test("extracts text from standard response structure", () => {
            // Structure: ["wrb.fr", RPC_NAME, PAYLOAD_STR, ...]
            // Payload: [null, [conv_id, resp_id], null, null, [[choice_id, [TEXT]]]]
            const payload = JSON.stringify([null, ["c_123", "r_456"], null, null, [["rc_choice", ["Extracted text"]]]]);
            const response = `)]}'\n[["wrb.fr",null,${JSON.stringify(payload)}]]`;
            const result = parseGeminiResponse(response);
            expect(result).toBe("Extracted text");
        });

        test("handles null RPC name for chat responses", () => {
            const payload = JSON.stringify([null, ["c_id", "r_id"], null, null, [["rc_id", ["Chat response"]]]]);
            const response = `)]}'\n[["wrb.fr",null,${JSON.stringify(payload)}]]`;
            const result = parseGeminiResponse(response);
            expect(result).toBe("Chat response");
        });

        test("handles named RPC for other calls", () => {
            // PCck7e, aPya6c, etc. have different payload structures
            // Parser should still work (though may not find text content)
            const response = `)]}'\n[["wrb.fr","PCck7e","[]",null,null,null,"generic"]]`;
            const result = parseGeminiResponse(response);
            expect(result).toBeDefined();
        });
    });

    describe("candidates extraction", () => {
        test("extracts first candidate text", () => {
            const payload = [null, ["c", "r"], null, null, [["choice1", ["First candidate"]], ["choice2", ["Second candidate"]]]];
            const response = `)]}'\n[["wrb.fr",null,${JSON.stringify(JSON.stringify(payload))}]]`;
            const result = parseGeminiResponse(response);
            expect(result).toBe("First candidate");
        });

        test("handles empty candidates array", () => {
            const payload = [null, ["c", "r"], null, null, []];
            const response = `)]}'\n[["wrb.fr",null,${JSON.stringify(JSON.stringify(payload))}]]`;
            const result = parseGeminiResponse(response);
            // Falls back to raw text
            expect(result).toBeDefined();
        });

        test("handles missing candidates field", () => {
            const payload = [null, ["c", "r"], null, null];
            const response = `)]}'\n[["wrb.fr",null,${JSON.stringify(JSON.stringify(payload))}]]`;
            const result = parseGeminiResponse(response);
            expect(result).toBeDefined();
        });
    });

    describe("text content handling", () => {
        test("preserves multiline text", () => {
            const text = "Line 1\nLine 2\nLine 3";
            const payload = [null, null, null, null, [["rc", [text]]]];
            const response = `)]}'\n[["wrb.fr",null,${JSON.stringify(JSON.stringify(payload))}]]`;
            const result = parseGeminiResponse(response);
            expect(result).toBe(text);
        });

        test("preserves special characters", () => {
            const text = 'Code: `const x = 1;` and "quotes" and <html> & entities';
            const payload = [null, null, null, null, [["rc", [text]]]];
            const response = `)]}'\n[["wrb.fr",null,${JSON.stringify(JSON.stringify(payload))}]]`;
            const result = parseGeminiResponse(response);
            expect(result).toBe(text);
        });

        test("preserves unicode characters", () => {
            const text = "Hello 你好 مرحبا 👋 🎉";
            const payload = [null, null, null, null, [["rc", [text]]]];
            const response = `)]}'\n[["wrb.fr",null,${JSON.stringify(JSON.stringify(payload))}]]`;
            const result = parseGeminiResponse(response);
            expect(result).toBe(text);
        });

        test("handles escaped quotes in text", () => {
            const text = 'My "assignment" is to help';
            const payload = [null, null, null, null, [["rc", [text]]]];
            const response = `)]}'\n[["wrb.fr",null,${JSON.stringify(JSON.stringify(payload))}]]`;
            const result = parseGeminiResponse(response);
            expect(result).toBe(text);
        });

        test("handles markdown formatting", () => {
            const text = "**Bold** and *italic* and `code`\n\n- List item\n- Another item";
            const payload = [null, null, null, null, [["rc", [text]]]];
            const response = `)]}'\n[["wrb.fr",null,${JSON.stringify(JSON.stringify(payload))}]]`;
            const result = parseGeminiResponse(response);
            expect(result).toBe(text);
        });
    });

    describe("error handling", () => {
        test("returns raw text for invalid JSON", () => {
            const response = `)]}'\nnot valid json`;
            const result = parseGeminiResponse(response);
            expect(result).toBe("not valid json");
        });

        test("returns raw text for unexpected structure", () => {
            const response = `)]}'\n{"unexpected": "format"}`;
            const result = parseGeminiResponse(response);
            expect(result).toContain("unexpected");
        });

        test("handles empty response", () => {
            const result = parseGeminiResponse("");
            expect(result).toBe("");
        });

        test("handles only XSSI prefix", () => {
            const result = parseGeminiResponse(")]}'");
            expect(result).toBe("");
        });
    });

    describe("real-world streaming responses", () => {
        test("parses early streaming chunk with partial text", () => {
            const payload = [null, ["c_223d949670c9e5ef", "r_8a7bd47aa356eb72"], null, null, [["rc_choice", ["My \"assignment\" is to"]]]];
            const response = `)]}'\n893\n[["wrb.fr",null,${JSON.stringify(JSON.stringify(payload))}]]`;
            const result = parseGeminiResponse(response);
            expect(result).toBe('My "assignment" is to');
        });

        test("parses final streaming chunk with complete text", () => {
            const fullText = 'My "assignment" is to be your intellectual thought partner.';
            const payload = [null, ["c_223d949670c9e5ef", "r_8a7bd47aa356eb72"], null, null, [["rc_choice", [fullText]]]];
            const response = `)]}'\n1234\n[["wrb.fr",null,${JSON.stringify(JSON.stringify(payload))}]]`;
            const result = parseGeminiResponse(response);
            expect(result).toBe(fullText);
        });

        test("parses response with metadata chunks", () => {
            // Real responses often have multiple chunks with different purposes
            const payload = [null, ["c_id", "r_id"], null, null, [["rc", ["Hello world"]]]];
            const response = `)]}'\n100\n[["wrb.fr",null,${JSON.stringify(JSON.stringify(payload))}]]\n60\n[["di",3402],["af.httprm",3401,"-12345",26]]\n28\n[["e",27,null,null,51737]]`;
            const result = parseGeminiResponse(response);
            expect(result).toBe("Hello world");
        });

        test("parses PCck7e auxiliary RPC response", () => {
            const response = `)]}'\n\n107\n[["wrb.fr","PCck7e","[]",null,null,null,"generic"],["di",317],["af.httprm",317,"4859437413626184299",24]]\n25\n[["e",4,null,null,143]]`;
            const result = parseGeminiResponse(response);
            // PCck7e has empty payload "[]", so parser returns fallback
            expect(result).toBeDefined();
        });

        test("parses aPya6c auxiliary RPC response", () => {
            const response = `)]}'\n\n116\n[["wrb.fr","aPya6c","[false,0,[]]",null,null,null,"generic"],["di",86],["af.httprm",86,"-12345",25]]\n25\n[["e",4,null,null,152]]`;
            const result = parseGeminiResponse(response);
            expect(result).toBeDefined();
        });

        test("parses ESY5D settings RPC response", () => {
            const response = `)]}'\n\n130\n[["wrb.fr","ESY5D","[[null,null,null,null,true]]",null,null,null,"generic"],["di",99],["af.httprm",98,"12345",25]]\n25\n[["e",4,null,null,166]]`;
            const result = parseGeminiResponse(response);
            expect(result).toBeDefined();
        });
    });

    describe("fallback behavior", () => {
        test("returns cleaned text when structure not found", () => {
            const response = `)]}'\nSome plain text response`;
            const result = parseGeminiResponse(response);
            expect(result).toBe("Some plain text response");
        });

        test("strips XSSI prefix even on fallback", () => {
            const response = `)]}'\nFallback text`;
            const result = parseGeminiResponse(response);
            expect(result).not.toContain(")]}'");
        });
    });
});
