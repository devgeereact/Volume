import { useRef, useState } from "react";
import { Copy, Plus, Trash2, Upload } from "lucide-react";
import {
  COVER_BLEND_NAMES,
  COVER_BLENDS,
  COVER_LAYER_LIMITS as L,
  COVER_SHAPE_KINDS,
  COVER_SHAPE_NAMES,
  COVER_TEXTURE_INFO,
  COVER_TEXTURES,
  type CoverArtwork,
  type CoverBackground,
  type CoverBlend,
  type CoverPicture,
  type CoverShape,
  type CoverShapeKind,
  type CoverSpine,
  type CoverTexture,
} from "@volume/core";
import { Switch } from "../../components/ui";
import { assetsApi } from "../../api/assets";
import { errorText } from "../../api/wire-c";
import { fieldInput, fieldLabel, pillButton, Section, Toggles } from "./Studio";
import { newShape, shapeLabel, startGradient, startPicture, type StudioLayers } from "./layers";

/* Inspector controls for the cover layers. Every value is a field of the cover spec (packages/core cover-layers.ts);
   the canvas is the build's own page drawn from them, so nothing here draws anything itself. */

type OnLayers = (next: StudioLayers, group?: string) => void;

function Range({
  label,
  value,
  min,
  max,
  step,
  onChange,
  shown,
  disabled,
  id,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  shown: string;
  disabled?: boolean | undefined;
  id?: string | undefined;
}) {
  return (
    <label className="grid gap-1.5">
      <span className={fieldLabel}>
        {label} <output className="num font-semibold text-ink">{shown}</output>
      </span>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-(--vol-btn)"
      />
    </label>
  );
}

