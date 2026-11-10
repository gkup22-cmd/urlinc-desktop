import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CREATE_NEW = "__create_new__";

export function CategorySelect({
  value,
  onChange,
  categories,
}: {
  value: string;
  onChange: (val: string) => void;
  categories: string[];
}) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [localCategories, setLocalCategories] = useState<string[]>([]);

  const allCategories = [...categories, ...localCategories.filter((c) => !categories.includes(c))];

  const confirm = () => {
    const name = draft.trim();
    if (!name) return;
    if (!allCategories.includes(name)) setLocalCategories((prev) => [...prev, name]);
    onChange(name);
    setCreating(false);
    setDraft("");
  };

  const cancel = () => { setCreating(false); setDraft(""); };

  if (creating) {
    return (
      <div className="flex gap-2">
        <Input
          autoFocus
          placeholder="New category name…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); confirm(); }
            if (e.key === "Escape") cancel();
          }}
        />
        <Button type="button" size="sm" onClick={confirm} disabled={!draft.trim()}>Add</Button>
        <Button type="button" size="sm" variant="ghost" onClick={cancel}>Cancel</Button>
      </div>
    );
  }

  return (
    <Select
      value={value}
      onValueChange={(val) => { if (val === CREATE_NEW) setCreating(true); else onChange(val); }}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select a category…" />
      </SelectTrigger>
      <SelectContent>
        {allCategories.map((cat) => (
          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
        ))}
        {allCategories.length > 0 && <SelectSeparator />}
        <SelectItem value={CREATE_NEW} className="text-primary font-medium">
          + Create New Category
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
