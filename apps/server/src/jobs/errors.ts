/** Control-flow signals and typed failures used by job handlers. */

export class JobCancelled extends Error {
  override name = 'JobCancelled';
  constructor() {
    super('The job was cancelled.');
  }
}

export class JobPaused extends Error {
  override name = 'JobPaused';
  constructor() {
    super('The job was paused.');
  }
}

export class BudgetPaused extends Error {
  override name = 'BudgetPaused';
  constructor(
    message: string,
    readonly details: { scope: 'book' | 'month' | 'credits'; limitUsd: number; spentUsd: number; estimateUsd: number },
  ) {
    super(message);
  }
}

/** A failure that retrying will not fix (bad input, invalid AI output after repair, missing data). */
export class JobFailed extends Error {
  override name = 'JobFailed';
  constructor(
    message: string,
    readonly code: string = 'job_failed',
    /** Kept as the job's result (for example the files an export built before its pack was stopped). */
    readonly result?: unknown,
  ) {
    super(message);
  }
}
