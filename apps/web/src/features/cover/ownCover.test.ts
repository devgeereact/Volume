import { describe, expect, it } from "vitest";
import { ownCoverMime, ownCoverProblem } from "./ownCover";

describe("own cover picks", () => {
  it("takes JPEG and TIFF for the eBook and a PDF for the wrap", () => {
    expect(ownCoverProblem("ebook", { name: "front.jpg", type: "image/jpeg", size: 1000 })).toBeNull();
    expect(ownCoverProblem("ebook", { name: "front.tif", type: "", size: 1000 })).toBeNull();
    expect(ownCoverProblem("wrap", { name: "wrap.pdf", type: "application/pdf", size: 1000 })).toBeNull();
  });

  it("refuses PNG, a huge eBook cover and an image as the wrap", () => {
    expect(ownCoverProblem("ebook", { name: "front.png", type: "image/png", size: 1000 })).toContain("JPEG");
    expect(ownCoverProblem("ebook", { name: "front.jpg", type: "image/jpeg", size: 60 * 1024 * 1024 })).toContain("MB");
    expect(ownCoverProblem("wrap", { name: "wrap.jpg", type: "image/jpeg", size: 1000 })).toContain("PDF");
  });

  it("reads the type from the extension when the browser gives none", () => {
    expect(ownCoverMime({ name: "Front.TIFF", type: "" })).toBe("image/tiff");
    expect(ownCoverMime({ name: "wrap.pdf", type: "" })).toBe("application/pdf");
  });
});
