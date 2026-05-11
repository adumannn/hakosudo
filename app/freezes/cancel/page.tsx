import Link from "next/link";

export default function FreezesCancel() {
  return (
    <main className="bg-seal text-bone min-h-screen flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <div className="mono text-[11px] tracking-[0.22em] uppercase text-bone/55">
          Purchase cancelled
        </div>
        <p className="ital text-bone/70 mt-3 text-[16px]">
          No charge made. You can try again any time.
        </p>
        <Link href="/" className="btn-hako ghost border-bone text-bone mt-8">
          back to today
        </Link>
      </div>
    </main>
  );
}
