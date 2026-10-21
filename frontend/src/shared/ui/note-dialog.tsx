import { zodResolver } from '@hookform/resolvers/zod';
import { type ReactNode, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from './button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog';
import { FormField } from './form-field';
import { Textarea } from './textarea';

export function NoteDialog({
  trigger,
  title,
  description,
  label,
  confirmLabel,
  destructive,
  minLength = 0,
  maxLength = 1000,
  pending,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description?: string;
  label: string;
  confirmLabel: string;
  destructive?: boolean;
  minLength?: number;
  maxLength?: number;
  pending?: boolean;
  onConfirm: (note: string) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const schema = useMemo(
    () =>
      z.object({
        note: z
          .string()
          .trim()
          .max(maxLength, `At most ${maxLength} characters`)
          .refine(
            (value) => value.length >= minLength,
            minLength > 0 ? `At least ${minLength} characters` : 'Required',
          ),
      }),
    [minLength, maxLength],
  );
  const form = useForm<{ note: string }>({
    resolver: zodResolver(schema),
    defaultValues: { note: '' },
  });

  const confirm = async ({ note }: { note: string }) => {
    try {
      await onConfirm(note);
      setOpen(false);
      form.reset();
    } catch {
      return;
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form
          onSubmit={(event) => void form.handleSubmit(confirm)(event)}
          className="space-y-4"
          noValidate
        >
          <DialogHeader>
            <DialogTitle className="pr-6">{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <FormField
            id="note-dialog-note"
            label={label}
            error={form.formState.errors.note?.message}
          >
            <Textarea id="note-dialog-note" {...form.register('note')} />
          </FormField>
          <DialogFooter>
            <Button
              type="submit"
              variant={destructive ? 'destructive' : 'default'}
              disabled={pending}
            >
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
