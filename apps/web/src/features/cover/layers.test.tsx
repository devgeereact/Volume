import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { COVER_LAYER_LIMITS, COVER_SHAPE_KINDS } from "@volume/core";
import { BackgroundControls, ShapeControls, SpineControls } from "./LayerControls";
import { layerChecks, layersFromSaved, layersToTypography, newShape, startGradient, startPicture, type StudioLayers } from "./layers";

const NAVY = { background: "#0B1F4D", title: "#FFFFFF", subtitle: "#F2F6FF", author: "#FFFFFF" };

describe("cover layers in the studio", () => {
  it("old saved settings give no layers and send no layer keys", () => {
    const l = layersFromSaved({ styleId: "x", colours: { title: "#000000" }, sizePct: 100 });
    expect(l).toEqual({});
    expect(layersToTypography(l)).toEqual({});
  });

  it("round-trips every layer through the saved typography", () => {
    const layers: StudioLayers = {
      background: startPicture({ texture: "halftone" }, "front"),
      artwork: { opacity: 0.5, rotation: 10, box: { x: 5, y: 10, w: 90, h: 90 } },
      shapes: [newShape("star", "back", "#FFB547", [])],
      spine: { colour: "#C2185B", textColour: "#FFF59D" },
      showBarcodeBox: false,
    };
    const sent = layersToTypography(layers);
    expect(layersFromSaved(JSON.parse(JSON.stringify(sent)) as Record<string, unknown>)).toEqual(layers);
  });

  it("new shapes sit inside the limits the server checks and get fresh ids", () => {
    const list = [newShape("circle", "front", "#fff", [])];
    for (const k of COVER_SHAPE_KINDS) {
      const s = newShape(k, "front", "#ffffff", list);
      expect(list.some((x) => x.id === s.id)).toBe(false);
      for (const v of [s.w, s.h]) expect(v).toBeGreaterThanOrEqual(COVER_LAYER_LIMITS.sizeMin);
      list.push(s);
    }
  });

  it("checks are measured for a faded-out art over a gradient and flagged for a picture", () => {
    const g: StudioLayers = { background: startGradient("#0B1F4D", "#FFFFFF"), artwork: { opacity: 0, rotation: 0 } };
    const measured = layerChecks({ layers: g, colours: NAVY, art: true, showSubtitle: false, built: [], page: [], show: () => {} }) ?? [];
    expect(measured.map((c) => c.status)).toEqual(["fail", "fail"]);
    expect(measured[0]?.detail).toMatch(/weakest point/);
    const pic = layerChecks({
      layers: { background: startPicture({ assetId: "PIC" }) },
      colours: NAVY,
      art: true,
      showSubtitle: false,
      built: ["The title reads at about 2.1 to 1.", "Rule paperback.cover.barcodeArea is partial: check before you rely on it."],
      page: ["Background picture is about 90 DPI where it prints."],
      show: () => {},
    });
    expect(pic?.map((c) => [c.status, c.title])).toEqual([
      ["warn", "Title contrast needs a look"],
      ["warn", "Author contrast needs a look"],
      ["warn", "From the build's page"],
      ["warn", "Noted by the last build"],
    ]);
    expect(layerChecks({ layers: {}, colours: NAVY, art: true, showSubtitle: false, built: [], page: [], show: () => {} })).toBeNull();
  });

  it("draws the controls for each background mode, shapes and spine", () => {
    const colours = { background: "#0B1F4D", band: "#1D4E9E" };
    const noop = () => {};
    const html = (layers: StudioLayers) =>
      renderToStaticMarkup(<BackgroundControls layers={layers} onChange={noop} bookId="b" colours={colours} disabled={false} onAnnounce={noop} />);
    expect(html({})).toContain("The palette&#x27;s background colour");
    expect(html({ background: startGradient("#000000", "#ffffff") })).toContain("Angle");
    const img = html({ background: { ...startPicture({ assetId: "PIC" }), image: { ...startPicture({ assetId: "PIC" }).image!, blur: 4 } } });
    expect(img).toContain("Tint strength");
    expect(img).toContain("built as one picture");
    expect(renderToStaticMarkup(<ShapeControls layers={{}} onChange={noop} colour="#ffffff" disabled={false} />)).toContain("Add circle");
    expect(renderToStaticMarkup(<SpineControls layers={{}} onChange={noop} colours={colours} disabled={false} />)).toContain("Spine text colour");
  });
});
