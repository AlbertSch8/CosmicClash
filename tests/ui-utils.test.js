// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  withButtonLock,
  lockButtons,
  showToast,
  showInlineError,
  showInlinePending,
  clearInlineStatus,
  setLoadingState,
  esc,
} from "../src/ui-utils.js";

describe("ui-utils", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.head.innerHTML = "";
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("esc escapes unsafe html chars", () => {
    const input = '<script a="1">&</script>';
    expect(esc(input)).toBe("&lt;script a=&quot;1&quot;&gt;&amp;&lt;/script&gt;");
  });

  it("esc handles nullish values", () => {
    expect(esc(null)).toBe("");
    expect(esc(undefined)).toBe("");
  });

  it("lockButtons disables buttons and unlock reverses it", () => {
    const b1 = document.createElement("button");
    const b2 = document.createElement("button");

    const unlock = lockButtons(b1, b2, null, undefined);

    expect(b1.disabled).toBe(true);
    expect(b2.disabled).toBe(true);

    unlock();

    expect(b1.disabled).toBe(false);
    expect(b2.disabled).toBe(false);
  });

  it("withButtonLock toggles state and restores original text", async () => {
    const btn = document.createElement("button");
    btn.innerHTML = "Save";

    const result = await withButtonLock(btn, "Loading...", async () => {
      expect(btn.disabled).toBe(true);
      expect(btn.innerHTML).toContain("Loading...");
      expect(btn.innerHTML).toContain("btn-spinner");
      return 42;
    });

    expect(result).toBe(42);
    expect(btn.disabled).toBe(false);
    expect(btn.innerHTML).toBe("Save");
  });

  it("withButtonLock restores button even if wrapped function throws", async () => {
    const btn = document.createElement("button");
    btn.innerHTML = "Run";

    await expect(
      withButtonLock(btn, "Loading...", async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    expect(btn.disabled).toBe(false);
    expect(btn.innerHTML).toBe("Run");
  });

  it("showInlineError uses inline element when available", () => {
    const status = document.createElement("p");
    status.id = "status";
    document.body.appendChild(status);

    showInlineError("status", "Something failed");

    expect(status.textContent).toBe("Something failed");
    expect(status.style.color).toBe("rgb(252, 165, 165)");
    expect(status.style.display).toBe("block");
  });

  it("showInlineError falls back to toast if element is missing", () => {
    showInlineError("missing", "Fallback message");

    const toast = document.getElementById("cc-toast");
    expect(toast).not.toBeNull();
    expect(toast.textContent).toContain("Fallback message");
  });

  it("showInlinePending and clearInlineStatus update visibility", () => {
    const status = document.createElement("p");
    status.id = "status";
    document.body.appendChild(status);

    showInlinePending("status", "Please wait");
    expect(status.textContent).toBe("Please wait");
    expect(status.style.display).toBe("block");

    clearInlineStatus("status");
    expect(status.textContent).toBe("");
    expect(status.style.display).toBe("none");
  });

  it("setLoadingState swaps content and restores original content", () => {
    const container = document.createElement("div");
    container.innerHTML = "<strong>Original</strong>";

    setLoadingState(container, true, '<b>unsafe</b>');

    expect(container.dataset.origContent).toBe("<strong>Original</strong>");
    expect(container.innerHTML).toContain("&lt;b&gt;unsafe&lt;/b&gt;");

    setLoadingState(container, false);

    expect(container.innerHTML).toBe("<strong>Original</strong>");
    expect(container.dataset.origContent).toBeUndefined();
  });

  it("showToast keeps only one toast, injects style once, and auto removes", () => {
    vi.useFakeTimers();

    showToast("First", "info", 3000);
    showToast("Second", "success", 3000);

    const allToasts = document.querySelectorAll("#cc-toast");
    expect(allToasts.length).toBe(1);
    expect(allToasts[0].textContent).toContain("Second");

    const styles = document.querySelectorAll("#cc-toast-style");
    expect(styles.length).toBe(1);

    vi.advanceTimersByTime(3000);
    expect(document.getElementById("cc-toast")).toBeNull();
  });
});
