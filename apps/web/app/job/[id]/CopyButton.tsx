"use client";

import { useState } from "react";

interface CopyButtonProps {
  text: string;
  label?: string;
}

export default function CopyButton({ text, label = "Copy" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button
      className="btn-ghost btn-sm"
      onClick={handleClick}
      type="button"
      style={{ minWidth: 64 }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