function Colour({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean | undefined }) {
  // The colour input needs six hex digits.
  const six = /^#[0-9a-f]{3}$/i.test(value) ? `#${[...value.slice(1)].map((c) => c + c).join("")}` : value;
  return (
    <label className="flex items-center justify-between gap-2 text-[12.5px] text-ink-2">
      {label}
      <span className="flex items-center gap-2">
        <span className="num text-[12px] text-ink-3 uppercase">{six}</span>
        <input
          type="color"
          value={six}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-10 cursor-pointer rounded-[8px] border border-line-2 bg-panel-2 p-0.5 disabled:cursor-not-allowed"
        />
      </span>
    </label>
  );
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/* ---------- background ---------- */

export function BackgroundControls({
  layers,
  onChange,
  bookId,
  colours,
  disabled,
  onAnnounce,
}: {
  layers: StudioLayers;
  onChange: OnLayers;
  bookId: string;
  colours: { background: string; band: string };
  disabled: boolean;
  onAnnounce: (text: string) => void;
}) {
  const bg = layers.background;
  const mode = bg?.mode ?? "solid";
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const set = (next: CoverBackground | undefined, group?: string) => {
    const { background: _old, ...rest } = layers;
    onChange(next ? { ...rest, background: next } : rest, group);
  };
  const g = bg?.mode === "gradient" ? bg.gradient : undefined;
  const img = bg?.mode === "image" ? bg.image : undefined;
  const setImg = (p: Partial<CoverPicture>, group?: string) => {
    if (bg && img) set({ ...bg, image: { ...img, ...p } }, group);
  };

  async function upload(f: File) {
    setProblem(null);
    if (!["image/png", "image/jpeg", "image/webp"].includes(f.type)) {
      setProblem("Use a PNG, JPEG or WebP picture.");
      return;
    }
    setBusy(true);
    try {
      const asset = await assetsApi.upload(f, { kind: "cover_background", filename: f.name, mime: f.type, projectId: bookId });
      set(startPicture({ assetId: asset.id }, bg?.span ?? "wrap"));
      onAnnounce(`${f.name} is the background. Set its opacity, focus and tint below.`);
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Background">
      <Toggles
        label="Background type"
        full
        value={mode}
        onChange={(m) => {
          if (disabled || m === mode) return;
          if (m === "solid") set(undefined);
          else if (m === "gradient") set(startGradient(colours.background, colours.band));
          else set(startPicture({ texture: "grain" }, bg?.span ?? "wrap"));
        }}
        options={[
          { value: "solid", label: "Colour" },
          { value: "gradient", label: "Gradient" },
          { value: "image", label: "Image" },
        ]}
      />
      {mode === "solid" && <p className="text-[12px] leading-[1.45] text-ink-2">The palette's background colour. Change it under Colours.</p>}
      {bg && (
        <div className="grid gap-1.5">
          <span aria-hidden className={fieldLabel}>
            Spans
          </span>
          <Toggles
            label="Background spans"
            full
            value={bg.span}
            onChange={(span) => !disabled && set({ ...bg, span })}
            options={[
              { value: "wrap", label: "Whole wrap" },
              { value: "front", label: "Front only" },
            ]}
          />
        </div>
      )}
      {g && bg && (
        <>
          <Toggles
            label="Gradient type"
            full
            value={g.type}
            onChange={(type) => !disabled && set({ ...bg, gradient: { ...g, type } })}
            options={[
              { value: "linear", label: "Linear" },
              { value: "radial", label: "Radial" },
            ]}
          />
          <Colour label="From" value={g.from} disabled={disabled} onChange={(from) => set({ ...bg, gradient: { ...g, from } }, "grad-from")} />
          <Colour label="To" value={g.to} disabled={disabled} onChange={(to) => set({ ...bg, gradient: { ...g, to } }, "grad-to")} />
          {g.type === "linear" ? (
            <Range
              label="Angle"
              value={g.angle}
              min={0}
              max={360}
              step={5}
              shown={`${g.angle}°`}
              disabled={disabled}
              onChange={(angle) => set({ ...bg, gradient: { ...g, angle } }, "grad-angle")}
            />
          ) : (
            <>
              <Range
                label="Centre across"
                value={g.centreX}
                min={0}
                max={100}
                step={1}
                shown={`${g.centreX}%`}
                disabled={disabled}
                onChange={(centreX) => set({ ...bg, gradient: { ...g, centreX } }, "grad-cx")}
              />
              <Range
                label="Centre down"
                value={g.centreY}
                min={0}
                max={100}
                step={1}
                shown={`${g.centreY}%`}
                disabled={disabled}
                onChange={(centreY) => set({ ...bg, gradient: { ...g, centreY } }, "grad-cy")}
              />
            </>
          )}
        </>
      )}
      {bg?.mode === "image" && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={file}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void upload(f);
              }}
            />
            <button type="button" className={pillButton} disabled={disabled || busy} onClick={() => file.current?.click()}>
              <Upload size={15} aria-hidden />
              {busy ? "Uploading" : img?.assetId ? "Replace picture" : "Upload a picture"}
            </button>
            {img?.assetId && <img src={assetsApi.downloadUrl(img.assetId, true)} alt="Background picture" className="h-10 w-10 rounded-[6px] object-cover" />}
          </div>
          {problem && <p className="text-[12px] text-accent-text">{problem}</p>}
          <label className="grid gap-1.25">
            <span className={fieldLabel}>Or a built-in texture</span>
            <select
              value={img?.texture ?? ""}
              disabled={disabled}
              onChange={(e) => {
                const t = e.target.value as CoverTexture | "";
                if (t) set(startPicture({ texture: t }, bg.span));
              }}
              className={fieldInput}
            >
              {!img?.texture && <option value="">Your picture</option>}
              {COVER_TEXTURES.map((t) => (
                <option key={t} value={t}>
                  {COVER_TEXTURE_INFO[t].name}
                </option>
              ))}
            </select>
          </label>
          {img && (
            <>
              <Range
                label="Opacity"
                value={img.opacity}
                min={0}
                max={1}
                step={0.05}
                shown={pct(img.opacity)}
                disabled={disabled}
                onChange={(opacity) => setImg({ opacity }, "img-op")}
              />
              <label className="grid gap-1.25">
                <span className={fieldLabel}>Blend with the colour below</span>
                <select value={img.blend} disabled={disabled} onChange={(e) => setImg({ blend: e.target.value as CoverBlend })} className={fieldInput}>
                  {COVER_BLENDS.map((b) => (
                    <option key={b} value={b}>
                      {COVER_BLEND_NAMES[b]}
                    </option>
                  ))}
                </select>
              </label>
              <Range
                label="Zoom"
                value={img.scale}
                min={L.scaleMin}
                max={L.scaleMax}
                step={0.05}
                shown={`${img.scale.toFixed(2)}x`}
                disabled={disabled}
                onChange={(scale) => setImg({ scale }, "img-scale")}
              />
              <Range
                label="Focus across"
                value={img.focusX}
                min={0}
                max={100}
                step={1}
                shown={`${img.focusX}%`}
                disabled={disabled}
                onChange={(focusX) => setImg({ focusX }, "img-fx")}
              />
              <Range
                label="Focus down"
                value={img.focusY}
                min={0}
                max={100}
                step={1}
                shown={`${img.focusY}%`}
                disabled={disabled}
                onChange={(focusY) => setImg({ focusY }, "img-fy")}
              />
              <Range
                label="Blur"
                value={img.blur}
                min={0}
                max={L.blurMax}
                step={1}
                shown={String(img.blur)}
                disabled={disabled}
                onChange={(blur) => setImg({ blur }, "img-blur")}
              />
              <Switch label="Greyscale" checked={img.greyscale} disabled={disabled} onChange={(greyscale) => setImg({ greyscale })} />
              <Colour
                label="Tint over the image"
                value={img.tint?.colour ?? "#000000"}
                disabled={disabled}
                onChange={(colour) => setImg({ tint: { colour, strength: img.tint?.strength ?? 0.25 } }, "img-tint")}
              />
              <Range
                label="Tint strength"
                value={img.tint?.strength ?? 0}
                min={0}
                max={L.tintMax}
                step={0.05}
                shown={pct(img.tint?.strength ?? 0)}
                disabled={disabled}
                onChange={(strength) => {
                  const { tint: _t, ...rest } = img;
                  if (bg) set({ ...bg, image: strength > 0 ? { ...rest, tint: { colour: img.tint?.colour ?? "#000000", strength } } : rest }, "img-tint-s");
                }}
              />
              {(img.blend !== "normal" || img.blur > 0 || img.greyscale || (img.texture && COVER_TEXTURE_INFO[img.texture].filtered)) && (
                <p className="text-[12px] leading-[1.45] text-ink-2">
                  With a blend, blur, greyscale or this texture the wrap PDF is built as one picture at the KDP rules' DPI, so it prints exactly as shown.
                </p>
              )}
            </>
          )}
        </>
      )}
      {bg && (
        <p className="text-[12px] leading-[1.45] text-ink-2">
          Concept art covers the front. Fade it or give it a box under Artwork to show the background there.
        </p>
      )}
    </Section>
  );
}

