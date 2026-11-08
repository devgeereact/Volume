/**
 * What search engines are told on the live pages, for the deploy script's live checks.
 *
 * The private app must never be indexed, so /sign-in (an app page, always the same for a signed-out visitor) has to be
 * noindex. The landing page is indexable on purpose since D-068 and was noindex before, so it only has to carry a
 * robots meta tag; its policy is the app's to choose, not the deploy check's.
 */

/** The content of the robots meta tag, whichever way round its attributes are written, or null when there is none. */
function robotsContent(html) {
  const tag = html.match(/<meta\b[^>]*\bname=["']robots["'][^>]*>/i);
  if (!tag) return null;
  const content = tag[0].match(/\bcontent=["']([^"']*)["']/i);
  return content ? content[1].toLowerCase() : null;
}

/** Problems with the robots meta tags of the landing page and the sign-in page (empty when both are fine). */
export function robotsProblems(home, signIn) {
  const problems = [];
  if (robotsContent(home) === null) problems.push('the landing page has no robots meta');
  const signInRobots = robotsContent(signIn);
  if (signInRobots === null || !/\bnoindex\b/.test(signInRobots)) problems.push('the sign-in page is not noindex');
  return problems;
}
