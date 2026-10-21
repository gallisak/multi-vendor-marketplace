import { Download } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { request } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { errorMessage } from '@/shared/ui/states';

type Format = 'csv' | 'json';

function fileName(response: Response, format: Format) {
  const header = response.headers.get('content-disposition') ?? '';
  return /filename="([^"]+)"/.exec(header)?.[1] ?? `sales-report.${format}`;
}

export function ExportButtons({ from, to }: { from?: string; to?: string }) {
  const [pending, setPending] = useState<Format | null>(null);

  const download = async (format: Format) => {
    setPending(format);
    try {
      const response = await request('/admin/analytics/export', { query: { from, to, format } });
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName(response, format);
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="flex gap-2">
      {(['csv', 'json'] as const).map((format) => (
        <Button
          key={format}
          size="sm"
          variant="outline"
          disabled={pending !== null}
          onClick={() => void download(format)}
        >
          <Download /> {format.toUpperCase()}
        </Button>
      ))}
    </div>
  );
}
