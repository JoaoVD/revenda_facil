'use client';
import { useEffect, useRef, useState } from 'react';

async function post(action: string, data: Record<string, unknown>) {
  const response = await fetch('/api/push', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...data }),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.message || 'Não foi possível configurar as notificações.',
    );
  return result;
}
async function registration() {
  await navigator.serviceWorker.register('/sw.js');
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                'Reabra o sistema online para preparar as notificações.',
              ),
            ),
          15000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}
function applicationKey(value: string) {
  return Uint8Array.from(
    atob(value.replace(/-/g, '+').replace(/_/g, '/')),
    (c) => c.charCodeAt(0),
  );
}
export function PushSettings() {
  const [message, setMessage] = useState(
    'Verificando notificações deste aparelho…',
  );
  const [publicKey, setKey] = useState('');
  const [active, setActive] = useState(false);
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  useEffect(() => {
    let stopped = false;
    async function load() {
      const ios =
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      if (
        ios &&
        !window.matchMedia('(display-mode: standalone)').matches &&
        !(navigator as Navigator & { standalone?: boolean }).standalone
      ) {
        setMessage(
          'No iPhone ou iPad: use Compartilhar → Adicionar à Tela de Início. Abra pelo ícone e volte aqui para ativar.',
        );
        return;
      }
      if (
        !window.isSecureContext ||
        !('serviceWorker' in navigator) ||
        !('PushManager' in window) ||
        !('Notification' in window)
      ) {
        setMessage(
          'Este navegador não oferece notificações aqui. Use um navegador compatível com conexão segura (HTTPS).',
        );
        return;
      }
      setSupported(true);
      try {
        const response = await fetch('/api/push', {
          cache: 'no-store',
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok)
          throw new Error(
            'Entre novamente ou confira a conexão para configurar as notificações.',
          );
        const config = await response.json();
        if (stopped) return;
        if (!config.configured || typeof config.publicKey !== 'string') {
          setMessage(
            'As notificações ainda precisam ser configuradas pelo responsável pelo sistema. Os avisos internos continuam disponíveis.',
          );
          return;
        }
        setKey(config.publicKey);
        const reg = await registration();
        const sub = await reg.pushManager.getSubscription();
        const enabled =
          sub && Notification.permission === 'granted'
            ? (await post('status', { endpoint: sub.endpoint })).active === true
            : false;
        if (!stopped) {
          setActive(enabled);
          setMessage(
            Notification.permission === 'denied'
              ? 'Notificações bloqueadas. Permita nas configurações do navegador ou aparelho e reabra esta tela.'
              : enabled
                ? 'Notificações ativadas neste aparelho.'
                : 'Ative para receber os lembretes neste aparelho.',
          );
        }
      } catch (error) {
        if (!stopped)
          setMessage(
            error instanceof Error
              ? error.message
              : 'Não foi possível verificar as notificações.',
          );
      }
    }
    void load();
    return () => {
      stopped = true;
    };
  }, []);

  async function act(action: 'enable' | 'disable' | 'test') {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      // Solicitar diretamente no clique, antes de aguardar rede ou service worker.
      if (action === 'enable') {
        const permission =
          Notification.permission === 'granted'
            ? 'granted'
            : await Notification.requestPermission();
        if (permission !== 'granted')
          throw new Error(
            'Permissão não concedida. Você pode ativar depois nas configurações do navegador.',
          );
      }
      const reg = await registration();
      let sub = await reg.pushManager.getSubscription();
      if (action === 'enable') {
        if (sub) {
          const owned = await post('status', { endpoint: sub.endpoint });
          const oldKey = sub.options.applicationServerKey;
          if (
            !owned.active ||
            !oldKey ||
            new Uint8Array(oldKey).toString() !==
              applicationKey(publicKey).toString()
          ) {
            await post('unsubscribe', { endpoint: sub.endpoint });
            if (!(await sub.unsubscribe()))
              throw new Error(
                'Não foi possível renovar a inscrição. Tente novamente.',
              );
            sub = null;
          }
        }
        sub ||= await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationKey(publicKey),
        });
        await post('subscribe', { subscription: sub.toJSON() });
        setActive(true);
        setMessage(
          'Notificações ativadas neste aparelho. Envie um teste para conferir.',
        );
      } else if (action === 'disable') {
        // Remover no servidor antes de descartar o endpoint local, para permitir retry.
        if (sub) {
          await post('unsubscribe', { endpoint: sub.endpoint });
          await sub.unsubscribe();
        }
        setActive(false);
        setMessage(
          'Notificações desativadas neste aparelho. Os avisos dentro do sistema continuam disponíveis.',
        );
      } else {
        if (Notification.permission !== 'granted') {
          setActive(false);
          throw new Error(
            'Permita as notificações nas configurações deste aparelho e ative novamente.',
          );
        }
        if (!sub)
          throw new Error(
            'Ative as notificações neste aparelho antes de testar.',
          );
        const result = await post('test', { endpoint: sub.endpoint });
        setMessage(result.message);
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível concluir. Tente novamente.',
      );
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="stack" aria-label="Notificações neste aparelho">
      <h3>Notificações neste aparelho</h3>
      <p role="status" aria-live="polite">
        {message}
      </p>
      {supported && (
        <div className="ux-actions">
          <button
            type="button"
            className="button"
            disabled={busy || !publicKey}
            onClick={() => void act('enable')}
          >
            {busy
              ? 'Aguarde…'
              : active
                ? 'Conferir ativação neste aparelho'
                : 'Ativar notificações neste aparelho'}
          </button>
          <button
            type="button"
            className="small-button"
            disabled={busy || !active}
            onClick={() => void act('test')}
          >
            Enviar notificação de teste
          </button>
          <button
            type="button"
            className="small-button"
            disabled={busy}
            onClick={() => void act('disable')}
          >
            Desativar neste aparelho
          </button>
        </div>
      )}
      <p className="hint">
        A data e o horário seguem o lembrete salvo acima. O alerta não mostra
        nomes nem valores na tela bloqueada. A entrega pode atrasar conforme
        conexão e configurações do aparelho.
      </p>
    </section>
  );
}
