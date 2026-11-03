import Dashboard from './dashboard/page';
import MyDay from './meu-dia/page';
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; type?: string; filter?: string }>;
}) {
  return (
    <>
      <div className="desktop-start">
        <Dashboard searchParams={searchParams} />
      </div>
      <div className="mobile-start">
        <MyDay searchParams={searchParams} />
      </div>
    </>
  );
}
