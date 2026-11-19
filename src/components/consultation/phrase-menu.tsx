"use client";

import * as React from "react";
import { BookmarkPlus, TextQuote, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BUILT_IN_PHRASES, type PhraseField } from "@/lib/clinical-phrases";
import {
  deletePhraseAction,
  savePhraseAction,
} from "@/app/(dashboard)/doctor/consultations/[visitId]/actions";
import { useConsultation } from "./consultation-context";

/**
 * Quick text for one field of the note: the routine sentences a doctor would
 * otherwise type for every patient. A click appends the phrase to the field —
 * the doctor still reads and edits it there — and whatever is in the field can
 * be saved as a phrase of their own.
 */
export function PhraseMenu({
  field,
  label,
  current,
  onInsert,
}: {
  field: PhraseField;
  label: string;
  current: string;
  onInsert: (text: string) => void;
}) {
  const { favourites, setFavourites } = useConsultation();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const mine = favourites.phrases.filter((p) => p.field === field);
  const builtIn = BUILT_IN_PHRASES[field].filter(
    (text) => !mine.some((p) => p.text.toLowerCase() === text.toLowerCase()),
  );
  const text = current.trim();
  const alreadySaved =
    text.length < 2 ||
    mine.some((p) => p.text.toLowerCase() === text.toLowerCase()) ||
    builtIn.some((b) => b.toLowerCase() === text.toLowerCase());

  function insert(phrase: string) {
    onInsert(phrase);
    setOpen(false);
  }

  function save() {
    startTransition(async () => {
      const result = await savePhraseAction({ field, text });
      if (result.ok && result.favourites) {
        setFavourites(result.favourites);
        toast.success("Saved to your quick text.");
      } else {
        toast.error(result.message ?? "Could not save the phrase.", { description: result.action });
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deletePhraseAction(id);
      if (result.ok && result.favourites) setFavourites(result.favourites);
      else toast.error(result.message ?? "Could not remove the phrase.");
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-2 text-[12px] text-muted-foreground"
          aria-label={`Quick text for ${label}`}
        >
          <TextQuote className="size-3" />
          Quick text
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-1.5">
        {mine.length === 0 && builtIn.length === 0 && (
          <p className="px-2 py-2 text-[13px] text-muted-foreground">
            Nothing saved for {label.toLowerCase()} yet. Write it once, then save it here.
          </p>
        )}
        {mine.length > 0 && (
          <PhraseGroup title="Yours">
            {mine.map((p) => (
              <li key={p.id} className="group flex items-start gap-1">
                <PhraseButton text={p.text} onClick={() => insert(p.text)} />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-7 shrink-0 opacity-60 hover:opacity-100"
                  aria-label="Remove this phrase"
                  disabled={pending}
                  onClick={() => remove(p.id)}
                >
                  <X className="size-3" />
                </Button>
              </li>
            ))}
          </PhraseGroup>
        )}
        {builtIn.length > 0 && (
          <PhraseGroup title="Common">
            {builtIn.map((phrase) => (
              <li key={phrase}>
                <PhraseButton text={phrase} onClick={() => insert(phrase)} />
              </li>
            ))}
          </PhraseGroup>
        )}
        <div className="mt-1 border-t border-border pt-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            disabled={pending || alreadySaved}
            onClick={save}
          >
            <BookmarkPlus />
            Save what&apos;s written as quick text
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PhraseGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-1">
      <p className="px-2 pb-1 text-[12px] font-medium text-muted-foreground">{title}</p>
      <ul className="max-h-56 space-y-0.5 overflow-y-auto">{children}</ul>
    </div>
  );
}

function PhraseButton({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full min-w-0 flex-1 rounded-md px-2 py-1.5 text-left text-[12.5px] leading-snug hover:bg-muted"
    >
      {text}
    </button>
  );
}