/* ---------- shapes ---------- */

export function ShapeControls({ layers, onChange, colour, disabled }: { layers: StudioLayers; onChange: OnLayers; colour: string; disabled: boolean }) {
  const shapes = layers.shapes ?? [];
  const [kind, setKind] = useState<CoverShapeKind>("circle");
  const [surface, setSurface] = useState<"front" | "back">("front");
  const [open, setOpen] = useState<string | null>(null);
  const put = (list: CoverShape[], group?: string) => {
    const { shapes: _old, ...rest } = layers;
    onChange(list.length ? { ...rest, shapes: list } : rest, group);
  };
  const edit = (id: string, p: Partial<CoverShape>, group?: string) =>
    put(
      shapes.map((s) => (s.id === id ? { ...s, ...p } : s)),
      group,
    );
  const full = shapes.length >= L.shapes;
  return (
    <Section title="Shapes">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <select aria-label="Shape kind" value={kind} disabled={disabled} onChange={(e) => setKind(e.target.value as CoverShapeKind)} className={fieldInput}>
          {COVER_SHAPE_KINDS.map((k) => (
            <option key={k} value={k}>
              {COVER_SHAPE_NAMES[k]}
            </option>
          ))}
        </select>
        <Toggles
          label="Surface for the new shape"
          value={surface}
          onChange={setSurface}
          options={[
            { value: "front", label: "Front" },
            { value: "back", label: "Back" },
          ]}
        />
      </div>
      <button
        type="button"
        className={pillButton}
        disabled={disabled || full}
        onClick={() => {
          const s = newShape(kind, surface, colour, shapes);
          put([...shapes, s]);
          setOpen(s.id);
        }}
      >
        <Plus size={15} aria-hidden />
        Add {COVER_SHAPE_NAMES[kind].toLowerCase()}
      </button>
      {full && <p className="text-[12px] text-ink-2">A cover takes up to {L.shapes} shapes.</p>}
      {shapes.length > 0 && (
        <ul className="grid gap-1.5">
          {shapes.map((s) => (
            <li key={s.id} className="rounded-[10px] border border-line-2">
              <button
                type="button"
                aria-expanded={open === s.id}
                onClick={() => setOpen(open === s.id ? null : s.id)}
                className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-[13px] text-ink"
              >
                <span aria-hidden className="size-3.5 flex-none rounded-full border border-line-2" style={{ background: s.colour, opacity: s.opacity }} />
                <span className="min-w-0 flex-1 truncate">{shapeLabel(s, shapes)}</span>
                <span className="text-[11.5px] text-ink-3">{s.layer === "over" ? "Over text" : "Behind text"}</span>
              </button>
              {open === s.id && (
                <div className="grid gap-2.5 border-t border-line px-2.5 py-2.5">
                  <label className="grid gap-1.25">
                    <span className={fieldLabel}>Kind</span>
                    <select value={s.kind} disabled={disabled} onChange={(e) => edit(s.id, { kind: e.target.value as CoverShapeKind })} className={fieldInput}>
                      {COVER_SHAPE_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {COVER_SHAPE_NAMES[k]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Toggles
                    label="Surface"
                    full
                    value={s.surface}
                    onChange={(v) => !disabled && edit(s.id, { surface: v })}
                    options={[
                      { value: "front", label: "Front" },
                      { value: "back", label: "Back" },
                    ]}
                  />
                  <Toggles
                    label="Order"
                    full
                    value={s.layer}
                    onChange={(v) => !disabled && edit(s.id, { layer: v })}
                    options={[
                      { value: "behind", label: "Behind text" },
                      { value: "over", label: "Over text" },
                    ]}
                  />
                  <Colour label="Colour" value={s.colour} disabled={disabled} onChange={(c) => edit(s.id, { colour: c }, `shape-c-${s.id}`)} />
                  <Range
                    label="Opacity"
                    value={s.opacity}
                    min={0}
                    max={1}
                    step={0.05}
                    shown={pct(s.opacity)}
                    disabled={disabled}
                    onChange={(opacity) => edit(s.id, { opacity }, `shape-op-${s.id}`)}
                  />
                  <Range
                    label="Rotate"
                    value={s.rotation}
                    min={-180}
                    max={180}
                    step={1}
                    shown={`${s.rotation}°`}
                    disabled={disabled}
                    onChange={(rotation) => edit(s.id, { rotation }, `shape-r-${s.id}`)}
                  />
                  {(
                    [
                      ["x", "Across", L.xMin, L.xMax],
                      ["y", "Down", L.yMin, L.yMax],
                      ["w", "Width", L.sizeMin, L.sizeMax],
                      ["h", "Height", L.sizeMin, L.sizeMax],
                    ] as const
                  ).map(([k, label, min, max]) => (
                    <Range
                      key={k}
                      label={label}
                      value={s[k]}
                      min={min}
                      max={max}
                      step={0.5}
                      shown={`${s[k]}%`}
                      disabled={disabled}
                      onChange={(v) => edit(s.id, { [k]: v }, `shape-${k}-${s.id}`)}
                    />
                  ))}
                  <p className="text-[12px] leading-[1.45] text-ink-2">Position and size are in percent of the panel's width, as the type is placed.</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={pillButton}
                      disabled={disabled || full}
                      onClick={() => {
                        const copy = {
                          ...newShape(s.kind, s.surface, s.colour, shapes),
                          ...s,
                          id: newShape(s.kind, s.surface, s.colour, shapes).id,
                          x: s.x + 4,
                          y: s.y + 4,
                        };
                        put([...shapes, copy]);
                        setOpen(copy.id);
                      }}
                    >
                      <Copy size={15} aria-hidden />
                      Duplicate
                    </button>
                    <button type="button" className={pillButton} disabled={disabled} onClick={() => put(shapes.filter((x) => x.id !== s.id))}>
                      <Trash2 size={15} aria-hidden />
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* ---------- artwork, spine, barcode ---------- */

export function ArtworkControls({ layers, onChange, disabled }: { layers: StudioLayers; onChange: OnLayers; disabled: boolean }) {
  const a: CoverArtwork = layers.artwork ?? { opacity: 1, rotation: 0 };
  const set = (next: CoverArtwork, group?: string) => {
    const { artwork: _old, ...rest } = layers;
    const plain = next.opacity === 1 && next.rotation === 0 && !next.box;
    onChange(plain ? rest : { ...rest, artwork: next }, group);
  };
  const box = a.box;
  return (
    <Section title="Artwork layer">
      <Range
        label="Opacity"
        value={a.opacity}
        min={0}
        max={1}
        step={0.05}
        shown={pct(a.opacity)}
        disabled={disabled}
        onChange={(opacity) => set({ ...a, opacity }, "art-op")}
      />
      <Range
        label="Rotate"
        value={a.rotation}
        min={-180}
        max={180}
        step={1}
        shown={`${a.rotation}°`}
        disabled={disabled}
        onChange={(rotation) => set({ ...a, rotation }, "art-r")}
      />
      <Switch
        label="Own box instead of the whole front"
        checked={!!box}
        disabled={disabled}
        onChange={(on) => {
          const { box: _b, ...rest } = a;
          set(on ? { ...rest, box: { x: 10, y: 20, w: 80, h: 80 } } : rest);
        }}
      />
      {box &&
        (
          [
            ["x", "Across", L.xMin, L.xMax],
            ["y", "Down", L.yMin, L.yMax],
            ["w", "Width", L.sizeMin, L.sizeMax],
            ["h", "Height", L.sizeMin, L.sizeMax],
          ] as const
        ).map(([k, label, min, max]) => (
          <Range
            key={k}
            label={label}
            value={box[k]}
            min={min}
            max={max}
            step={0.5}
            shown={`${box[k]}%`}
            disabled={disabled}
            onChange={(v) => set({ ...a, box: { ...box, [k]: v } }, `art-${k}`)}
          />
        ))}
      <p className="text-[12px] leading-[1.45] text-ink-2">
        With the art faded right out, the type keeps the palette's colours and the checks measure it against the background.
      </p>
    </Section>
  );
}

export function SpineControls({
  layers,
  onChange,
  colours,
  disabled,
}: {
  layers: StudioLayers;
  onChange: OnLayers;
  colours: { background: string; band: string };
  disabled: boolean;
}) {
  const sp: CoverSpine = layers.spine ?? {};
  const set = (next: CoverSpine, group?: string) => {
    const { spine: _old, ...rest } = layers;
    onChange(Object.keys(next).length ? { ...rest, spine: next } : rest, group);
  };
  const wide = layers.background?.span === "wrap";
  return (
    <Section title="Spine colours">
      <Colour
        label="Spine colour"
        value={sp.colour ?? colours.band}
        disabled={disabled || !!sp.showBackground}
        onChange={(colour) => set({ ...sp, colour }, "spine-c")}
      />
      <Colour
        label="Spine text colour"
        value={sp.textColour ?? colours.background}
        disabled={disabled}
        onChange={(textColour) => set({ ...sp, textColour }, "spine-t")}
      />
      {wide && (
        <Switch
          label="Show the wrap background on the spine"
          checked={!!sp.showBackground}
          disabled={disabled}
          onChange={(on) => {
            const { showBackground: _s, ...rest } = sp;
            set(on ? { ...rest, showBackground: true } : rest);
          }}
        />
      )}
      {(sp.colour || sp.textColour || sp.showBackground) && (
        <button type="button" className={pillButton} disabled={disabled} onClick={() => set({})}>
          Follow the palette again
        </button>
      )}
    </Section>
  );
}

export function BarcodeControls({ layers, onChange, disabled }: { layers: StudioLayers; onChange: OnLayers; disabled: boolean }) {
  return (
    <Switch
      label="White box under the barcode"
      checked={layers.showBarcodeBox !== false}
      disabled={disabled}
      onChange={(on) => {
        const { showBarcodeBox: _b, ...rest } = layers;
        onChange(on ? rest : { ...rest, showBarcodeBox: false });
      }}
    />
  );
}
