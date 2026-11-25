import { NoticeFeed } from "@/components/notice-board";
import { getPool } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function PublicNoticesPage({
  searchParams,
}: {
  searchParams: Promise<{ instituteId?: string | string[] }>;
}) {
  const query = await searchParams;
  const requestedId = Array.isArray(query.instituteId) ? query.instituteId[0] : query.instituteId;
  const instituteId = requestedId && UUID.test(requestedId) ? requestedId : "";
  const institute = instituteId
    ? await getPool().query<{ name: string }>(
      "SELECT name FROM public.institutes WHERE id = $1",
      [instituteId],
    )
    : null;
  const instituteName = institute?.rows[0]?.name;

  return (
    <main className="public-notices-page">
      <header className="public-notices-header">
        <Link className="public-notices-brand" href="/"><span className="brand-mark"><span>AM</span></span><span><strong>AMRPI</strong><small>PUBLIC NOTICE BOARD</small></span></Link>
        {instituteName && <span className="public-institute-name">{instituteName}</span>}
      </header>
      <div className="public-notices-content">
        {instituteId && instituteName
          ? <NoticeFeed instituteId={instituteId} title="Official notices" subtitle={`Published announcements from ${instituteName}.`} />
          : <section className="panel public-notices-unavailable"><h1>Notice board unavailable</h1><p>Open the public notice board using the institute’s shared notice-board link.</p></section>}
      </div>
    </main>
  );
}
