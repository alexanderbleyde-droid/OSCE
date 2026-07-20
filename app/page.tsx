import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center">
      <div className="absolute top-6 right-6">
        <ThemeToggle />
      </div>

      <div className="flex flex-col items-center gap-5">
        <BrandMark size={56} />
        <h1 className="font-display text-2xl font-medium tracking-[-0.015em] text-primary">
          Plexus <span className="text-tertiary">/</span>{" "}
          <span className="text-secondary">OSCE</span>{" "}
          <span className="text-tertiary">· V3</span>
        </h1>
      </div>
    </main>
  );
}
