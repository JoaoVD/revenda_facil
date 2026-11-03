import { OfflineWorkspace } from '@/modules/sync/offline-workspace';
// Estrutura pública sem dados pessoais no HTML/cache. Dados vêm de IndexedDB
// particionado após autenticação online, nunca de props de servidor em cache.
export default function DeviceWorkspace() {
  return <OfflineWorkspace />;
}
