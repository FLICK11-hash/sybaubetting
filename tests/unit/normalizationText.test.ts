import { describe, it, expect } from "vitest";
import { normalizeText, normalizeTeamName, normalizePlayerName } from "@/lib/normalization/text";

describe("normalizeText", () => {
  it("lowercases and trims", () => {
    expect(normalizeText("  Boston Celtics  ")).toBe("boston celtics");
  });

  it("strips accented characters", () => {
    expect(normalizeText("Nikola Jokić")).toBe("nikola jokic");
    expect(normalizeText("Luka Doncič")).toBe("luka doncic");
  });

  it("strips punctuation and collapses whitespace", () => {
    expect(normalizeText("D'Angelo Russell")).toBe("d angelo russell");
    expect(normalizeText("St.   Louis")).toBe("st louis");
  });
});

describe("normalizeTeamName", () => {
  it("expands common city abbreviations", () => {
    expect(normalizeTeamName("LA Lakers")).toBe("los angeles lakers");
    expect(normalizeTeamName("NY Knicks")).toBe("new york knicks");
  });

  it("matches the same team spelled two different ways", () => {
    expect(normalizeTeamName("Los Angeles Lakers")).toBe(normalizeTeamName("LA Lakers"));
  });
});

describe("normalizePlayerName", () => {
  it("matches accented and unaccented spellings of the same player", () => {
    expect(normalizePlayerName("Nikola Jokic")).toBe(normalizePlayerName("Nikola Jokić"));
  });
});
