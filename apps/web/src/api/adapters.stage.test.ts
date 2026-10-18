import { describe, expect, it } from "vitest";
import { toStageId } from "./adapters";

describe("toStageId", () => {
  it("maps the server's step names to the web pipeline (D-048)", () => {
    const at = (stage: string) => toStageId({ stage, status: "active" });
    expect(at("titles")).toBe("title");
    expect(at("blueprint")).toBe("blueprint");
    expect(at("writing")).toBe("writing");
    expect(at("editor")).toBe("editing");
    expect(at("cover")).toBe("cover");
    expect(at("export")).toBe("export");
    expect(at("marketing")).toBe("export");
    expect(at("something-new")).toBe("idea");
  });

  it("puts a published book on the shelf whatever its step", () => {
    expect(toStageId({ stage: "marketing", status: "published" })).toBe("published");
  });
});
