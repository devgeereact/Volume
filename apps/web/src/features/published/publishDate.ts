import type { Book } from "../../demo/types";

/* The publish date the owner enters on Mark as published: a local date, today or earlier (POST /books/:id/publish). */

/** Today as YYYY-MM-DD in the owner's time zone, the most a publish date may be. */
export function localToday(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Empty when the date is a real day not after today, else the reason in words. */
export function publishDateError(value: string, today: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Enter the date the book went live.";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime()) || localToday(parsed) !== value) return "Enter a real date.";
  if (value > today) return "The date cannot be after today.";
  return undefined;
}

/** The one rule for offering Mark as published, on Library cards and the Export screen: not published and not archived. */
export function canMarkPublished(book: Pick<Book, "published" | "archived" | "stage">): boolean {
  return book.published === null && book.stage !== "published" && !book.archived;
}
