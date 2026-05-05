import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { Pencil } from "lucide-react";
import { getSourceLabel } from "@/lib/constants";
interface Props {
  currentName: string | null;
  sessionId: string;
  onSave: (name: string) => void;
  source?: string;
  firstSeen?: string;
  entryCount?: number;
}

function generateSmartName(source?: string, firstSeen?: string, entryCount?: number): string {
  const parts: string[] = [];
  if (source) parts.push(getSourceLabel(source));
  if (firstSeen) {
    const d = new Date(firstSeen);
    parts.push(`${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
  }
  if (entryCount) parts.push(`${entryCount} msgs`);
  return parts.join(" · ") || "Sem nome";
}

export function SessionNameEditor({ currentName, sessionId: _sid, onSave, source, firstSeen, entryCount }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentName || "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function handleKey(e: KeyboardEvent) {
    if (e.key === "Enter") save();
    if (e.key === "Escape") {
      setValue(currentName || "");
      setEditing(false);
    }
  }

  function save() {
    const trimmed = value.trim();
    if (trimmed && trimmed !== currentName) {
      onSave(trimmed);
    }
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        onClick={() => {
          setValue(currentName || "");
          setEditing(true);
        }}
        className="group flex items-center gap-1.5 text-left transition-colors hover:text-foreground"
      >
        {currentName ? (
          <span>{currentName}</span>
        ) : (
          <span className="text-muted-foreground italic text-xs">
            {generateSmartName(source, firstSeen, entryCount)}
          </span>
        )}
        <Pencil className="h-3 w-3 text-muted-foreground opacity-30 transition-opacity group-hover:opacity-100" />
      </button>
    );
  }

  return (
    <Input
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKey}
      onBlur={save}
      placeholder="Nome da sessão..."
      className="h-7 w-48"
    />
  );
}
