import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <section className="panel mx-auto my-16 max-w-xl p-10 text-center">
      <p className="eyebrow text-primary">404 · Outside the workspace</p>
      <h1 className="mt-4 text-3xl font-semibold">This page is not available.</h1>
      <p className="mt-4 text-muted-foreground">Return to your overview to continue building.</p>
      <Button asChild className="mt-7 h-11 gap-2">
        <Link to="/">
          <ArrowLeft size={16} />
          Back to overview
        </Link>
      </Button>
    </section>
  );
}
