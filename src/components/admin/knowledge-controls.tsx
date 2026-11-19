"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, LoaderCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  addKnowledgeDocumentAction,
  removeKnowledgeDocumentAction,
} from "@/app/(dashboard)/admin/actions";

const EMPTY = { title: "", category: "", text: "" };

/** Spec §9 — add a clinic document the knowledge assistant can answer from. */
export function AddKnowledgeDocumentDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState(EMPTY);

  function reset(next: boolean) {
    setOpen(next);
    if (!next) {
      setError(null);
      setForm(EMPTY);
    }
  }

  async function readFile(file: File) {
    setError(null);
    if (file.size > 400_000) {
      setError("That file is too large. Choose a smaller one, or paste the part you need.");
      return;
    }
    const text = await file.text();
    setForm((f) => ({
      ...f,
      text,
      title: f.title || file.name.replace(/\.(txt|md)$/i, ""),
    }));
  }

  return (
    <>
      <Button variant="accent" onClick={() => setOpen(true)}>
        <FilePlus2 />
        Add document
      </Button>
      <Dialog open={open} onOpenChange={reset}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add a document</DialogTitle>
            <DialogDescription>
              A policy, SOP or fee schedule. Doctors can then ask the assistant
              about it, and each answer points to the passage it came from.
            </DialogDescription>
          </DialogHeader>

          <form
            id="add-knowledge"
            className="space-y-3 px-6"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              startTransition(async () => {
                const result = await addKnowledgeDocumentAction(form);
                if (result.ok) {
                  toast.success(result.message ?? "Added.", { description: result.action });
                  reset(false);
                  router.refresh();
                } else {
                  setError([result.message, result.action].filter(Boolean).join(" "));
                }
              });
            }}
          >
            <div>
              <label htmlFor="knowledge-title" className="text-[13px] font-semibold text-muted-foreground">
                Title
              </label>
              <Input
                id="knowledge-title"
                className="mt-1.5"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                maxLength={120}
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="knowledge-category" className="text-[13px] font-semibold text-muted-foreground">
                Category <span className="font-normal">(optional)</span>
              </label>
              <Input
                id="knowledge-category"
                className="mt-1.5"
                placeholder="Policy, SOP, Billing…"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                maxLength={40}
              />
            </div>
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <label htmlFor="knowledge-text" className="text-[13px] font-semibold text-muted-foreground">
                  Text
                </label>
                <label className="cursor-pointer text-[13px] font-semibold text-accent-ink hover:underline">
                  Choose a text file
                  <input
                    type="file"
                    accept=".txt,.md,text/plain,text/markdown"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void readFile(file);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              <Textarea
                id="knowledge-text"
                className="mt-1.5 max-h-64 min-h-40"
                placeholder="Paste the document here. Leave a blank line between sections."
                value={form.text}
                onChange={(e) => setForm({ ...form, text: e.target.value })}
              />
            </div>
            {error && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive-soft px-3 py-2 text-[14px] text-destructive"
              >
                {error}
              </p>
            )}
          </form>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button
              type="submit"
              form="add-knowledge"
              variant="accent"
              disabled={pending || !form.title.trim() || !form.text.trim()}
            >
              {pending && <LoaderCircle className="animate-spin" />}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RemoveKnowledgeDocumentButton({
  documentId,
  title,
}: {
  documentId: string;
  title: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Remove ${title}`}
        onClick={() => setOpen(true)}
      >
        <Trash2 />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove {title}?</DialogTitle>
            <DialogDescription>
              The assistant stops answering from it straight away.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Keep it</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await removeKnowledgeDocumentAction(documentId);
                  if (result.ok) {
                    toast.success(result.message ?? "Removed.");
                    setOpen(false);
                    router.refresh();
                  } else {
                    toast.error(result.message ?? "That did not work.", {
                      description: result.action,
                    });
                  }
                })
              }
            >
              {pending && <LoaderCircle className="animate-spin" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
