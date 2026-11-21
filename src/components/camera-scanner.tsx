'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';

/** Códigos aceitos em cada uso: chave da nota ou embalagem do produto. */
const FORMATS = {
  invoice: ['code_128', 'qr_code'],
  product: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'],
} as const;
type Kind = keyof typeof FORMATS;

type Detector = {
  detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
};
type DetectorClass = {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats?: () => Promise<string[]>;
};

/**
 * Lê códigos pela câmera, tudo no próprio aparelho, sem serviço externo.
 * Usa o leitor nativo do navegador (Chrome/Android) e, quando não existe
 * (Safari/iPhone), carrega o ZXing sob demanda.
 * `accept` decide se o valor lido serve; a leitura continua até servir.
 */
export function CameraScanButton({
  kind,
  label = 'Ler com a câmera',
  title,
  accept = (value) => value.trim() !== '',
  onDetected,
}: {
  kind: Kind;
  label?: string;
  title: string;
  accept?: (value: string) => boolean;
  onDetected: (value: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('');
  // Mantém os callbacks atuais sem reiniciar a câmera a cada renderização.
  const handlers = useRef({ accept, onDetected });
  useEffect(() => {
    handlers.current = { accept, onDetected };
  });

  useEffect(() => {
    if (!open) return;
    const element = video.current;
    if (!element) return;
    let stopped = false;
    let stopScanner = () => {};

    const finish = (value: string) => {
      if (stopped || !handlers.current.accept(value)) return false;
      stopped = true;
      stopScanner();
      setOpen(false);
      handlers.current.onDetected(value);
      return true;
    };

    async function start(target: HTMLVideoElement) {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus(
          'A câmera não está disponível neste navegador. Use o leitor ou digite o código.',
        );
        return;
      }
      setStatus('Aponte a câmera para o código.');
      const formats = [...FORMATS[kind]];
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      };
      const Native = (window as unknown as { BarcodeDetector?: DetectorClass })
        .BarcodeDetector;
      const supported = Native
        ? await Native.getSupportedFormats?.().catch(() => [])
        : [];
      if (Native && formats.every((format) => supported?.includes(format))) {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        stopScanner = () => stream.getTracks().forEach((track) => track.stop());
        if (stopped) return stopScanner();
        target.srcObject = stream;
        await target.play();
        const detector = new Native({ formats });
        const tick = async () => {
          if (stopped) return;
          try {
            const codes = await detector.detect(target);
            if (codes.some((code) => finish(code.rawValue))) return;
          } catch {
            // Quadro ainda sem imagem: tenta no próximo.
          }
          window.setTimeout(tick, 150);
        };
        void tick();
        return;
      }
      const [{ BrowserMultiFormatReader }, library] = await Promise.all([
        import('@zxing/browser'),
        import('@zxing/library'),
      ]);
      const names: Record<string, keyof typeof library.BarcodeFormat> = {
        code_128: 'CODE_128',
        qr_code: 'QR_CODE',
        ean_13: 'EAN_13',
        ean_8: 'EAN_8',
        upc_a: 'UPC_A',
        upc_e: 'UPC_E',
      };
      const hints = new Map<unknown, unknown>([
        [
          library.DecodeHintType.POSSIBLE_FORMATS,
          formats.map((format) => library.BarcodeFormat[names[format]]),
        ],
        [library.DecodeHintType.TRY_HARDER, true],
      ]);
      const reader = new BrowserMultiFormatReader(hints as Map<never, unknown>);
      const controls = await reader.decodeFromConstraints(
        constraints,
        target,
        (result) => {
          if (result) finish(result.getText());
        },
      );
      stopScanner = () => controls.stop();
      if (stopped) stopScanner();
    }

    start(element).catch((error: unknown) => {
      if (stopped) return;
      setStatus(
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'Permita o uso da câmera nas configurações do navegador para ler o código.'
          : 'Não foi possível abrir a câmera. Use o leitor ou digite o código.',
      );
    });
    return () => {
      stopped = true;
      stopScanner();
      element.srcObject = null;
    };
  }, [open, kind]);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="small-button"
        onClick={() => {
          setStatus('');
          setOpen(true);
        }}
      >
        <Camera size={17} aria-hidden="true" />
        {label}
      </button>
      <dialog
        ref={dialog}
        className="ux-action-dialog scanner-dialog"
        aria-label={title}
        onClose={() => setOpen(false)}
      >
        <div className="section-heading">
          <h2>{title}</h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="Fechar câmera"
            onClick={() => setOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        {open && (
          <>
            <div className="scanner-frame" data-kind={kind}>
              <video ref={video} muted playsInline aria-hidden="true" />
              <span className="scanner-guide" aria-hidden="true" />
            </div>
            <p role="status" className="hint">
              {status}
            </p>
          </>
        )}
      </dialog>
    </>
  );
}
