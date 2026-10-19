import type { MouseEvent, ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Button, type ButtonProps } from "../../components/ui/Button";
import { ChooseTitleButton, chooseHeldReason } from "./TitleCard";

type ButtonElement = ReactElement<{ onClick: (e: MouseEvent<HTMLButtonElement>) => void }>;

/** Presses the rendered button the way React would, without a browser. */
function press(el: ReactElement<ButtonProps>): void {
  const button = Button(el.props) as ButtonElement;
  const preventDefault = vi.fn();
  button.props.onClick({ preventDefault } as unknown as MouseEvent<HTMLButtonElement>);
}

describe("Use this title", () => {
  it("can be pressed when nothing is saving", () => {
    const onChoose = vi.fn();
    const html = renderToStaticMarkup(<ChooseTitleButton invalid={false} onChoose={onChoose} />);
    expect(html).not.toContain("aria-busy");
    expect(html).not.toContain("aria-disabled");
    press(ChooseTitleButton({ invalid: false, onChoose }) as ReactElement<ButtonProps>);
    expect(onChoose).toHaveBeenCalledTimes(1);
  });

  it("shows Saving, is busy and disabled, and ignores a second press while the choice saves", () => {
    const onChoose = vi.fn();
    const html = renderToStaticMarkup(<ChooseTitleButton invalid={false} saving busy onChoose={onChoose} />);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain("Saving");
    press(ChooseTitleButton({ invalid: false, saving: true, busy: true, onChoose }) as ReactElement<ButtonProps>);
    expect(onChoose).not.toHaveBeenCalled();
  });

  it("holds the other options while one choice saves", () => {
    expect(chooseHeldReason({ invalid: false, saving: false, busy: true })).toBe("Wait until the other title is saved.");
    expect(chooseHeldReason({ invalid: false, saving: true, busy: true })).toBeUndefined();
    expect(chooseHeldReason({ invalid: true, saving: false, busy: false })).toBe("Fix this option before you choose it.");
    expect(chooseHeldReason({ invalid: false, saving: false, busy: false })).toBeUndefined();
    const html = renderToStaticMarkup(<ChooseTitleButton invalid={false} busy onChoose={() => undefined} />);
    expect(html).toContain('aria-disabled="true"');
  });
});
