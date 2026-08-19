// Loading skeleton components for better UX
import XSpinner from "./ui-kit/XSpinner";

export function LoadingSpinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const px = { sm: 16, md: 32, lg: 48 }[size];
  return (
    <div className="flex items-center justify-center">
      <XSpinner size={px} />
    </div>
  );
}

export function ProjectCardSkeleton() {
  return (
    <div className="bg-surface rounded-[4px] border border-line p-5 animate-pulse">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="h-5 bg-subtle rounded w-3/4 mb-2" />
          <div className="h-4 bg-subtle rounded w-full" />
        </div>
      </div>

      {/* Info lines */}
      <div className="space-y-2 mb-4">
        <div className="h-4 bg-subtle rounded w-2/3" />
        <div className="h-4 bg-subtle rounded w-1/2" />
        <div className="h-4 bg-subtle rounded w-3/5" />
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 pt-3 border-t border-line">
        <div className="h-4 bg-subtle rounded w-20" />
        <div className="h-4 bg-subtle rounded w-20" />
      </div>
    </div>
  );
}

export function VisitCardSkeleton() {
  return (
    <div className="bg-surface rounded-[4px] border border-line p-5 animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="h-4 bg-subtle rounded w-32 mb-2" />
          <div className="flex items-center gap-2 mb-2">
            <div className="h-6 w-20 bg-subtle rounded" />
            <div className="h-6 w-24 bg-subtle rounded" />
          </div>
          <div className="h-4 bg-subtle rounded w-40 mb-3" />
        </div>
        <div className="h-4 w-12 bg-subtle rounded" />
      </div>
      <div className="h-12 bg-subtle rounded mb-3" />
      <div className="flex gap-2">
        <div className="w-20 h-20 bg-subtle rounded-[4px]" />
        <div className="w-20 h-20 bg-subtle rounded-[4px]" />
        <div className="w-20 h-20 bg-subtle rounded-[4px]" />
      </div>
    </div>
  );
}

export function PhotoGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="aspect-square bg-subtle rounded-[4px] animate-pulse" />
      ))}
    </div>
  );
}

export function CommentSkeleton() {
  return (
    <div className="bg-surface rounded-[4px] border border-line p-5 animate-pulse">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-subtle" />
          <div>
            <div className="h-4 bg-subtle rounded w-32 mb-1" />
            <div className="h-3 bg-subtle rounded w-20" />
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-4 bg-subtle rounded w-full" />
        <div className="h-4 bg-subtle rounded w-5/6" />
        <div className="h-4 bg-subtle rounded w-4/6" />
      </div>
    </div>
  );
}

export function FullPageLoader({ message }: { message?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-canvas">
      <LoadingSpinner size="lg" />
      {message && <p className="mt-4 text-sm text-body">{message}</p>}
    </div>
  );
}

export function InlineLoader({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8">
      <LoadingSpinner size="md" />
      {message && <p className="mt-3 text-sm text-body">{message}</p>}
    </div>
  );
}

// Sits inside a filled (usually red) primary button, so the mark must read
// white-on-red rather than red-on-red.
export function ButtonLoader() {
  return <XSpinner size={16} tone="current" label={null} />;
}
