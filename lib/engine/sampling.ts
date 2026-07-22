/**
 * Question-pool sampling — pillar 5 (reference: ITB S6).
 * Each session draws 2-3 questions, ALWAYS including >=1 Safety and
 * >=1 Lifestyle when the pool categorizes them. Sampling happens ONCE,
 * at attempt creation; the sampled set persists on the attempt.
 *
 * Pure and injectable-rng for scripted verification.
 */

export type SampleableQuestion = {
  id: string;
  category: "safety" | "lifestyle" | "general";
};

export function sampleQuestions<T extends SampleableQuestion>(
  pool: T[],
  rng: () => number = Math.random,
): T[] {
  if (pool.length <= 2) return [...pool];

  const pickOne = <U,>(items: U[]): U => items[Math.floor(rng() * items.length)]!;

  const safety = pool.filter((q) => q.category === "safety");
  const lifestyle = pool.filter((q) => q.category === "lifestyle");

  const picked: T[] = [];
  if (safety.length > 0) picked.push(pickOne(safety));
  if (lifestyle.length > 0) picked.push(pickOne(lifestyle));

  // Draw 2 or 3 total (never fewer than the mandatory picks).
  const target = Math.max(picked.length, Math.min(pool.length, 2 + (rng() < 0.5 ? 0 : 1)));

  const remaining = pool.filter((q) => !picked.some((p) => p.id === q.id));
  while (picked.length < target && remaining.length > 0) {
    const idx = Math.floor(rng() * remaining.length);
    picked.push(remaining.splice(idx, 1)[0]!);
  }

  // Shuffle so the mandatory categories don't always lead.
  for (let i = picked.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [picked[i], picked[j]] = [picked[j]!, picked[i]!];
  }
  return picked;
}
