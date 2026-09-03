'use client';

import { useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import {
  useAddMember,
  useRemoveMember,
  useUpdateMember,
} from '@/features/boards/mutations';
import { BoardMember, BoardRole } from '@/features/boards/types';

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  boardId: string;
  members: BoardMember[];
  currentUserId: string;
}

export function ShareDialog({
  open,
  onClose,
  boardId,
  members,
  currentUserId,
}: ShareDialogProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<BoardRole>('EDITOR');

  const addMember = useAddMember(boardId);
  const updateMember = useUpdateMember(boardId);
  const removeMember = useRemoveMember(boardId);

  const invite = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    try {
      await addMember.mutateAsync({ email: trimmed, role });
      setEmail('');
    } catch {
      /* toast handled in the mutation */
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Share board" className="max-w-lg">
      <div className="space-y-4">
        {/* Invite row */}
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && invite()}
            placeholder="teammate@example.com"
            className="min-w-0 flex-1 rounded-card border border-rule bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as BoardRole)}
            className="rounded-card border border-rule bg-surface px-2 text-sm outline-none focus:border-accent"
          >
            <option value="EDITOR">Editor</option>
            <option value="VIEWER">Viewer</option>
          </select>
          <Button onClick={invite} disabled={addMember.isPending || !email.trim()}>
            Invite
          </Button>
        </div>

        {/* Member list */}
        <ul className="divide-y divide-rule rounded-card border border-rule">
          {members.map((m) => {
            const isSelf = m.userId === currentUserId;
            const isOwner = m.role === 'OWNER';
            return (
              <li key={m.userId} className="flex items-center gap-3 px-3 py-2">
                <Avatar name={m.user.name} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">
                    {m.user.name} {isSelf && <span className="text-ink-muted">(you)</span>}
                  </p>
                  <p className="truncate text-[12px] text-ink-muted">{m.user.email}</p>
                </div>

                {isOwner ? (
                  <span className="rounded bg-accent-wash px-2 py-0.5 text-[12px] font-medium text-accent">
                    Owner
                  </span>
                ) : (
                  <select
                    value={m.role}
                    onChange={(e) =>
                      updateMember.mutate({ userId: m.userId, role: e.target.value as BoardRole })
                    }
                    className="rounded border border-rule bg-surface px-1.5 py-1 text-[12px] outline-none focus:border-accent"
                  >
                    <option value="EDITOR">Editor</option>
                    <option value="VIEWER">Viewer</option>
                  </select>
                )}

                {!isOwner && (
                  <button
                    onClick={() => removeMember.mutate(m.userId)}
                    className="text-ink-muted hover:text-spine-urgent"
                    aria-label={`Remove ${m.user.name}`}
                    title="Remove"
                  >
                    ✕
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <p className="text-[12px] text-ink-muted">
          Editors can change columns and tasks. Viewers can only look.
        </p>
      </div>
    </Dialog>
  );
}
