import { useMemo, useState } from "react";
import { Layers, Plus } from "lucide-react";
import { Banner, Button, Checkbox, FilterField, Input, Modal, Skeleton, Textarea } from "../../components/ui";
import { isApiError } from "../../api/client";
import { apiErrorText, type WireMode } from "../../api/wire-a";
import { useBooksInBatches, usePickableBooks, type PickableBook } from "./useVolume";

/* New batch and Add books: pick books by pen name. A book can be in one batch at a time; in demo mode those
   books show as taken, with the server the 409 answer says so. */

function BookPicker({
  mode,
  selected,
  onChange,
  exclude,
  takenBy,
}: {
  mode: WireMode;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  exclude: Set<string>;
  takenBy: Set<string>;
}) {
  const books = usePickableBooks(mode);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () => books.books.filter((b) => !exclude.has(b.id) && (!q || `${b.title} ${b.penName}`.toLowerCase().includes(q))),
    [books.books, exclude, q],
  );
  const groups = useMemo(() => {
    const map = new Map<string, PickableBook[]>();
    for (const b of shown) map.set(b.penName, [...(map.get(b.penName) ?? []), b]);
    return [...map.entries()];
  }, [shown]);

  if (books.state === "loading")
    return (
      <div role="status" aria-label="Loading books" className="grid gap-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
      </div>
    );
  if (books.state === "error")
    return (
      <Banner
        tone="error"
        title="Could not load your books"
        action={
          <Button size="sm" onClick={books.retry}>
            Retry
          </Button>
        }
      >
        {books.error}
      </Banner>
    );

  function toggle(id: string, on: boolean) {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    onChange(next);
  }

  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 text-label font-medium text-ink">
        Books <span className="font-normal text-ink-secondary">({selected.size} picked)</span>
      </legend>
      <FilterField label="Filter books" placeholder="Filter by title or pen name" value={query} onChange={setQuery} count={shown.length} />
      {groups.length === 0 ? (
        <p className="text-small text-ink-secondary">{q ? `No books match “${query.trim()}”.` : "Every book is already in a batch or published."}</p>
      ) : (
        <div className="grid max-h-[320px] gap-3 overflow-y-auto rounded-md border border-border px-3 py-2">
          {groups.map(([pen, list]) => (
            <div key={pen} role="group" aria-label={pen}>
              <p className="pt-1 text-[13px] font-semibold text-ink-secondary">{pen}</p>
              {list.map((b) => {
                const taken = takenBy.has(b.id);
                return (
                  <Checkbox
                    key={b.id}
                    label={b.title}
                    description={taken ? "Already in another batch." : undefined}
                    checked={selected.has(b.id)}
                    disabled={taken}
                    onChange={(on) => toggle(b.id, on)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      )}
    </fieldset>
  );
}

function errorWords(e: unknown): string {
  if (isApiError(e) && e.code === "conflict") return `${e.message} Remove that book from its other batch first.`;
  return apiErrorText(e);
}

export function NewBatchDialog({
  open,
  mode,
  onClose,
  onCreate,
}: {
  open: boolean;
  mode: WireMode;
  onClose: () => void;
  onCreate: (input: { name: string; notes: string | null; bookIds: string[] }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const taken = useBooksInBatches(mode, null);
  const none = useMemo(() => new Set<string>(), []);

  const nameError = tried && !name.trim() ? "Give the batch a name." : undefined;
  const booksError = tried && picked.size === 0 ? "Pick at least one book." : undefined;

  function reset() {
    setName("");
    setNotes("");
    setPicked(new Set());
    setError(null);
    setTried(false);
  }
  function close() {
    reset();
    onClose();
  }
  function submit() {
    setTried(true);
    if (!name.trim() || picked.size === 0) return;
    setBusy(true);
    setError(null);
    onCreate({ name: name.trim(), notes: notes.trim() || null, bookIds: [...picked] }).then(
      () => {
        setBusy(false);
        reset();
      },
      (e: unknown) => {
        setBusy(false);
        setError(errorWords(e));
      },
    );
  }

  return (
    <Modal
      open={open}
      onClose={close}
      size="lg"
      title="New batch"
      description="Each book runs one at a time with its pen name's voice and the usual checks. Nothing starts until you press Start batch."
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" icon={Layers} loading={busy} loadingLabel="Creating" onClick={submit}>
            Create batch
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} error={nameError} autoComplete="off" />
        <Textarea label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={4000} />
        <BookPicker mode={mode} selected={picked} onChange={setPicked} exclude={none} takenBy={taken} />
        {booksError && (
          <p role="alert" className="text-small text-claim">
            {booksError}
          </p>
        )}
        {error && (
          <Banner tone="error" title="The batch was not created">
            {error}
          </Banner>
        )}
      </form>
    </Modal>
  );
}

export function AddBooksDialog({
  open,
  mode,
  batchId,
  inBatch,
  onClose,
  onAdd,
}: {
  open: boolean;
  mode: WireMode;
  batchId: string;
  inBatch: Set<string>;
  onClose: () => void;
  onAdd: (bookIds: string[]) => Promise<void>;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const taken = useBooksInBatches(mode, batchId);

  function close() {
    setPicked(new Set());
    setError(null);
    onClose();
  }
  function submit() {
    if (picked.size === 0) return;
    setBusy(true);
    setError(null);
    onAdd([...picked]).then(
      () => {
        setBusy(false);
        setPicked(new Set());
      },
      (e: unknown) => {
        setBusy(false);
        setError(errorWords(e));
      },
    );
  }

  return (
    <Modal
      open={open}
      onClose={close}
      size="lg"
      title="Add books to this batch"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={Plus}
            loading={busy}
            loadingLabel="Adding"
            disabledReason={picked.size === 0 ? "Pick at least one book." : undefined}
            onClick={submit}
          >
            {picked.size === 1 ? "Add 1 book" : `Add ${picked.size} books`}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <BookPicker mode={mode} selected={picked} onChange={setPicked} exclude={inBatch} takenBy={taken} />
        {error && (
          <Banner tone="error" title="The books were not added">
            {error}
          </Banner>
        )}
      </div>
    </Modal>
  );
}
