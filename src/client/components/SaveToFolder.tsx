import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage, post } from '../lib/api';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';

type Folder = { id: string; name: string; count: number };

export function SaveToFolder({ postId }: { postId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const toast = useToast();
  const qc = useQueryClient();
  const folders = useQuery({
    queryKey: ['folders'],
    queryFn: () => api<{ folders: Folder[] }>('/api/folders'),
    enabled: open,
  });
  const create = useMutation({
    mutationFn: () => post<{ id: string }>('/api/folders', { name }),
    onSuccess: () => {
      setName('');
      qc.invalidateQueries({ queryKey: ['folders'] });
    },
    onError: (e) => toast.show(errorMessage(e), 'error'),
  });
  const save = useMutation({
    mutationFn: (folderId: string) => post(`/api/folders/${folderId}/items`, { postId }),
    onSuccess: () => {
      toast.show('フォルダに保存しました', 'success');
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['folders'] });
    },
    onError: (e) => toast.show(errorMessage(e), 'error'),
  });

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        フォルダに保存
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="保存先フォルダ">
        <ul className="mb-4 flex flex-col gap-2">
          {folders.data?.folders.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => save.mutate(f.id)}
                className="w-full rounded-xl bg-white/60 px-3 py-2 text-left text-sm hover:bg-white"
              >
                {f.name} <span className="text-ink-soft">({f.count})</span>
              </button>
            </li>
          ))}
          {folders.data?.folders.length === 0 && (
            <li className="text-sm text-ink-soft">フォルダはまだありません</li>
          )}
        </ul>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <div className="flex-1">
            <Input
              label="新しいフォルダ"
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={create.isPending}>
            作成
          </Button>
        </form>
      </Modal>
    </>
  );
}
