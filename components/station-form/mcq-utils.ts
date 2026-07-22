/**
 * MCQ option-removal semantics (pure, covered by scripts/form-checks.ts):
 * - removing a NON-correct option keeps the marker on the same option
 *   (index shifts down when an earlier option is removed);
 * - removing the CORRECT option clears the selection entirely — another
 *   option is NEVER silently promoted; the author must re-choose.
 */
export function removeMcqOption<T extends { options: string[]; correctIndex: number | null }>(
  mcq: T,
  removeIndex: number,
): T {
  const options = mcq.options.filter((_, i) => i !== removeIndex);
  let correctIndex = mcq.correctIndex;
  if (correctIndex !== null) {
    if (removeIndex === correctIndex) {
      correctIndex = null;
    } else if (removeIndex < correctIndex) {
      correctIndex -= 1;
    }
  }
  return { ...mcq, options, correctIndex };
}
