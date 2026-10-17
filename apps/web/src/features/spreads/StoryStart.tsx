import type { ReactNode } from "react";
import { SPREAD_COUNT } from "../../api/picture";
import { Input, Select, Switch, Textarea } from "../../components/ui";
import { GENTLE_PROBLEM_RULE, messageOptions, pictureAgeRanges, type StoryForm, type StoryFormErrors } from "./model";

interface StoryStartProps {
  form: StoryForm;
  errors: StoryFormErrors;
  onChange: <K extends keyof StoryForm>(key: K, value: StoryForm[K]) => void;
  disabled?: boolean | undefined;
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-4 border-t border-border pt-5">
      <legend className="float-left mb-1 w-full text-subhead text-ink">{title}</legend>
      {children}
    </fieldset>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * What the story stage is told before the run: the story idea, the reader's age, one new word, the gentle problem
 * and the message (the Bedtime Story rules in config/book-templates/picture-book.json), and how many spreads.
 */
export function StoryStart({ form, errors, onChange, disabled = false }: StoryStartProps) {
  const off = disabled ? "Your role cannot change this book." : undefined;
  return (
    <div className="grid max-w-[760px] gap-6">
      <Textarea
        id="story-topic"
        label="Story idea"
        prose
        rows={3}
        maxLength={1800}
        value={form.topic}
        onChange={(e) => onChange("topic", e.target.value)}
        error={errors.topic}
        disabledReason={off}
        hint="Who the story is about and what happens. The writer keeps it gentle, short and soothing."
      />

      <Group title="For young readers">
        <div className="grid gap-5 sm:grid-cols-2">
          <Select
            label="Reader age"
            options={[...new Set([...pictureAgeRanges, form.ageRange])].map((a) => ({
              value: a,
              label: `Ages ${a}`,
            }))}
            value={form.ageRange}
            onChange={(v) => onChange("ageRange", v)}
            disabledReason={off}
            hint="Sets the reading level and sentence length."
          />
          <Input
            id="story-spreads"
            label="Spreads"
            inputMode="numeric"
            value={form.spreads}
            onChange={(e) => onChange("spreads", e.target.value)}
            error={errors.spreads}
            disabledReason={off}
            hint={`${SPREAD_COUNT.min} to ${SPREAD_COUNT.max}. Each spread is two facing pages with one picture.`}
          />
        </div>
        <Switch
          label="Teach one new word"
          description="Used at least three times in the story and explained on its own page."
          checked={form.newWord}
          onChange={(v) => onChange("newWord", v)}
          disabled={disabled}
        />
        {form.newWord && (
          <Input
            id="story-newWordText"
            label="New word (optional)"
            value={form.newWordText}
            maxLength={60}
            onChange={(e) => onChange("newWordText", e.target.value)}
            error={errors.newWordText}
            disabledReason={off}
            placeholder="For example: patient"
            hint="Leave blank and the writer picks one, such as brave or grateful."
          />
        )}
      </Group>

      <Group title="Problem and message">
        <Input
          label="Gentle problem (optional)"
          value={form.problem}
          maxLength={300}
          onChange={(e) => onChange("problem", e.target.value)}
          disabledReason={off}
          placeholder="For example: the kite will not fly"
          hint={`${GENTLE_PROBLEM_RULE} Nothing scary, no villains, no danger.`}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <Select
            label="Message"
            options={messageOptions.map((m) => ({ value: m, label: cap(m) }))}
            value={form.message}
            onChange={(v) => onChange("message", v)}
            disabledReason={off}
            hint="One positive message for the whole story."
          />
          <Input
            label="Character ideas (optional)"
            value={form.characterIdeas}
            maxLength={300}
            onChange={(e) => onChange("characterIdeas", e.target.value)}
            disabledReason={off}
            placeholder="For example: a small fox and a kind bird"
            hint="One to four friendly characters."
          />
        </div>
        <Switch
          label="Goodnight message at the back"
          description="A short line a parent can say after the story. It adds one printed page."
          checked={form.goodnightMessage}
          onChange={(v) => onChange("goodnightMessage", v)}
          disabled={disabled}
        />
      </Group>
    </div>
  );
}
