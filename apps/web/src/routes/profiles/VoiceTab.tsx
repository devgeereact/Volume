import { Plus, Trash2 } from "lucide-react";
import { Button, EmptyState, IconButton, SegmentedControl, Select, Textarea } from "../../components/ui";
import { workspace } from "../../data/workspace";
import { formatNumber } from "../../lib/format";
import { SectionTitle, type TabProps } from "./IdentityTab";
import { ListEditor } from "./ListEditor";
import { SAMPLE_MAX_COUNT, SAMPLE_MAX_WORDS, errorFor } from "./profileRules";
import type { ProfileDraft, VoiceSample } from "./profileStore";

type Voice = ProfileDraft["voice"];

let sampleSeq = 100;

/** Plain-words fields of the voice, in the order the writer reads them (config/profiles voice). */
const VOICE_FIELDS: { key: "pov" | "rhythm" | "vocabulary" | "readingLevel" | "dialogueStyle"; label: string; placeholder: string }[] = [
  { key: "pov", label: "Point of view", placeholder: "For example: first person, speaking to the reader as you" },
  { key: "rhythm", label: "Sentence rhythm", placeholder: "For example: short sentences for steps, longer ones for stories" },
  { key: "vocabulary", label: "Vocabulary", placeholder: "For example: everyday British English, terms explained the first time" },
  { key: "readingLevel", label: "Reading level", placeholder: "For example: general adult readers" },
  { key: "dialogueStyle", label: "Dialogue style", placeholder: "For example: short, realistic exchanges" },
];

/**
 * Voice DNA: tone, point of view, rhythm, vocabulary, reading level, dialogue, the sample paragraph,
 * genre settings, banned phrases and extra samples. Fields are plain words, as in the profile file.
 */
export function VoiceTab({ draft, update, errors }: TabProps) {
  const v = draft.voice;
  const setVoice = (patch: Partial<Voice>) => update((d) => ({ ...d, voice: { ...d.voice, ...patch } }));
  const setSample = (id: string, patch: Partial<VoiceSample>) => setVoice({ samples: v.samples.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const addSample = () => setVoice({ samples: [...v.samples, { id: `s-${sampleSeq++}`, kind: "sounds-like", text: "" }] });
  const full = v.samples.length >= SAMPLE_MAX_COUNT;

  return (
    <div className="grid gap-12">
      <section className="grid gap-6" aria-labelledby="v-tone">
        <SectionTitle id="v-tone" title="How this author sounds" body="The writer reads these with every chapter. Keep each line short and concrete." />
        <ListEditor
          label="Tone"
          items={v.tone}
          onChange={(tone) => setVoice({ tone })}
          addLabel="Add a trait"
          placeholder="For example, warm and never clinical"
          emptyText="No traits yet."
        />
        <div className="grid gap-5 sm:grid-cols-2">
          {VOICE_FIELDS.map((f) => (
            <Textarea
              key={f.key}
              label={f.label}
              rows={3}
              value={v[f.key]}
              placeholder={f.placeholder}
              onChange={(e) => setVoice({ [f.key]: e.target.value })}
            />
          ))}
          <Select
            label="Language and spelling"
            value={v.locale}
            onChange={() => setVoice({ locale: "en-GB" })}
            options={[{ value: "en-GB", label: "English (UK), en-GB", hint: "British spelling" }]}
            hint="Other languages come after version 1."
          />
        </div>
        {draft.genreSettings.length > 0 && (
          <div className="grid gap-3 rounded-md border border-border bg-sheet p-4">
            <h3 className="text-label text-ink">Genre settings</h3>
            <dl className="grid gap-x-6 gap-y-2.5 text-small sm:grid-cols-[140px_minmax(0,1fr)]">
              {draft.genreSettings.map((g) => (
                <div key={g.label} className="contents">
                  <dt className="text-ink-secondary">{g.label}</dt>
                  <dd className="text-ink">{g.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </section>

      <section className="grid gap-5" aria-labelledby="v-sample">
        <SectionTitle
          id="v-sample"
          title="Sample paragraph"
          body="One paragraph in this author's voice. The writer matches its rhythm and warmth, never its words."
        />
        <Textarea
          label="Sample paragraph"
          prose
          rows={10}
          showWordCount
          value={v.sampleParagraph}
          placeholder="Write or paste one paragraph that sounds like this author."
          onChange={(e) => setVoice({ sampleParagraph: e.target.value })}
        />
      </section>

      <section className="grid gap-5" aria-labelledby="v-banned">
        <SectionTitle
          id="v-banned"
          title="Banned phrases"
          body={`Added to the house list of ${formatNumber(workspace.houseStyle.bannedPhrases)} phrases, for this profile only. Checks flag them in every chapter.`}
        />
        <ListEditor
          label="Phrases to avoid"
          items={v.bannedPhrases}
          onChange={(bannedPhrases) => setVoice({ bannedPhrases })}
          addLabel="Add a phrase"
          placeholder="For example, heroes in uniform"
          emptyText="No extra phrases. The house list still applies."
        />
      </section>

      <section className="grid gap-5" aria-labelledby="v-samples">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionTitle
            id="v-samples"
            title="More samples"
            body={`Extra passages that sound like this author, and some that do not. Up to ${SAMPLE_MAX_COUNT} samples of up to ${formatNumber(SAMPLE_MAX_WORDS)} words each.`}
          />
          {v.samples.length > 0 && (
            <Button
              icon={Plus}
              onClick={addSample}
              disabledReason={full ? `You have ${SAMPLE_MAX_COUNT} samples, the most a profile holds. Remove one first.` : undefined}
            >
              Add a sample
            </Button>
          )}
        </div>
        {v.samples.length === 0 ? (
          <EmptyState
            headingLevel={3}
            drawing="pen"
            title="No extra samples"
            body="Optional. Paste a passage that sounds like this author, or one that does not, to sharpen the voice."
            action={
              <Button icon={Plus} onClick={addSample}>
                Add a sample
              </Button>
            }
          />
        ) : (
          <ol className="grid gap-4">
            {v.samples.map((s, i) => (
              <li key={s.id} className="grid gap-3 rounded-md border border-border bg-sheet p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <SegmentedControl<VoiceSample["kind"]>
                    label={`Sample ${i + 1} kind`}
                    size="sm"
                    value={s.kind}
                    onChange={(kind) => setSample(s.id, { kind })}
                    options={[
                      { value: "sounds-like", label: "Sounds like" },
                      { value: "not-like", label: "Does not sound like" },
                    ]}
                  />
                  <IconButton icon={Trash2} label={`Remove sample ${i + 1}`} onClick={() => setVoice({ samples: v.samples.filter((x) => x.id !== s.id) })} />
                </div>
                <Textarea
                  label={`Sample ${i + 1}`}
                  prose
                  rows={6}
                  showWordCount
                  value={s.text}
                  placeholder="Paste a few paragraphs here."
                  onChange={(e) => setSample(s.id, { text: e.target.value })}
                  error={errorFor(errors, `sample-${s.id}`)}
                />
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
