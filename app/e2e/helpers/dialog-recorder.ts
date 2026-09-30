import type { Dialog, Page } from '@playwright/test';
import type { QuartetEventSink } from './mega-audit-snap';

/**
 * AUDIT_PLAN §0.2 item 5. On web, `confirmAction` → `window.confirm`
 * (src/utils/uiUtils.ts) and `showAlert` → `window.alert` / `window.confirm`
 * (src/utils/alert.ts). Playwright DISMISSES dialogs by default, so an unhandled
 * confirm silently returns false. This recorder accepts by default, records every
 * message, and — when given the mega-audit recorder — appends
 * `{level:'dialog', type, message, action}` to the next quartet's console.json.
 */
export type DialogType = 'alert' | 'confirm' | 'prompt' | 'beforeunload';
export type DialogAction = 'accepted' | 'dismissed';

export type DialogRecord = {
  type: DialogType;
  message: string;
  action: DialogAction;
  /** Only for prompts: the text passed to accept(). */
  promptText?: string;
  ts: number;
};

export type DialogRecorderOptions = {
  /** Default policy for every dialog. Default 'accept'. */
  mode?: 'accept' | 'dismiss';
  /** Text returned by an accepted `window.prompt`. Default: the prompt's default value. */
  promptText?: string;
};

export type DialogRecorder = {
  /** Every dialog seen so far, in order (live array). */
  readonly dialogs: DialogRecord[];
  /** Change the default policy for subsequent dialogs. */
  setMode: (mode: 'accept' | 'dismiss') => void;
  /** Apply `action` to the NEXT dialog only, then revert to the default mode. */
  next: (action: 'accept' | 'dismiss') => void;
  /** Messages only (convenience for assertions). */
  messages: () => string[];
  /** Resolve with the next dialog record (or reject after `timeout` ms). */
  waitForNext: (timeout?: number) => Promise<DialogRecord>;
  dispose: () => void;
};

export function attachDialogRecorder(
  page: Page,
  recorder?: QuartetEventSink,
  options: DialogRecorderOptions = {},
): DialogRecorder {
  const dialogs: DialogRecord[] = [];
  let mode: 'accept' | 'dismiss' = options.mode ?? 'accept';
  let once: 'accept' | 'dismiss' | null = null;
  const waiters: Array<(r: DialogRecord) => void> = [];

  const onDialog = async (dialog: Dialog) => {
    const policy = once ?? mode;
    once = null;
    const type = dialog.type() as DialogType;
    const message = dialog.message();
    const promptText = type === 'prompt' ? (options.promptText ?? dialog.defaultValue()) : undefined;
    const record: DialogRecord = {
      type,
      message,
      action: policy === 'accept' ? 'accepted' : 'dismissed',
      ...(promptText !== undefined && policy === 'accept' ? { promptText } : {}),
      ts: Date.now(),
    };
    dialogs.push(record);
    recorder?.recordEvent({
      level: 'dialog',
      type,
      message,
      action: record.action,
      text: `[${type}:${record.action}] ${message}`,
      ts: record.ts,
    });
    try {
      if (policy === 'accept') await dialog.accept(promptText);
      else await dialog.dismiss();
    } catch {
      /* page closed / dialog already handled */
    }
    waiters.splice(0).forEach((w) => w(record));
  };

  page.on('dialog', onDialog);

  return {
    dialogs,
    setMode: (m) => {
      mode = m;
    },
    next: (a) => {
      once = a;
    },
    messages: () => dialogs.map((d) => d.message),
    waitForNext: (timeout = 10_000) =>
      new Promise<DialogRecord>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`no dialog within ${timeout}ms`)), timeout);
        waiters.push((r) => {
          clearTimeout(timer);
          resolve(r);
        });
      }),
    dispose: () => page.off('dialog', onDialog),
  };
}
