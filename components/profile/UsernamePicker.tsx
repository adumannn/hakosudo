"use client";
import { useState, useTransition } from "react";
import { saveUsername } from "@/app/actions/save-username";

interface Props {
  current: string;
}

export function UsernamePicker({ current }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(current);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const submit = () => {
    setErr(null);
    start(async () => {
      const res = await saveUsername({ username: value });
      if (res.ok) {
        setEditing(false);
      } else {
        setErr(
          res.error === "format"
            ? "lowercase letters, numbers, _ or -, 2–20 chars"
            : res.error === "taken"
              ? "that handle is taken"
              : res.error === "auth"
                ? "sign in again"
                : "couldn't save",
        );
      }
    });
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(current);
          setEditing(true);
        }}
        className="mono text-[9.5px] tracking-[0.18em] uppercase text-moss hover:text-vermillion"
        aria-label="edit handle"
      >
        edit
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 mt-1">
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="mono text-[12px] text-moss">@</span>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") setEditing(false);
          }}
          maxLength={20}
          className="border-[1.5px] border-sumi bg-bone px-2 py-1 mono text-[12px] text-sumi outline-none focus:bg-paper transition-colors w-[160px]"
        />
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="mono text-[10px] tracking-[0.2em] uppercase bg-sumi text-bone px-2.5 py-1 disabled:opacity-50"
        >
          {pending ? "…" : "save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setErr(null);
          }}
          className="mono text-[10px] tracking-[0.2em] uppercase text-moss hover:text-sumi px-1.5 py-1"
        >
          cancel
        </button>
      </div>
      {err && (
        <span className="ital text-[12px] text-vermillion-deep">— {err}</span>
      )}
    </div>
  );
}
