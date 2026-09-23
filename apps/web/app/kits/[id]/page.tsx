import { Suspense } from 'react';
import { RequireAuth } from '../../../modules/auth/components/require-auth';
import { KitBuilder } from '../../../modules/builder/components/kit-builder';
import { LoadingRows } from '../../../common/components/ui';

export default function KitPage({ params }: { params: { id: string } }) {
  const { id } = params;
  return (
    <RequireAuth>
      {/* useSearchParams needs a Suspense boundary to avoid opting the
          whole route into client-side rendering at build time. */}
      <Suspense
        fallback={
          <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
            <LoadingRows rows={4} />
          </div>
        }
      >
        <KitBuilder kitId={id} />
      </Suspense>
    </RequireAuth>
  );
}
