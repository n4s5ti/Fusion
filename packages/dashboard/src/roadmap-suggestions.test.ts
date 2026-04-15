import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  validateSuggestionInput,
  generateMilestoneSuggestions,
  ValidationError,
  ParseError,
  __resetSuggestionState,
  __setCreateKbAgent,
} from "./roadmap-suggestions";

describe("roadmap-suggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetSuggestionState();
  });

  afterEach(() => {
    __resetSuggestionState();
  });

  describe("validateSuggestionInput", () => {
    it("accepts valid input with all fields", () => {
      const input = {
        goalPrompt: "Build a modern e-commerce platform",
        count: 5,
      };

      expect(() => validateSuggestionInput(input)).not.toThrow();
    });

    it("accepts valid input without optional count", () => {
      const input = {
        goalPrompt: "Build a modern e-commerce platform",
      };

      expect(() => validateSuggestionInput(input)).not.toThrow();
    });

    it("accepts count at minimum boundary (1)", () => {
      const input = {
        goalPrompt: "Test goal",
        count: 1,
      };

      expect(() => validateSuggestionInput(input)).not.toThrow();
    });

    it("accepts count at maximum boundary (10)", () => {
      const input = {
        goalPrompt: "Test goal",
        count: 10,
      };

      expect(() => validateSuggestionInput(input)).not.toThrow();
    });

    it("rejects null input", () => {
      expect(() => validateSuggestionInput(null)).toThrow(ValidationError);
    });

    it("rejects non-object input", () => {
      expect(() => validateSuggestionInput("string")).toThrow(ValidationError);
      expect(() => validateSuggestionInput(123)).toThrow(ValidationError);
      expect(() => validateSuggestionInput([])).toThrow(ValidationError);
    });

    it("rejects missing goalPrompt", () => {
      expect(() => validateSuggestionInput({})).toThrow(ValidationError);
      expect(() => validateSuggestionInput({ count: 5 })).toThrow(ValidationError);
    });

    it("rejects non-string goalPrompt", () => {
      expect(() =>
        validateSuggestionInput({ goalPrompt: 123 })
      ).toThrow(ValidationError);
      expect(() =>
        validateSuggestionInput({ goalPrompt: null })
      ).toThrow(ValidationError);
      expect(() =>
        validateSuggestionInput({ goalPrompt: [] })
      ).toThrow(ValidationError);
    });

    it("rejects empty goalPrompt", () => {
      expect(() =>
        validateSuggestionInput({ goalPrompt: "" })
      ).toThrow(ValidationError);
      expect(() =>
        validateSuggestionInput({ goalPrompt: "   " })
      ).toThrow(ValidationError);
    });

    it("rejects goalPrompt exceeding max length", () => {
      const longPrompt = "a".repeat(4001);
      expect(() =>
        validateSuggestionInput({ goalPrompt: longPrompt })
      ).toThrow(ValidationError);
    });

    it("accepts goalPrompt at exactly max length", () => {
      const maxPrompt = "a".repeat(4000);
      expect(() =>
        validateSuggestionInput({ goalPrompt: maxPrompt })
      ).not.toThrow();
    });

    it("rejects non-integer count", () => {
      expect(() =>
        validateSuggestionInput({ goalPrompt: "Test", count: 3.5 })
      ).toThrow(ValidationError);
    });

    it("rejects count below minimum", () => {
      expect(() =>
        validateSuggestionInput({ goalPrompt: "Test", count: 0 })
      ).toThrow(ValidationError);
      expect(() =>
        validateSuggestionInput({ goalPrompt: "Test", count: -1 })
      ).toThrow(ValidationError);
    });

    it("rejects count above maximum", () => {
      expect(() =>
        validateSuggestionInput({ goalPrompt: "Test", count: 11 })
      ).toThrow(ValidationError);
    });
  });

  describe("generateMilestoneSuggestions", () => {
    const rootDir = "/test/project";

    it("generates milestone suggestions successfully", async () => {
      const mockSession = {
        prompt: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn(),
        state: {
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: '[\n  {"title": "Foundation Setup", "description": "Set up core infrastructure"},\n  {"title": "User Authentication", "description": "Implement login and user management"}\n]',
                },
              ],
            },
          ],
        },
      };

      const mockCreateKbAgent = vi.fn().mockResolvedValue({
        session: mockSession,
      });

      __setCreateKbAgent(mockCreateKbAgent);

      const suggestions = await generateMilestoneSuggestions(
        "Build a modern e-commerce platform",
        5,
        rootDir
      );

      expect(suggestions).toHaveLength(2);
      expect(suggestions[0]).toEqual({
        title: "Foundation Setup",
        description: "Set up core infrastructure",
      });
      expect(suggestions[1]).toEqual({
        title: "User Authentication",
        description: "Implement login and user management",
      });
    });

    it("uses default count of 5 when not specified", async () => {
      const mockSession = {
        prompt: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn(),
        state: {
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: '[\n  {"title": "Setup", "description": "Initial setup"}\n]',
                },
              ],
            },
          ],
        },
      };

      const mockCreateKbAgent = vi.fn().mockResolvedValue({
        session: mockSession,
      });

      __setCreateKbAgent(mockCreateKbAgent);

      await generateMilestoneSuggestions("Test goal", undefined, rootDir);

      expect(mockCreateKbAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          cwd: rootDir,
          systemPrompt: expect.stringContaining("milestone"),
        })
      );
    });

    it("respects the count parameter", async () => {
      const mockSession = {
        prompt: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn(),
        state: {
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: '[\n  {"title": "Setup", "description": "Initial setup"}\n]',
                },
              ],
            },
          ],
        },
      };

      const mockCreateKbAgent = vi.fn().mockResolvedValue({
        session: mockSession,
      });

      __setCreateKbAgent(mockCreateKbAgent);

      await generateMilestoneSuggestions("Test goal", 3, rootDir);

      expect(mockCreateKbAgent).toHaveBeenCalled();
    });

    it("includes count in user message", async () => {
      const mockSession = {
        prompt: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn(),
        state: {
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: '[\n  {"title": "Setup", "description": "Initial setup"}\n]',
                },
              ],
            },
          ],
        },
      };

      const mockCreateKbAgent = vi.fn().mockResolvedValue({
        session: mockSession,
      });

      __setCreateKbAgent(mockCreateKbAgent);

      await generateMilestoneSuggestions("Build a platform", 5, rootDir);

      expect(mockSession.prompt).toHaveBeenCalledWith(
        expect.stringContaining("5 milestones")
      );
    });

    it("disposes session after successful generation", async () => {
      const mockSession = {
        prompt: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn(),
        state: {
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: '[\n  {"title": "Setup", "description": "Initial setup"}\n]',
                },
              ],
            },
          ],
        },
      };

      const mockCreateKbAgent = vi.fn().mockResolvedValue({
        session: mockSession,
      });

      __setCreateKbAgent(mockCreateKbAgent);

      await generateMilestoneSuggestions("Test", 5, rootDir);

      expect(mockSession.dispose).toHaveBeenCalled();
    });

    it("throws when AI service is unavailable", async () => {
      __setCreateKbAgent(undefined);

      await expect(
        generateMilestoneSuggestions("Test", 5, rootDir)
      ).rejects.toThrow("AI service is not available");
    });

    it("throws when rootDir is missing", async () => {
      const mockSession = {
        prompt: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn(),
        state: {
          messages: [],
        },
      };

      const mockCreateKbAgent = vi.fn().mockResolvedValue({
        session: mockSession,
      });

      __setCreateKbAgent(mockCreateKbAgent);

      await expect(
        generateMilestoneSuggestions("Test", 5)
      ).rejects.toThrow("rootDir is required");
    });

    it("handles markdown-wrapped JSON response", async () => {
      const mockSession = {
        prompt: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn(),
        state: {
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: '```json\n[\n  {"title": "Setup", "description": "Initial setup"}\n]\n```',
                },
              ],
            },
          ],
        },
      };

      const mockCreateKbAgent = vi.fn().mockResolvedValue({
        session: mockSession,
      });

      __setCreateKbAgent(mockCreateKbAgent);

      const suggestions = await generateMilestoneSuggestions("Test", 5, rootDir);

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].title).toBe("Setup");
    });

    it("handles plain array response without markdown", async () => {
      const mockSession = {
        prompt: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn(),
        state: {
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: '[\n  {"title": "Phase 1", "description": "First phase"}\n]',
                },
              ],
            },
          ],
        },
      };

      const mockCreateKbAgent = vi.fn().mockResolvedValue({
        session: mockSession,
      });

      __setCreateKbAgent(mockCreateKbAgent);

      const suggestions = await generateMilestoneSuggestions("Test", 5, rootDir);

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].title).toBe("Phase 1");
    });

    it("handles suggestions without description", async () => {
      const mockSession = {
        prompt: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn(),
        state: {
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: '[{"title": "Phase 1"}, {"title": "Phase 2", "description": "With desc"}]',
                },
              ],
            },
          ],
        },
      };

      const mockCreateKbAgent = vi.fn().mockResolvedValue({
        session: mockSession,
      });

      __setCreateKbAgent(mockCreateKbAgent);

      const suggestions = await generateMilestoneSuggestions("Test", 5, rootDir);

      expect(suggestions).toHaveLength(2);
      expect(suggestions[0]).toEqual({ title: "Phase 1", description: undefined });
      expect(suggestions[1]).toEqual({ title: "Phase 2", description: "With desc" });
    });

    it("limits suggestions to requested count", async () => {
      const mockSession = {
        prompt: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn(),
        state: {
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: '[\n  {"title": "One"}, {"title": "Two"}, {"title": "Three"}, {"title": "Four"}, {"title": "Five"}\n]',
                },
              ],
            },
          ],
        },
      };

      const mockCreateKbAgent = vi.fn().mockResolvedValue({
        session: mockSession,
      });

      __setCreateKbAgent(mockCreateKbAgent);

      const suggestions = await generateMilestoneSuggestions("Test", 2, rootDir);

      expect(suggestions).toHaveLength(2);
      expect(suggestions[0].title).toBe("One");
      expect(suggestions[1].title).toBe("Two");
    });

    it("strips whitespace from titles and descriptions", async () => {
      const mockSession = {
        prompt: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn(),
        state: {
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: '[\n  {"title": "  Trimmed Title  ", "description": "  With whitespace  "}\n]',
                },
              ],
            },
          ],
        },
      };

      const mockCreateKbAgent = vi.fn().mockResolvedValue({
        session: mockSession,
      });

      __setCreateKbAgent(mockCreateKbAgent);

      const suggestions = await generateMilestoneSuggestions("Test", 5, rootDir);

      expect(suggestions[0]).toEqual({
        title: "Trimmed Title",
        description: "With whitespace",
      });
    });

    it("throws ParseError when AI returns no JSON", async () => {
      const mockSession = {
        prompt: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn(),
        state: {
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: "Here are some milestones without JSON",
                },
              ],
            },
          ],
        },
      };

      const mockCreateKbAgent = vi.fn().mockResolvedValue({
        session: mockSession,
      });

      __setCreateKbAgent(mockCreateKbAgent);

      await expect(
        generateMilestoneSuggestions("Test", 5, rootDir)
      ).rejects.toThrow(ParseError);
    });

    it("throws ParseError when JSON is not an array", async () => {
      const mockSession = {
        prompt: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn(),
        state: {
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: '{"title": "Not an array"}',
                },
              ],
            },
          ],
        },
      };

      const mockCreateKbAgent = vi.fn().mockResolvedValue({
        session: mockSession,
      });

      __setCreateKbAgent(mockCreateKbAgent);

      await expect(
        generateMilestoneSuggestions("Test", 5, rootDir)
      ).rejects.toThrow(ParseError);
    });

    it("throws ParseError when milestone is missing title", async () => {
      const mockSession = {
        prompt: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn(),
        state: {
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: '[{"description": "Missing title"}]',
                },
              ],
            },
          ],
        },
      };

      const mockCreateKbAgent = vi.fn().mockResolvedValue({
        session: mockSession,
      });

      __setCreateKbAgent(mockCreateKbAgent);

      await expect(
        generateMilestoneSuggestions("Test", 5, rootDir)
      ).rejects.toThrow(ParseError);
    });

    it("supports model override parameters", async () => {
      const mockSession = {
        prompt: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn(),
        state: {
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: '[\n  {"title": "Setup", "description": "Initial setup"}\n]',
                },
              ],
            },
          ],
        },
      };

      const mockCreateKbAgent = vi.fn().mockResolvedValue({
        session: mockSession,
      });

      __setCreateKbAgent(mockCreateKbAgent);

      await generateMilestoneSuggestions(
        "Test",
        5,
        rootDir,
        "openai",
        "gpt-4o"
      );

      expect(mockCreateKbAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultProvider: "openai",
          defaultModelId: "gpt-4o",
        })
      );
    });
  });
});
