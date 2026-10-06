import { useState } from "react";
import { Save } from "lucide-react";
import { Banner, Button, Input, Modal } from "../../components/ui";
import { useSetPublishedDetails } from "../../api/hooks";
import type { ApiListPrices } from "../../api/types";
import { apiErrorText } from "../../api/wire-a";

/* Owner-entered published details for a server book: the marketplace and the list price of each format,
   in pounds as entered in KDP. Saved with PATCH /books/:id; an empty price clears it. */

type PriceKey = keyof ApiListPrices;
const FORMATS: { key: PriceKey; label: string }[] = [
  { key: "ebook", label: "Kindle eBook" },
  { key: "paperback", label: "Paperback" },
  { key: "hardcover", label: "Hardcover" },
];
const MARKETPLACE = /^amazon\.[a-z.]{2,12}$/i;

function priceText(n: number | null): string {
  return n === null ? "" : n.toFixed(2);
}

function parsePrice(s: string): number | null | "bad" {
  const t = s.replace(/[£,\s]/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 1000 ? Math.round(n * 100) / 100 : "bad";
}

interface Props {
  open: boolean;
  onClose: () => void;
  bookId: string;
  title: string;
  marketplace: string;
  prices: ApiListPrices;
  onSaved: (message: string) => void;
}

export function PublishedDetailsDialog({ open, onClose, bookId, title, marketplace, prices, onSaved }: Props) {
  const [store, setStore] = useState(marketplace);
  const [values, setValues] = useState<Record<PriceKey, string>>({
    ebook: priceText(prices.ebook),
    paperback: priceText(prices.paperback),
    hardcover: priceText(prices.hardcover),
  });
  const save = useSetPublishedDetails();
  const storeError = store.trim() && !MARKETPLACE.test(store.trim()) ? "Use a store such as amazon.co.uk or amazon.com." : undefined;
  const parsed = Object.fromEntries(FORMATS.map((f) => [f.key, parsePrice(values[f.key])])) as Record<PriceKey, number | null | "bad">;
  const priceError = (k: PriceKey) => (parsed[k] === "bad" ? "Enter a price in pounds, for example 8.99, or leave it empty." : undefined);
  const invalid = Boolean(storeError) || FORMATS.some((f) => parsed[f.key] === "bad");

  function submit() {
    if (invalid) return;
    const listPrices: Partial<ApiListPrices> = {};
    for (const f of FORMATS) {
      const v = parsed[f.key];
      if (v !== "bad") listPrices[f.key] = v;
    }
    save.mutate(
      { bookId, listPrices, marketplace: store.trim() ? store.trim().toLowerCase() : null },
      {
        onSuccess: () => {
          onSaved(`Saved the prices and store for ${title}.`);
          onClose();
        },
      },
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={`Prices for ${title}`}
      description="As entered in KDP. Volume shows them on the shelf; it never sets prices on Amazon."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={Save}
            loading={save.isPending}
            loadingLabel="Saving"
            disabledReason={invalid ? "Fix the fields marked in red first." : undefined}
            onClick={submit}
          >
            Save prices
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Input
          label="Marketplace"
          value={store}
          onChange={(e) => setStore(e.target.value)}
          error={storeError}
          hint="Empty goes back to amazon.co.uk."
          autoComplete="off"
        />
        {FORMATS.map((f) => (
          <Input
            key={f.key}
            label={`${f.label}, pounds`}
            inputMode="decimal"
            value={values[f.key]}
            onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
            error={priceError(f.key)}
            placeholder="Not set"
          />
        ))}
        {save.isError && (
          <Banner tone="error" title="Prices not saved">
            {apiErrorText(save.error)}
          </Banner>
        )}
      </div>
    </Modal>
  );
}
