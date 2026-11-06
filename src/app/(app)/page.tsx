import MyDay from './meu-dia/page';
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  return <MyDay searchParams={searchParams} />;
}
