import { assetsApi } from "../../api/assets";
import { useWireMode } from "../../api/wire-a";
import { useRef, useState } from "react";
import { ImagePlus, Plus, X } from "lucide-react";
import { Banner, Button, IconButton, Input, Switch, Textarea } from "../../components/ui";
import { fieldBoxClasses } from "../../components/ui/FieldShell";
import { cn } from "../../lib/cn";
import { ListEditor } from "./ListEditor";
import { SHORT_BIO_MAX_WORDS, errorFor, type FieldError } from "./profileRules";
import { initialsFor, type ProfileDraft } from "./profileStore";

export interface TabProps {
  draft: ProfileDraft;
  update: (fn: (d: ProfileDraft) => ProfileDraft) => void;
  errors: FieldError[];
}

export function SectionTitle({ id, title, body }: { id: string; title: string; body?: string | undefined }) {
  return (
    <div className="grid gap-1">
      <h2 id={id} className="text-[16px] leading-6 font-bold text-ink">
        {title}
      </h2>
      {body && <p className="max-w-[60ch] text-small text-ink-secondary">{body}</p>}
    </div>
  );
}

/** Identity: name and photo, real-person switch, bio (third person), short bio, credentials and links. */
export function IdentityTab({ draft, update, errors }: TabProps) {
  const [photoProblem, setPhotoProblem] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const mode = useWireMode();
  const canUpload = mode === "api" && /^[0-9A-HJKMNP-TV-Z]{26}$/.test(draft.id);
  async function uploadPhoto(file: File) {
    setPhotoProblem(null);
    setUploading(true);
    try {
      if (!["image/jpeg", "image/png"].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error("Choose a JPEG or PNG image smaller than 5 MB.");
      const image = await createImageBitmap(file);
      const valid = image.width === image.height && image.width >= 600;
      image.close();
      if (!valid) throw new Error("Choose a square image at least 600 pixels wide.");
      const asset = await assetsApi.upload(file, { kind: "author_photo", filename: file.name, mime: file.type, profileId: draft.id });
      update((value) => ({ ...value, photoAssetId: asset.id }));
    } catch (error) {
      setPhotoProblem(error instanceof Error ? error.message : "Photo could not be uploaded.");
    } finally {
      setUploading(false);
    }
  }
  const initials = initialsFor(draft.name) || "?";

  return (
    <div className="grid gap-12">
      <section className="grid gap-5" aria-labelledby="id-name">
        <SectionTitle id="id-name" title="Name and photo" />
        <div className="flex flex-wrap items-center gap-5">
          {draft.photoAssetId ? (
            <img
              alt={`${draft.name || "Author"} portrait`}
              src={assetsApi.downloadUrl(draft.photoAssetId, true)}
              className="size-[72px] rounded-full object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="grid size-[72px] shrink-0 place-items-center rounded-full border border-dashed border-line-2 bg-soft text-[22px] font-bold text-ink-2"
            >
              {initials}
            </span>
          )}
          <div className="grid justify-items-start gap-1.5">
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png"
              className="sr-only"
              tabIndex={-1}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadPhoto(file);
                event.target.value = "";
              }}
            />
            <Button
              icon={ImagePlus}
              loading={uploading}
              disabledReason={!canUpload ? "Save the profile before adding a photo." : undefined}
              onClick={() => fileInput.current?.click()}
            >
              Choose photo
            </Button>
            {draft.photoAssetId && (
              <Button variant="ghost" onClick={() => update((value) => ({ ...value, photoAssetId: null }))}>
                Remove photo
              </Button>
            )}
            <p className="text-small text-ink-tertiary">Square, at least 600 px. Save the profile to use the photo on About the Author pages.</p>
            {photoProblem && (
              <p role="alert" className="text-small text-claim">
                {photoProblem}
              </p>
            )}
          </div>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Input
            label="Name on the book"
            value={draft.name}
            maxCount={60}
            onChange={(e) => update((d) => ({ ...d, name: e.target.value }))}
            error={errorFor(errors, "name")}
            hint="Prints on the cover, title page and copyright page."
            className="sm:col-span-2"
          />
          <Input
            label="Legal name"
            value={draft.legalName}
            onChange={(e) => update((d) => ({ ...d, legalName: e.target.value }))}
            placeholder={draft.realPerson ? "" : "Not needed for a pen name"}
            hint="Private. Never printed or exported."
          />
          <Input
            label="Location"
            value={draft.location}
            placeholder={draft.realPerson ? "For example, London, United Kingdom" : "Leave empty for a pen name"}
            onChange={(e) => update((d) => ({ ...d, location: e.target.value }))}
            hint="Optional. Only printed if the bio mentions it."
          />
        </div>
        <Switch
          label="Real person"
          description="A real person writes under this name. Volume then offers the “stories are illustrative” line for new books and treats claims with extra care."
          checked={draft.realPerson}
          onChange={(on) => update((d) => ({ ...d, realPerson: on, publishing: { ...d.publishing, illustrative: on ? true : d.publishing.illustrative } }))}
        />
      </section>

      <section className="grid gap-5" aria-labelledby="id-bio">
        <SectionTitle id="id-bio" title="Bio" body="Third person. About the Author prints the bio word for word in every book under this name." />
        {draft.bioStatus === "owner-to-confirm" && draft.bioNote && (
          <Banner tone="attention" title="Owner to confirm before you publish">
            {draft.bioNote}
          </Banner>
        )}
        {draft.bioStatus === "pen-name" && draft.bioNote && (
          <Banner tone="info" title="Pen name">
            {draft.bioNote}
          </Banner>
        )}
        <Textarea
          label="Bio"
          prose
          rows={10}
          showWordCount
          value={draft.bio}
          placeholder="For example: Mira Hale grows vegetables on a Bristol allotment and writes plain, cheerful guides for first-time growers."
          onChange={(e) => update((d) => ({ ...d, bio: e.target.value }))}
          error={errorFor(errors, "bio")}
        />
        <Textarea
          label="Short bio"
          prose
          rows={3}
          showWordCount
          value={draft.shortBio}
          onChange={(e) => update((d) => ({ ...d, shortBio: e.target.value }))}
          hint={`For the back cover. Up to ${SHORT_BIO_MAX_WORDS} words.`}
          error={errorFor(errors, "shortBio")}
        />
      </section>

      <section className="grid gap-8" aria-labelledby="id-creds">
        <SectionTitle
          id="id-creds"
          title="Credentials and links"
          body="Only real credentials. Volume never adds qualifications, awards or titles on its own."
        />
        <ListEditor
          label="Credentials"
          variant="rows"
          items={draft.credentials}
          onChange={(credentials) => update((d) => ({ ...d, credentials }))}
          addLabel="Add a credential"
          placeholder="For example, MSc in Management and Leadership in Health"
          emptyText="No credentials yet."
        />
        <fieldset className="grid gap-2.5">
          <legend className="mb-1 text-label text-ink">Links</legend>
          {draft.links.length === 0 && <p className="text-small text-ink-tertiary">No links yet. Add a website, newsletter or social handle.</p>}
          {draft.links.map((l, i) => {
            const err = errorFor(errors, `link-${i}`);
            return (
              <div key={i} className="grid gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-28 shrink-0 sm:w-40">
                    <input
                      aria-label={`Link ${i + 1} label`}
                      value={l.label}
                      placeholder="Instagram"
                      aria-invalid={err && !l.label.trim() ? true : undefined}
                      onChange={(e) => update((d) => ({ ...d, links: d.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) }))}
                      className={cn(fieldBoxClasses({ error: Boolean(err && !l.label.trim()), disabled: false }), "h-11")}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <input
                      aria-label={`Link ${i + 1} address or handle`}
                      value={l.value}
                      placeholder="@handle or https://"
                      aria-invalid={err && !l.value.trim() ? true : undefined}
                      onChange={(e) => update((d) => ({ ...d, links: d.links.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) }))}
                      className={cn(fieldBoxClasses({ error: Boolean(err && !l.value.trim()), disabled: false }), "h-11")}
                    />
                  </span>
                  <IconButton icon={X} label={`Remove link ${i + 1}`} onClick={() => update((d) => ({ ...d, links: d.links.filter((_, j) => j !== i) }))} />
                </div>
                {err && <p className="text-small font-medium text-claim">{err}</p>}
              </div>
            );
          })}
          <div>
            <Button icon={Plus} onClick={() => update((d) => ({ ...d, links: [...d.links, { label: "", value: "" }] }))}>
              Add link
            </Button>
          </div>
        </fieldset>
      </section>
    </div>
  );
}
