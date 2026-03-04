import { Button } from '@/components/ui';

interface PaginationControlsProps {
  offset: number;
  limit: number;
  total: number;
  onChange: (nextOffset: number) => void;
}

export function PaginationControls({
  offset,
  limit,
  total,
  onChange,
}: PaginationControlsProps) {
  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="row">
      <Button
        variant="secondary"
        disabled={offset <= 0}
        onClick={() => onChange(Math.max(0, offset - limit))}
      >
        Previous
      </Button>
      <span className="muted">Page {page} of {totalPages}</span>
      <Button
        variant="secondary"
        disabled={offset + limit >= total}
        onClick={() => onChange(offset + limit)}
      >
        Next
      </Button>
    </div>
  );
}
