import { claimFixVariables, claimHint, locateSentence, vetOptions } from '../claim-fix.js';
import { JobFailed } from '../errors.js';
import type { JobHandler } from '../runner.js';

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

/**
 * Claim fix options: runs editing.claim-fix on one claim's sentence in the current text and returns up to three vetted
 * options { text, approach, rationale, needsSource } as the job result, with the version they apply to. Nothing is
 * saved: POST /books/:id/claims/:claimId/apply saves the one the owner picks.
 */
export const claimFixHandler: JobHandler = async (jc) => {
  const { repos } = jc.services;
  const claimId = str(jc.payload['claimId']);
  if (!claimId) throw new JobFailed('Claim fix job is missing its claim.');
  const claim = await repos.manuscript.requireClaim(jc.ctx, claimId);
  if (!claim.sectionId) throw new JobFailed('This claim is not in a section, so there is no sentence to fix.', 'invalid_state');
  const current = await repos.manuscript.currentVersion(jc.ctx, claim.sectionId);
  if (!current) throw new JobFailed('This section has no text yet.', 'invalid_state');
  const at = locateSentence(current.bodyMd, claim.sentence, claimHint(claim, current.id));
  if (at === null) throw new JobFailed('The sentence is not in the current text any more. Open the section to check it.', 'conflict');
  const variables = await claimFixVariables(repos, jc.ctx, claim, current.bodyMd, at, str(jc.payload['instruction']));
  await jc.progress(0.1, 'Finding fixes');
  const res = await jc.runAi('claim_fix', { promptId: 'editing.claim-fix', variables, projectId: claim.projectId });
  const sources = variables['sources'] as { title: string | null; excerpt: string | null }[];
  const { kept, dropped } = vetOptions(res.output.options, claim.sentence, sources);
  if (kept.length === 0) throw new JobFailed('The model gave no fix that keeps to the facts. Try again or reword the instruction.', 'invalid_output');
  return {
    result: {
      claimId,
      sectionId: claim.sectionId,
      baseVersionId: current.id,
      sentence: claim.sentence,
      options: kept,
      ...(dropped > 0 ? { dropped } : {}),
    },
  };
};
